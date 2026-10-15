import datetime
from decimal import Decimal
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

from django.core.cache import cache
from django.core.management import CommandError, call_command
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Family, User
from catalogs.models import Currency

from . import services
from .models import ExchangeRate
from .sources import SourceError, parse_bcv_page

BCV_PAGE = Path(__file__).parent / "test_data" / "bcv_page.html"

# Octubre de 2026: el 12 (lunes) fue feriado en Venezuela.
THURSDAY = datetime.date(2026, 10, 8)
FRIDAY = datetime.date(2026, 10, 9)
SATURDAY = datetime.date(2026, 10, 10)
HOLIDAY = datetime.date(2026, 10, 12)
TUESDAY = datetime.date(2026, 10, 13)
WEDNESDAY = datetime.date(2026, 10, 14)


def at_noon(day):
    return datetime.datetime.combine(day, datetime.time(12), tzinfo=ZoneInfo("America/Caracas"))


def rates(usd, eur):
    return {"USD": Decimal(usd), "EUR": Decimal(eur)}


class RatesTestCase(TestCase):
    """Ninguna prueba sale a internet: el BCV y DolarAPI se simulan."""

    def setUp(self):
        cache.clear()  # ahí se guarda la pausa tras un fallo del BCV
        self.read_bcv = self.patch("rates.sources.read_bcv")
        self.read_history = self.patch("rates.sources.read_history")
        self.patch("rates.services.logger")  # los avisos de fallo no ensucian la salida
        # Por defecto, las dos fuentes están caídas.
        self.read_bcv.side_effect = SourceError("BCV caído")
        self.read_history.side_effect = SourceError("DolarAPI caído")

    def patch(self, target, **kwargs):
        patcher = mock.patch(target, **kwargs)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def on_day(self, day):
        """Hace que "ahora" sea el mediodía de `day` en Venezuela."""
        self.patch("django.utils.timezone.now", return_value=at_noon(day))

    def bcv_publishes(self, day, usd="877.90", eur="982.76"):
        self.read_bcv.side_effect = None
        self.read_bcv.return_value = (day, rates(usd, eur))

    def history_has(self, history):
        self.read_history.side_effect = None
        self.read_history.return_value = history

    def store(self, day, usd, eur, source=ExchangeRate.BCV, fetched_on=None):
        for code, value in rates(usd, eur).items():
            ExchangeRate.objects.create(
                currency=Currency.objects.get(code=code),
                date=day,
                bs_per_unit=value,
                source=source,
                fetched_at=at_noon(fetched_on or day),
            )

    def stored(self, day, code="USD"):
        return ExchangeRate.objects.get(date=day, currency__code=code)


class BcvPageTests(TestCase):
    def test_reads_rates_and_value_date_from_a_saved_copy(self):
        date, values = parse_bcv_page(BCV_PAGE.read_text(encoding="utf-8"))
        self.assertEqual(date, WEDNESDAY)
        self.assertEqual(values["USD"], Decimal("877.90230000"))
        self.assertEqual(values["EUR"], Decimal("982.75895071"))

    def test_a_changed_page_is_an_error(self):
        with self.assertRaises(SourceError):
            parse_bcv_page("<html><body>Página en mantenimiento</body></html>")


