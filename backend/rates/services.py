"""
La tasa de hoy: cuándo se consulta al BCV, cómo se rellenan los días que
faltan y cómo se convierte entre monedas (spec 005).
"""
import datetime
import logging
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from django.core.cache import cache
from django.db.models import Count
from django.utils import timezone

from catalogs.models import Currency

from . import sources
from .models import ExchangeRate, UsdQuote

logger = logging.getLogger(__name__)

BASE_CODE = "USD"  # en esta moneda se guardan todos los montos
BOLIVAR_CODE = "VES"  # las tasas se expresan en bolívares: el bolívar vale 1
CENT = Decimal("0.01")

# Tras un fallo del BCV no se reintenta enseguida, para que una caída no
# haga lentas todas las pantallas.
FAILURE_KEY = "rates:bcv-failed"
RETRY_AFTER_SECONDS = 15 * 60
# Cuántos días hacia atrás se revisan para rellenar huecos.
GAP_DAYS = 7
# Si DolarAPI falla al rellenar, se reintenta (como mucho cada 15 minutos)
# aunque el BCV ya se haya leído hoy.
FILL_PENDING_KEY = "rates:fill-pending"
FILL_FAILED_KEY = "rates:fill-failed"

NO_RATE_MESSAGE = "Todavía no hay tasa del BCV; usa dólares."

# Peso chileno (spec 013): se cotiza contra el dólar, no lo publica el BCV.
CLP_CODE = "CLP"
QUOTE_FAILURE_KEY = "rates:clp-failed"
# Mismos 8 decimales con que se guardan las tasas del BCV.
RATE_PLACES = Decimal("0.00000001")


@dataclass
class TodayRate:
    """La tasa que se usa hoy y en qué estado está (sección 2.3 de la spec)."""

    CURRENT = "current"
    PREVIOUS_BUSINESS_DAY = "previous_business_day"
    OUTDATED = "outdated"
    MISSING = "missing"

    date: datetime.date | None
    status: str
    bs_per_unit: dict  # código de moneda -> bolívares por unidad
    # Monedas cotizadas contra el dólar (spec 013): código -> UsdQuote usada.
    quotes: dict = field(default_factory=dict)

    def to_usd(self, amount, code):
        """Monto en la moneda `code` -> monto en USD, redondeado a céntimos."""
        usd = amount * self.bs_per_unit[code] / self.bs_per_unit[BASE_CODE]
        return usd.quantize(CENT, rounding=ROUND_HALF_UP)

    def from_usd(self, amount, code):
        """Monto en USD -> monto en la moneda `code`, redondeado a céntimos."""
        converted = amount * self.bs_per_unit[BASE_CODE] / self.bs_per_unit[code]
        return converted.quantize(CENT, rounding=ROUND_HALF_UP)


def bcv_checked_today():
    today = timezone.localdate()
    return ExchangeRate.objects.filter(
        source=ExchangeRate.BCV, fetched_at__date=today
    ).exists()


def save_rates(date, rates, source):
    """Guarda las tasas de un día. Las de DolarAPI nunca pisan una que ya exista."""
    now = timezone.now()
    for code, value in rates.items():
        currency = Currency.objects.get(code=code)
        fields = {"bs_per_unit": value, "source": source, "fetched_at": now}
        if source == ExchangeRate.BCV:
            ExchangeRate.objects.update_or_create(currency=currency, date=date, defaults=fields)
        else:
            ExchangeRate.objects.get_or_create(currency=currency, date=date, defaults=fields)


def missing_weekdays():
    """Días de lunes a viernes de la última semana que no tienen tasa guardada."""
    today = timezone.localdate()
    days = [today - datetime.timedelta(days=n) for n in range(GAP_DAYS)]
    weekdays = [day for day in days if day.weekday() < 5]  # 5 y 6: sábado y domingo
    stored = set(
        ExchangeRate.objects.filter(currency__code=BASE_CODE, date__in=weekdays).values_list(
            "date", flat=True
        )
    )
    return [day for day in weekdays if day not in stored]


def fill_gaps():
    """Rellena con el histórico de DolarAPI los días hábiles que falten.

    Si un día tampoco está en el histórico, fue feriado y no tiene tasa.
    """
    missing = missing_weekdays()
    if not missing:
        return
    try:
        history = sources.read_history()
    except sources.SourceError as error:
        logger.warning("No se pudieron rellenar las tasas que faltan: %s", error)
        cache.set(FILL_PENDING_KEY, True, 24 * 60 * 60)
        cache.set(FILL_FAILED_KEY, True, RETRY_AFTER_SECONDS)
        return
    cache.delete(FILL_PENDING_KEY)
    for day in missing:
        rates = history.get(day, {})
        if set(rates) == set(sources.BCV_BLOCKS):
            save_rates(day, rates, ExchangeRate.DOLARAPI)