class TodayRateTests(RatesTestCase):
    def test_first_request_of_the_day_reads_the_bcv_only_once(self):
        self.on_day(WEDNESDAY)
        self.bcv_publishes(WEDNESDAY)
        self.history_has({})

        first = services.today_rate()
        services.today_rate()

        self.assertEqual(self.read_bcv.call_count, 1)
        self.assertEqual(first.status, services.TodayRate.CURRENT)
        self.assertEqual(first.bs_per_unit["USD"], Decimal("877.90"))
        self.assertEqual(first.bs_per_unit["VES"], Decimal("1"))

    def test_the_bcv_is_also_read_on_weekends(self):
        self.store(FRIDAY, "875.65", "980.00")
        self.on_day(SATURDAY)
        self.bcv_publishes(TUESDAY)

        services.today_rate()

        self.assertEqual(self.read_bcv.call_count, 1)

    def test_when_the_bcv_fails_the_last_rate_is_used_and_not_retried_at_once(self):
        self.store(TUESDAY, "876.80", "981.00")
        self.on_day(WEDNESDAY)

        rate = services.today_rate()
        services.today_rate()

        self.assertEqual(rate.status, services.TodayRate.OUTDATED)
        self.assertEqual(rate.date, TUESDAY)
        self.assertEqual(self.read_bcv.call_count, 1)

        cache.delete(services.FAILURE_KEY)  # pasaron los 15 minutos
        services.today_rate()
        self.assertEqual(self.read_bcv.call_count, 2)

    def test_tomorrows_rate_is_saved_but_not_used_yet(self):
        self.store(TUESDAY, "876.80", "981.00", fetched_on=HOLIDAY)
        self.on_day(TUESDAY)
        self.bcv_publishes(WEDNESDAY, usd="877.90")

        rate = services.today_rate()

        self.assertEqual(rate.date, TUESDAY)
        self.assertEqual(rate.bs_per_unit["USD"], Decimal("876.80"))
        self.assertTrue(ExchangeRate.objects.filter(date=WEDNESDAY).exists())

    def test_saturday_uses_fridays_rate_even_if_nobody_opened_the_app_on_friday(self):
        self.store(THURSDAY, "874.73", "979.00")
        self.on_day(SATURDAY)
        # El sábado la página del BCV ya muestra la tasa del martes.
        self.bcv_publishes(TUESDAY)
        self.history_has(
            {
                THURSDAY: rates("1.00", "1.00"),
                FRIDAY: rates("875.6505", "980.10"),
            }
        )

        rate = services.today_rate()

        self.assertEqual(rate.status, services.TodayRate.PREVIOUS_BUSINESS_DAY)
        self.assertEqual(rate.date, FRIDAY)
        self.assertEqual(rate.bs_per_unit["USD"], Decimal("875.6505"))
        self.assertEqual(self.stored(FRIDAY).source, ExchangeRate.DOLARAPI)
        # El relleno nunca pisa una tasa leída del BCV.
        self.assertEqual(self.stored(THURSDAY).bs_per_unit, Decimal("874.73"))
        self.assertEqual(self.stored(THURSDAY).source, ExchangeRate.BCV)

    def test_if_the_fill_fails_it_is_retried_the_same_day(self):
        self.store(THURSDAY, "874.73", "979.00")
        self.on_day(SATURDAY)
        self.bcv_publishes(TUESDAY)
        self.assertEqual(services.today_rate().date, THURSDAY)  # DolarAPI caído

        self.history_has({FRIDAY: rates("875.65", "980.10")})
        services.today_rate()  # antes de 15 minutos: no se reintenta
        self.assertEqual(self.read_history.call_count, 1)

        cache.delete(services.FILL_FAILED_KEY)  # pasaron los 15 minutos
        rate = services.today_rate()

        self.assertEqual(rate.date, FRIDAY)
        self.assertEqual(self.read_bcv.call_count, 1)

    def test_a_holiday_without_rate_breaks_nothing(self):
        self.store(FRIDAY, "875.65", "980.00")
        self.on_day(HOLIDAY)
        self.bcv_publishes(TUESDAY)
        self.history_has({FRIDAY: rates("875.65", "980.00")})  # el 12 no tiene tasa

        rate = services.today_rate()

        self.assertEqual(rate.status, services.TodayRate.PREVIOUS_BUSINESS_DAY)
        self.assertEqual(rate.date, FRIDAY)
        self.assertFalse(ExchangeRate.objects.filter(date=HOLIDAY).exists())

    def test_if_dolarapi_also_fails_everything_else_still_works(self):
        self.on_day(WEDNESDAY)
        self.bcv_publishes(WEDNESDAY)

        rate = services.today_rate()

        self.assertEqual(rate.status, services.TodayRate.CURRENT)

    def test_without_any_rate_the_status_is_missing(self):
        self.on_day(WEDNESDAY)

        rate = services.today_rate()

        self.assertEqual(rate.status, services.TodayRate.MISSING)
        self.assertIsNone(rate.date)


class ConversionTests(TestCase):
    rate = services.TodayRate(
        date=WEDNESDAY,
        status=services.TodayRate.CURRENT,
        bs_per_unit={"USD": Decimal("400"), "EUR": Decimal("440"), "VES": Decimal("1")},
    )

    def test_bolivars_to_dollars(self):
        self.assertEqual(self.rate.to_usd(Decimal("1000.00"), "VES"), Decimal("2.50"))

    def test_euros_go_through_the_bolivar_and_round_half_up(self):
        # 7,77 € = 3.418,80 Bs. = 8,547 $ -> 8,55 $
        self.assertEqual(self.rate.to_usd(Decimal("7.77"), "EUR"), Decimal("8.55"))
        self.assertEqual(self.rate.from_usd(Decimal("11.00"), "EUR"), Decimal("10.00"))


class FetchCommandTests(RatesTestCase):
    def test_reads_the_bcv_even_if_it_was_already_read_today(self):
        self.on_day(WEDNESDAY)
        self.bcv_publishes(WEDNESDAY)
        services.today_rate()

        call_command("fetch_bcv_rates", stdout=mock.Mock())

        self.assertEqual(self.read_bcv.call_count, 2)

    def test_fails_loudly_when_the_bcv_does_not_answer(self):
        with self.assertRaises(CommandError):
            call_command("fetch_bcv_rates", stdout=mock.Mock())


class CurrentRateApiTests(RatesTestCase):
    def setUp(self):
        super().setUp()
        family = Family.objects.create(name="Familia Pérez")
        self.user = User.objects.create_user(
            email="lector@perez.com",
            password="clave-Segura-2026",
            full_name="Ana Pérez",
            family=family,
            role=User.Role.VIEWER,
        )
        self.client = APIClient()
        self.on_day(WEDNESDAY)

    def test_any_member_gets_todays_rate(self):
        self.bcv_publishes(WEDNESDAY)
        self.history_has({})
        self.client.force_login(self.user)

        response = self.client.get("/api/rates/current/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["date"], "2026-10-14")
        self.assertEqual(response.data["status"], "current")
        self.assertEqual(
            response.data["rates"],
            [
                {"currency": "USD", "bs_per_unit": "877.90000000"},
                {"currency": "EUR", "bs_per_unit": "982.76000000"},
            ],
        )

    def test_without_any_rate_it_answers_missing(self):
        self.client.force_login(self.user)

        response = self.client.get("/api/rates/current/")

        self.assertEqual(response.data, {"date": None, "status": "missing", "rates": []})

    def test_needs_a_session(self):
        self.assertEqual(self.client.get("/api/rates/current/").status_code, 401)