def update_rates(force=False):
    """Consulta el BCV si hoy todavía no se ha hecho. Devuelve si lo consiguió."""
    if not force and bcv_checked_today():
        if cache.get(FILL_PENDING_KEY) and not cache.get(FILL_FAILED_KEY):
            fill_gaps()  # el relleno falló antes: se reintenta
        return False
    if not force and cache.get(FAILURE_KEY):
        return False
    try:
        date, rates = sources.read_bcv()
    except sources.SourceError as error:
        logger.warning("No se pudo leer la tasa del BCV: %s", error)
        cache.set(FAILURE_KEY, True, RETRY_AFTER_SECONDS)
        return False
    save_rates(date, rates, ExchangeRate.BCV)
    fill_gaps()
    return True


def clp_checked_today():
    """Hoy ya se leyó el dólar observado (el respaldo no cuenta: se reintenta)."""
    return UsdQuote.objects.filter(
        source=UsdQuote.MINDICADOR, fetched_at__date=timezone.localdate()
    ).exists()


def save_quote(currency, date, value, source):
    """El dólar observado siempre se guarda; el respaldo nunca pisa una tasa que ya exista."""
    fields = {"units_per_usd": value, "source": source, "fetched_at": timezone.now()}
    if source == UsdQuote.MINDICADOR:
        UsdQuote.objects.update_or_create(currency=currency, date=date, defaults=fields)
    else:
        UsdQuote.objects.get_or_create(currency=currency, date=date, defaults=fields)


def update_quotes(force=False):
    """Lee el peso chileno si hoy todavía no se ha hecho. Devuelve si lo consiguió.

    Primero mindicador.cl; si falla, open.er-api.com. Si las dos fallan, queda
    la última tasa guardada (sección 2.0 de la spec 013).
    """
    if not force and (clp_checked_today() or cache.get(QUOTE_FAILURE_KEY)):
        return False
    currency = Currency.objects.get(code=CLP_CODE)
    try:
        for date, value in sources.read_clp().items():
            save_quote(currency, date, value, UsdQuote.MINDICADOR)
        return True
    except sources.SourceError as error:
        logger.warning("No se pudo leer el dólar observado: %s", error)
    # Se reintenta mindicador dentro de 15 minutos, haya funcionado o no el respaldo.
    cache.set(QUOTE_FAILURE_KEY, True, RETRY_AFTER_SECONDS)
    try:
        date, value = sources.read_clp_backup()
    except sources.SourceError as error:
        logger.warning("Tampoco se pudo leer el respaldo del peso chileno: %s", error)
        return False
    save_quote(currency, date, value, UsdQuote.ER_API)
    return True


def add_quotes(bs_per_unit, today):
    """Pasa a bolívares las monedas cotizadas contra el dólar, con el dólar del BCV.

    Bs. por 1 CLP = (Bs. por 1 USD) / (CLP por 1 USD). Devuelve las cotizaciones usadas.
    """
    quote = (
        UsdQuote.objects.filter(currency__code=CLP_CODE, date__lte=today)
        .select_related("currency")
        .first()  # ordenadas de la más reciente a la más antigua
    )
    if quote is None:
        return {}
    value = bs_per_unit[BASE_CODE] / quote.units_per_usd
    bs_per_unit[CLP_CODE] = value.quantize(RATE_PLACES, rounding=ROUND_HALF_UP)
    return {CLP_CODE: quote}


def latest_complete_date(today):
    """El día más reciente, hasta hoy, que tiene la tasa de todas las monedas."""
    row = (
        ExchangeRate.objects.filter(date__lte=today)
        .values("date")
        .annotate(currencies=Count("id"))
        .filter(currencies=len(sources.BCV_BLOCKS))
        .order_by("-date")
        .first()
    )
    return row["date"] if row else None


def today_rate():
    """La tasa que rige hoy. Antes, si hace falta, consulta al BCV y el peso chileno."""
    update_rates()
    update_quotes()
    today = timezone.localdate()
    date = latest_complete_date(today)
    if date is None:
        return TodayRate(date=None, status=TodayRate.MISSING, bs_per_unit={})

    bs_per_unit = {
        rate.currency.code: rate.bs_per_unit
        for rate in ExchangeRate.objects.filter(date=date).select_related("currency")
    }
    bs_per_unit[BOLIVAR_CODE] = Decimal("1")
    quotes = add_quotes(bs_per_unit, today)

    if not bcv_checked_today():
        status = TodayRate.OUTDATED
    elif date == today:
        status = TodayRate.CURRENT
    else:
        status = TodayRate.PREVIOUS_BUSINESS_DAY  # fin de semana o feriado
    return TodayRate(date=date, status=status, bs_per_unit=bs_per_unit, quotes=quotes)


def rate_data(rate):
    """La tasa como la devuelve la API.

    Las monedas cotizadas contra el dólar traen además su propia fecha, su
    fuente y cuántas unidades vale 1 USD.
    """
    rates = [
        {"currency": code, "bs_per_unit": str(rate.bs_per_unit[code])}
        for code in sources.BCV_BLOCKS
        if code in rate.bs_per_unit
    ]
    for code, quote in rate.quotes.items():
        rates.append(
            {
                "currency": code,
                "bs_per_unit": str(rate.bs_per_unit[code]),
                "units_per_usd": str(quote.units_per_usd),
                "date": quote.date.isoformat(),
                "source": quote.source,
            }
        )
    return {
        "date": rate.date.isoformat() if rate.date else None,
        "status": rate.status,
        "rates": rates,
    }
