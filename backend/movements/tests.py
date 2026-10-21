import csv
import datetime
import io
import os
from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Family, User
from catalogs.defaults import create_default_catalogs
from catalogs.models import Category, Currency, PaymentMethod

from rates.models import ExchangeRate, UsdQuote
from rates.sources import SourceError

from . import export
from .models import Movement

PASSWORD = "clave-Segura-2026"


class BaseTestCase(TestCase):
    """Dos familias con sus catálogos, para comprobar que no se mezclan."""

    def setUp(self):
        cache.clear()  # el rate limit guarda sus contadores en la caché
        # Las pruebas nunca salen a internet: el BCV y DolarAPI "no responden".
        patcher = mock.patch("rates.sources.download", side_effect=SourceError("sin red"))
        patcher.start()
        self.addCleanup(patcher.stop)
        quiet = mock.patch("rates.services.logger")
        quiet.start()
        self.addCleanup(quiet.stop)
        self.today = timezone.localdate()
        self.family = self.make_family("Familia Pérez")
        self.other_family = self.make_family("Familia Rojas")
        self.admin = self.make_user("admin@perez.com", User.Role.ADMIN)
        self.editor = self.make_user("editor@perez.com", User.Role.EDITOR)
        self.viewer = self.make_user("lector@perez.com", User.Role.VIEWER)
        self.outsider = self.make_user("admin@rojas.com", User.Role.ADMIN, self.other_family)
        self.client = self.client_for(self.admin)

    def make_family(self, name):
        family = Family.objects.create(name=name)
        create_default_catalogs(family)
        return family

    def make_user(self, email, role, family=None):
        return User.objects.create_user(
            email=email,
            password=PASSWORD,
            full_name=email,
            family=family or self.family,
            role=role,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_login(user)
        return client

    def category(self, name, family=None):
        return Category.objects.get(family=family or self.family, name=name)

    def payment_method(self, name, family=None):
        return PaymentMethod.objects.get(family=family or self.family, name=name)

    def payload(self, **changes):
        """Datos válidos de un gasto; cada prueba cambia lo que necesita."""
        data = {
            "category": self.category("Alimentación").id,
            "payment_method": self.payment_method("Efectivo").id,
            "amount": "45.30",
            "date": self.today.isoformat(),
            "description": "Mercado",
        }
        data.update(changes)
        return data

    def make_movement(
        self, category="Alimentación", amount="10.00", user=None, date=None, method="Efectivo"
    ):
        user = user or self.admin
        return Movement.objects.create(
            family=user.family,
            category=self.category(category, user.family),
            payment_method=self.payment_method(method, user.family),
            amount=Decimal(amount),
            original_amount=Decimal(amount),
            original_currency=Currency.objects.get(code="USD"),
            date=date or self.today,
            created_by=user,
        )

    def make_clp_movement(
        self, original_amount, category="Alimentación", user=None, date=None, method="Efectivo"
    ):
        user = user or self.admin
        quote = UsdQuote.objects.get(currency__code="CLP")
        amount_usd = (Decimal(original_amount) / quote.units_per_usd).quantize(Decimal("0.01"))
        return Movement.objects.create(
            family=user.family,
            category=self.category(category, user.family),
            payment_method=self.payment_method(method, user.family),
            amount=amount_usd,
            original_amount=Decimal(original_amount),
            original_currency=Currency.objects.get(code="CLP"),
            date=date or self.today,
            created_by=user,
        )

    def set_rate(self, usd, eur):
        """Guarda la tasa de hoy como leída del BCV: así no hace falta consultarlo."""
        for code, value in {"USD": usd, "EUR": eur}.items():
            ExchangeRate.objects.update_or_create(
                currency=Currency.objects.get(code=code),
                date=self.today,
                defaults={
                    "bs_per_unit": Decimal(value),
                    "source": ExchangeRate.BCV,
                    "fetched_at": timezone.now(),
                },
            )


class CreateTests(BaseTestCase):
    def test_admin_and_editor_create_income_and_expense(self):
        for user in (self.admin, self.editor):
            client = self.client_for(user)

            expense = client.post("/api/movements/", self.payload())
            income = client.post(
                "/api/movements/", self.payload(category=self.category("Salario").id)
            )

            self.assertEqual(expense.status_code, 201)
            self.assertEqual(expense.json()["movement_type"], "expense")
            self.assertEqual(expense.json()["amount"], "45.30")
            self.assertEqual(expense.json()["created_by"]["id"], user.id)
            self.assertEqual(income.status_code, 201)
            self.assertEqual(income.json()["movement_type"], "income")

        self.assertEqual(Movement.objects.filter(family=self.family).count(), 4)
        self.assertEqual(Movement.objects.filter(created_by=self.editor).count(), 2)

    def test_viewer_cannot_create_edit_or_delete(self):
        movement = self.make_movement()
        client = self.client_for(self.viewer)

        responses = [
            client.post("/api/movements/", self.payload()),
            client.patch(f"/api/movements/{movement.id}/", {"amount": "1.00"}),
            client.delete(f"/api/movements/{movement.id}/"),
        ]

        for response in responses:
            self.assertEqual(response.status_code, 403)
        self.assertEqual(Movement.objects.count(), 1)

    def test_invalid_amounts_are_rejected(self):
        for amount in ("0", "-5", "10.123", "10000000.00", "abc", ""):
            response = self.client.post("/api/movements/", self.payload(amount=amount))

            self.assertEqual(response.status_code, 400, amount)
            self.assertIn("amount", response.json())
        self.assertEqual(Movement.objects.count(), 0)

    def test_future_and_very_old_dates_are_rejected(self):
        tomorrow = self.today + datetime.timedelta(days=1)

        future = self.client.post("/api/movements/", self.payload(date=tomorrow.isoformat()))
        old = self.client.post("/api/movements/", self.payload(date="1999-12-31"))

        self.assertEqual(future.status_code, 400)
        self.assertEqual(future.json(), {"date": ["La fecha no puede ser futura."]})
        self.assertEqual(old.status_code, 400)
        self.assertIn("date", old.json())

    def test_category_must_exist_be_active_and_belong_to_the_family(self):
        inactive = self.category("Salud")
        inactive.is_active = False
        inactive.save()
        foreign = self.category("Alimentación", self.other_family)

        for category_id in (999999, inactive.id, foreign.id):
            response = self.client.post("/api/movements/", self.payload(category=category_id))

            self.assertEqual(response.status_code, 400)
            self.assertEqual(
                response.json(), {"category": ["Elige una categoría activa de tu familia."]}
            )

    def test_payment_method_must_exist_be_active_and_belong_to_the_family(self):
        inactive = self.payment_method("Zelle")
        inactive.is_active = False
        inactive.save()
        foreign = self.payment_method("Efectivo", self.other_family)

        for method_id in (999999, inactive.id, foreign.id):
            response = self.client.post(
                "/api/movements/", self.payload(payment_method=method_id)
            )

            self.assertEqual(response.status_code, 400)
            self.assertIn("payment_method", response.json())

    def test_description_is_optional(self):
        data = self.payload()
        del data["description"]

        response = self.client.post("/api/movements/", data)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["description"], "")


class ListTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        # Mes fijo en el pasado, para no depender del día en que corre la prueba.
        self.salary = self.make_movement("Salario", "1200.00", date=datetime.date(2025, 3, 1))
        self.food = self.make_movement("Alimentación", "45.30", date=datetime.date(2025, 3, 12))
        self.rent = self.make_movement(
            "Vivienda", "800.00", user=self.editor, date=datetime.date(2025, 3, 5)
        )
        self.february = self.make_movement("Salud", "20.00", date=datetime.date(2025, 2, 28))
        self.foreign = self.make_movement(
            "Alimentación", "999.00", user=self.outsider, date=datetime.date(2025, 3, 10)
        )

    def test_every_role_lists_the_month_from_newest_to_oldest(self):
        for user in (self.admin, self.editor, self.viewer):
            response = self.client_for(user).get("/api/movements/?month=2025-03")

            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["month"], "2025-03")
            self.assertEqual(
                [movement["id"] for movement in data["movements"]],
                [self.food.id, self.rent.id, self.salary.id],
            )

    def test_without_month_lists_the_current_month(self):
        today_movement = self.make_movement()

        data = self.client.get("/api/movements/").json()

        self.assertEqual(data["month"], self.today.strftime("%Y-%m"))
        self.assertEqual([movement["id"] for movement in data["movements"]], [today_movement.id])

    def test_totals_are_right_and_ignore_filters(self):
        expected = {"income": "1200.00", "expense": "845.30", "balance": "354.70"}

        for query in ("", "&type=expense", f"&category={self.food.category_id}"):
            data = self.client.get(f"/api/movements/?month=2025-03{query}").json()

            self.assertEqual(data["totals"], expected)

    def test_empty_month_has_zero_totals(self):
        data = self.client.get("/api/movements/?month=2024-01").json()

        self.assertEqual(data["movements"], [])
        self.assertEqual(data["totals"], {"income": "0.00", "expense": "0.00", "balance": "0.00"})

    def test_type_and_category_filters(self):
        expenses = self.client.get("/api/movements/?month=2025-03&type=expense").json()
        incomes = self.client.get("/api/movements/?month=2025-03&type=income").json()
        food = self.client.get(
            f"/api/movements/?month=2025-03&category={self.food.category_id}"
        ).json()

        self.assertEqual([m["id"] for m in expenses["movements"]], [self.food.id, self.rent.id])
        self.assertEqual([m["id"] for m in incomes["movements"]], [self.salary.id])
        self.assertEqual([m["id"] for m in food["movements"]], [self.food.id])

    def test_bad_filters_are_rejected(self):
        for query in ("month=2025-13", "month=marzo", "type=transfer", "category=abc"):
            response = self.client.get(f"/api/movements/?{query}")

            self.assertEqual(response.status_code, 400, query)

    def test_list_never_includes_another_family(self):
        data = self.client.get("/api/movements/?month=2025-03").json()
        # Ni pidiendo expresamente una categoría de la otra familia.
        by_category = self.client.get(
            f"/api/movements/?month=2025-03&category={self.foreign.category_id}"
        ).json()

        ids = [movement["id"] for movement in data["movements"]]
        self.assertNotIn(self.foreign.id, ids)
        self.assertEqual(by_category["movements"], [])

    def test_can_edit_depends_on_role_and_author(self):
        def flags(user):
            data = self.client_for(user).get("/api/movements/?month=2025-03").json()
            return {movement["id"]: movement["can_edit"] for movement in data["movements"]}

        self.assertEqual(flags(self.admin), {self.food.id: True, self.rent.id: True, self.salary.id: True})
        self.assertEqual(flags(self.editor), {self.food.id: False, self.rent.id: True, self.salary.id: False})
        self.assertEqual(flags(self.viewer), {self.food.id: False, self.rent.id: False, self.salary.id: False})


class EditAndDeleteTests(BaseTestCase):
    def test_admin_edits_and_deletes_any_movement_of_the_family(self):
        movement = self.make_movement(user=self.editor)
        url = f"/api/movements/{movement.id}/"

        edited = self.client.patch(
            url, {"amount": "99.99", "category": self.category("Salario").id}
        )

        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.json()["amount"], "99.99")
        # Al elegir una categoría de ingreso, el gasto pasa a ser ingreso.
        self.assertEqual(edited.json()["movement_type"], "income")
        # Quien lo anotó no cambia aunque lo corrija otro.
        self.assertEqual(edited.json()["created_by"]["id"], self.editor.id)

        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(Movement.objects.filter(pk=movement.id).exists())

    def test_editor_edits_and_deletes_only_own_movements(self):
        own = self.make_movement(user=self.editor)
        from_admin = self.make_movement(user=self.admin)
        client = self.client_for(self.editor)

        self.assertEqual(
            client.patch(f"/api/movements/{own.id}/", {"amount": "7.00"}).status_code, 200
        )
        self.assertEqual(
            client.patch(f"/api/movements/{from_admin.id}/", {"amount": "7.00"}).status_code, 403
        )
        self.assertEqual(client.delete(f"/api/movements/{from_admin.id}/").status_code, 403)
        self.assertEqual(client.delete(f"/api/movements/{own.id}/").status_code, 204)

        from_admin.refresh_from_db()
        self.assertEqual(from_admin.amount, Decimal("10.00"))

    def test_movement_of_another_family_is_not_found(self):
        foreign = self.make_movement(user=self.outsider)
        url = f"/api/movements/{foreign.id}/"

        self.assertEqual(self.client.patch(url, {"amount": "1.00"}).status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)

        foreign.refresh_from_db()
        self.assertEqual(foreign.amount, Decimal("10.00"))

    def test_edit_validates_like_create(self):
        movement = self.make_movement()
        foreign_category = self.category("Alimentación", self.other_family)
        url = f"/api/movements/{movement.id}/"

        responses = [
            self.client.patch(url, {"amount": "0"}),
            self.client.patch(url, {"category": foreign_category.id}),
            self.client.patch(url, {"date": "2999-01-01"}),
        ]

        for response in responses:
            self.assertEqual(response.status_code, 400)

    def test_old_movement_keeps_its_inactive_category(self):
        movement = self.make_movement("Salud")
        Category.objects.filter(family=self.family, name__in=["Salud", "Educación"]).update(
            is_active=False
        )
        url = f"/api/movements/{movement.id}/"

        # Corregir otro campo, reenviando la categoría que ya tenía: se permite.
        kept = self.client.patch(
            url, {"amount": "25.00", "category": movement.category_id}
        )
        # Pasarlo a otra categoría desactivada: no.
        changed = self.client.patch(url, {"category": self.category("Educación").id})

        self.assertEqual(kept.status_code, 200)
        self.assertEqual(kept.json()["amount"], "25.00")
        self.assertEqual(changed.status_code, 400)
        self.assertIn("category", changed.json())

    def test_routes_need_a_session(self):
        movement = self.make_movement()
        anonymous = APIClient()

        responses = [
            anonymous.get("/api/movements/"),
            anonymous.post("/api/movements/", self.payload()),
            anonymous.patch(f"/api/movements/{movement.id}/", {"amount": "1.00"}),
            anonymous.delete(f"/api/movements/{movement.id}/"),
        ]

        for response in responses:
            self.assertEqual(response.status_code, 401)


class CurrencyTests(BaseTestCase):
    """Anotar y ver en bolívares y euros (spec 005). Tasa de hoy: 1 $ = 400 Bs., 1 € = 440 Bs."""

    def setUp(self):
        super().setUp()
        self.set_rate("400", "440")

    def create(self, **changes):
        return self.client.post("/api/movements/", self.payload(**changes))

    def test_bolivars_are_saved_in_dollars_with_what_was_written(self):
        response = self.create(amount="1000.00", currency="VES")

        self.assertEqual(response.status_code, 201)
        movement = Movement.objects.get()
        self.assertEqual(movement.amount, Decimal("2.50"))
        self.assertEqual(movement.original_amount, Decimal("1000.00"))
        self.assertEqual(movement.original_currency.code, "VES")
        self.assertEqual(movement.exchange_rate, Decimal("1"))
        self.assertEqual(response.json()["original_currency"], "VES")

    def test_euros_go_through_the_bolivar_with_rounding(self):
        # 7,77 € x 440 / 400 = 8,547 $ -> 8,55 $
        self.create(amount="7.77", currency="EUR")

        movement = Movement.objects.get()
        self.assertEqual(movement.amount, Decimal("8.55"))
        self.assertEqual(movement.exchange_rate, Decimal("440"))

    def test_without_currency_it_is_dollars(self):
        self.create(amount="45.30")

        movement = Movement.objects.get()
        self.assertEqual(movement.amount, Decimal("45.30"))
        self.assertEqual(movement.original_currency.code, "USD")
        self.assertIsNone(movement.exchange_rate)

    def test_editing_without_touching_the_money_keeps_the_dollars(self):
        movement_id = self.create(amount="1000.00", currency="VES").json()["id"]
        url = f"/api/movements/{movement_id}/"
        self.set_rate("500", "550")  # al día siguiente la tasa cambió

        self.client.patch(url, {"category": self.category("Transporte").id})
        self.client.patch(url, {"amount": "1000.00", "currency": "VES"})
        self.assertEqual(Movement.objects.get().amount, Decimal("2.50"))

        self.client.patch(url, {"amount": "1500.00"})
        self.assertEqual(Movement.objects.get().amount, Decimal("3.00"))

        self.client.patch(url, {"currency": "USD"})
        movement = Movement.objects.get()
        self.assertEqual(movement.amount, Decimal("1500.00"))
        self.assertIsNone(movement.exchange_rate)

    def test_bad_currencies_and_amounts_are_rejected(self):
        Currency.objects.filter(code="EUR").update(is_active=False)
        cases = [
            ({"currency": "XXX"}, "currency"),
            ({"currency": "EUR"}, "currency"),
            ({"amount": "0.01", "currency": "VES"}, "amount"),  # 0,000025 $
            ({"amount": "4000000000.00", "currency": "VES"}, "amount"),  # 10 millones de $
            ({"amount": "10000000.00"}, "amount"),
        ]
        for changes, field in cases:
            with self.subTest(changes=changes):
                response = self.create(**changes)
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())
        self.assertEqual(Movement.objects.count(), 0)

    def test_a_movement_keeps_its_currency_after_it_is_deactivated(self):
        movement_id = self.create(amount="7.77", currency="EUR").json()["id"]
        Currency.objects.filter(code="EUR").update(is_active=False)
        url = f"/api/movements/{movement_id}/"

        kept = self.client.patch(url, {"amount": "7.77", "currency": "EUR", "description": "x"})
        other = self.create(amount="7.77", currency="EUR")

        self.assertEqual(kept.status_code, 200)
        self.assertEqual(other.status_code, 400)

    def test_list_in_bolivars_converts_amounts_and_totals_with_todays_rate(self):
        self.make_movement(category="Salario", amount="100.00")
        self.make_movement(amount="33.33")
        self.make_movement(amount="0.01")

        data = self.client.get("/api/movements/?currency=VES").json()
        in_dollars = self.client.get("/api/movements/").json()

        self.assertEqual(data["currency"], "VES")
        self.assertEqual(data["rate"]["status"], "current")
        self.assertEqual(
            data["totals"], {"income": "40000.00", "expense": "13336.00", "balance": "26664.00"}
        )
        self.assertEqual(
            sorted(movement["amount"] for movement in data["movements"]),
            ["13332.00", "4.00", "40000.00"],
        )
        self.assertEqual(in_dollars["currency"], "USD")
        self.assertEqual(in_dollars["totals"]["expense"], "33.34")

    def test_list_in_euros(self):
        self.make_movement(amount="11.00")

        data = self.client.get("/api/movements/?currency=EUR").json()

        self.assertEqual(data["movements"][0]["amount"], "10.00")
        self.assertEqual(data["movements"][0]["original_amount"], "11.00")
        self.assertEqual(data["movements"][0]["original_currency"], "USD")

    def test_without_any_rate_only_dollars_can_be_used(self):
        ExchangeRate.objects.all().delete()

        listed = self.client.get("/api/movements/?currency=VES")
        created = self.create(amount="1000.00", currency="VES")
        in_dollars = self.client.get("/api/movements/")

        self.assertEqual(listed.status_code, 400)
        self.assertEqual(listed.json()["currency"], ["Todavía no hay tasa del BCV; usa dólares."])
        self.assertEqual(created.status_code, 400)
        self.assertIn("currency", created.json())
        self.assertEqual(in_dollars.status_code, 200)
        self.assertEqual(in_dollars.json()["rate"]["status"], "missing")

    def test_an_outdated_rate_is_still_used(self):
        ExchangeRate.objects.update(
            date=self.today - datetime.timedelta(days=1),
            fetched_at=timezone.now() - datetime.timedelta(days=1),
        )

        data = self.client.get("/api/movements/?currency=VES").json()

        self.assertEqual(data["rate"]["status"], "outdated")


class ChileanPesoTests(BaseTestCase):
    """Anotar y ver en pesos chilenos (spec 013). 1 $ = 400 Bs. = 984,09 CLP$."""

    def setUp(self):
        super().setUp()
        self.set_rate("400", "440")
        UsdQuote.objects.create(
            currency=Currency.objects.get(code="CLP"),
            date=self.today,
            units_per_usd=Decimal("984.09"),
            source=UsdQuote.MINDICADOR,
            fetched_at=timezone.now(),
        )

    def create(self, **changes):
        return self.client.post("/api/movements/", self.payload(**changes))

    def test_pesos_are_saved_in_dollars(self):
        response = self.create(amount="50000", currency="CLP")

        self.assertEqual(response.status_code, 201)
        movement = Movement.objects.get()
        # 50.000 / 984,09 = 50,808 $
        self.assertEqual(movement.amount, Decimal("50.81"))
        self.assertEqual(movement.original_amount, Decimal("50000"))
        self.assertEqual(movement.original_currency.code, "CLP")
        # Bs. por peso: 400 / 984,09
        self.assertEqual(movement.exchange_rate, Decimal("0.40646689"))

    def test_pesos_do_not_take_decimals(self):
        response = self.create(amount="1500.50", currency="CLP")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["amount"], ["Los montos en peso chileno no llevan decimales."]
        )

    def test_list_in_pesos(self):
        self.make_movement(amount="10.00")

        data = self.client.get("/api/movements/?currency=CLP").json()

        self.assertEqual(data["currency"], "CLP")
        self.assertEqual(data["movements"][0]["amount"], "9841")
        clp = data["rate"]["rates"][-1]
        self.assertEqual(clp["currency"], "CLP")
        self.assertEqual(clp["units_per_usd"], "984.09000000")
        self.assertEqual(clp["date"], self.today.isoformat())

    def test_original_pesos_and_totals_do_not_change_with_later_rates(self):
        peso = self.create(amount="50000", currency="CLP").json()
        self.make_movement(amount="20.00")
        UsdQuote.objects.filter(currency__code="CLP").update(
            units_per_usd=Decimal("1200.00")
        )

        data = self.client.get("/api/movements/?currency=CLP").json()
        rows = {movement["id"]: movement for movement in data["movements"]}

        self.assertEqual(rows[peso["id"]]["amount"], "50000")
        self.assertEqual(data["totals"]["expense"], "74000")

    def test_summary_aggregates_displayed_pesos_and_calculates_percentages_in_clp(self):
        self.create(amount="50000", currency="CLP")
        self.make_movement(amount="20.00")
        self.make_movement(category="Vivienda", amount="10.00")
        UsdQuote.objects.filter(currency__code="CLP").update(
            units_per_usd=Decimal("1200.00")
        )

        data = self.client.get("/api/movements/summary/?currency=CLP").json()

        self.assertEqual(data["totals"]["expense"], "86000")
        self.assertEqual(
            [(row["name"], row["amount"], row["percent"]) for row in data["by_category"]],
            [("Alimentación", "74000", "86.0"), ("Vivienda", "12000", "14.0")],
        )
        self.assertEqual(sum(Decimal(row["amount"]) for row in data["by_day"]), Decimal("86000"))
        self.assertEqual(data["top_expenses"][0]["amount"], "50000")

    def test_without_any_peso_rate_pesos_cannot_be_used(self):
        UsdQuote.objects.all().delete()

        response = self.create(amount="50000", currency="CLP")

        self.assertEqual(response.status_code, 400)
        self.assertIn("currency", response.json())


class SummaryTests(BaseTestCase):
    """El resumen del dashboard (spec 006). Marzo de 2025, gastos por 901,30 $."""

    URL = "/api/movements/summary/?month=2025-03"

    def setUp(self):
        super().setUp()
        self.set_rate("400", "440")
        def march(day):
            return datetime.date(2025, 3, day)

        self.make_movement("Salario", "1200.00", date=march(1))
        self.make_movement("Transporte", "5.00", date=march(2))
        self.make_movement("Entretenimiento", "1.00", date=march(3))
        self.make_movement("Vivienda", "800.00", date=march(5), method="Transferencia")
        self.make_movement("Alimentación", "45.30", date=march(12))
        self.make_movement("Alimentación", "30.00", date=march(12), method="Pago móvil")
        self.make_movement("Salud", "20.00", date=march(20))
        self.make_movement("Salud", "99.00", date=datetime.date(2025, 2, 28))
        self.make_movement("Alimentación", "999.00", user=self.outsider, date=march(10))
        # Una categoría desactivada sigue contando: el dinero se gastó igual.
        Category.objects.filter(family=self.family, name="Salud").update(is_active=False)

    def summary(self, url=URL, user=None):
        response = self.client_for(user or self.viewer).get(url)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_any_member_gets_the_summary_of_the_month(self):
        data = self.summary()

        self.assertEqual(data["month"], "2025-03")
        self.assertEqual(data["currency"], "USD")
        self.assertEqual(
            data["totals"], {"income": "1200.00", "expense": "901.30", "balance": "298.70"}
        )

    def test_without_month_it_is_the_current_month(self):
        data = self.summary("/api/movements/summary/")

        self.assertEqual(data["month"], self.today.strftime("%Y-%m"))
        self.assertEqual(data["by_category"], [])
        self.assertEqual(data["top_expenses"], [])

    def test_totals_match_the_movement_list(self):
        for currency in ["USD", "VES", "EUR"]:
            query = f"?month=2025-03&currency={currency}"
            listed = self.client.get(f"/api/movements/{query}").json()
            summary = self.summary(f"/api/movements/summary/{query}")
            self.assertEqual(summary["totals"], listed["totals"])

    def test_expenses_by_category_from_biggest_to_smallest(self):
        rows = self.summary()["by_category"]

        self.assertEqual(
            [(row["name"], row["amount"], row["percent"], row["count"]) for row in rows],
            [
                ("Vivienda", "800.00", "88.8", 1),
                ("Alimentación", "75.30", "8.4", 2),
                ("Salud", "20.00", "2.2", 1),  # desactivada
                ("Transporte", "5.00", "0.6", 1),
                ("Entretenimiento", "1.00", "0.1", 1),
            ],
        )
        self.assertEqual(rows[0]["id"], self.category("Vivienda").id)

    def test_expenses_by_payment_method(self):
        rows = self.summary()["by_payment_method"]

        self.assertEqual(
            [(row["name"], row["amount"], row["count"]) for row in rows],
            [("Transferencia", "800.00", 1), ("Efectivo", "71.30", 4), ("Pago móvil", "30.00", 1)],
        )
        self.assertEqual(sum(Decimal(row["amount"]) for row in rows), Decimal("901.30"))

    def test_expenses_by_day_only_has_days_with_expenses(self):
        rows = self.summary()["by_day"]

        self.assertEqual(
            rows,
            [
                {"date": "2025-03-02", "amount": "5.00", "count": 1},
                {"date": "2025-03-03", "amount": "1.00", "count": 1},
                {"date": "2025-03-05", "amount": "800.00", "count": 1},
                {"date": "2025-03-12", "amount": "75.30", "count": 2},
                {"date": "2025-03-20", "amount": "20.00", "count": 1},
            ],
        )

    def test_top_expenses_are_the_five_biggest_and_never_income(self):
        rows = self.summary()["top_expenses"]

        self.assertEqual(
            [row["amount"] for row in rows], ["800.00", "45.30", "30.00", "20.00", "5.00"]
        )
        self.assertEqual(rows[0]["category"]["name"], "Vivienda")

    def test_bolivars_use_todays_rate_and_keep_the_percentages(self):
        in_dollars = self.summary()
        in_bolivars = self.summary(f"{self.URL}&currency=VES")

        self.assertEqual(in_bolivars["currency"], "VES")
        self.assertEqual(in_bolivars["by_category"][0]["amount"], "320000.00")
        self.assertEqual(in_bolivars["top_expenses"][1]["amount"], "18120.00")
        self.assertEqual(in_bolivars["by_day"][0]["amount"], "2000.00")
        for key in ["by_category", "by_payment_method"]:
            self.assertEqual(
                [row["percent"] for row in in_bolivars[key]],
                [row["percent"] for row in in_dollars[key]],
            )

    def test_without_any_rate_only_dollars_can_be_used(self):
        ExchangeRate.objects.all().delete()

        response = self.client.get(f"{self.URL}&currency=VES")

        self.assertEqual(response.status_code, 400)
        self.assertIn("currency", response.json())

    def test_bad_month_or_currency_is_rejected(self):
        for query in ["month=marzo", "month=2025-13", "currency=XXX"]:
            response = self.client.get(f"/api/movements/summary/?{query}")
            self.assertEqual(response.status_code, 400, query)

    def test_never_includes_another_family(self):
        data = self.summary(user=self.outsider)

        self.assertEqual(data["totals"]["expense"], "999.00")
        self.assertEqual([row["name"] for row in data["by_category"]], ["Alimentación"])

    def test_needs_a_session(self):
        self.assertEqual(APIClient().get(self.URL).status_code, 401)


class ComparisonTests(BaseTestCase):
    """La comparación con meses anteriores (spec 007), con marzo de 2025 como mes elegido.

    Dic. 2024: Alimentación 100.  Ene.: Alimentación 60, Salud 30.
    Feb.: Alimentación 80 (día 5), Transporte 10 (día 20).
    Mar.: Alimentación 120 (día 10), Vivienda 50 (día 20).
    Salario de 1000 cada mes, 1200 en marzo.
    """

    URL = "/api/movements/comparison/?month=2025-03"

    def setUp(self):
        super().setUp()
        self.set_rate("400", "440")

        def on(month, day):
            return datetime.date(2025 if month < 12 else 2024, month, day)

        for month in [12, 1, 2]:
            self.make_movement("Salario", "1000.00", date=on(month, 1))
        self.make_movement("Salario", "1200.00", date=on(3, 1))
        self.make_movement("Alimentación", "100.00", date=on(12, 5))
        self.make_movement("Alimentación", "60.00", date=on(1, 5))
        self.make_movement("Salud", "30.00", date=on(1, 8))
        self.make_movement("Alimentación", "80.00", date=on(2, 5))
        self.make_movement("Transporte", "10.00", date=on(2, 20))
        self.make_movement("Alimentación", "120.00", date=on(3, 10))
        self.make_movement("Vivienda", "50.00", date=on(3, 20))
        self.make_movement("Alimentación", "999.00", user=self.outsider, date=on(3, 10))

    def compare(self, url=URL, user=None):
        response = self.client_for(user or self.viewer).get(url)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_closed_month_is_compared_with_the_whole_previous_month(self):
        data = self.compare()

        self.assertIsNone(data["partial_until"])
        self.assertEqual(data["previous"]["month"], "2025-02")
        self.assertEqual(
            data["previous"]["totals"],
            {"income": "1000.00", "expense": "90.00", "balance": "910.00"},
        )
        self.assertEqual(
            data["previous"]["change"], {"income": "20.0", "expense": "88.9", "balance": "13.2"}
        )

    def test_month_in_progress_is_compared_until_the_same_day(self):
        with mock.patch(
            "django.utils.timezone.localdate", return_value=datetime.date(2025, 3, 15)
        ):
            data = self.compare()

        self.assertEqual(data["partial_until"], 15)
        # Hasta el 15: marzo 120 de gastos (Vivienda es del 20); febrero 80 (Transporte es del 20).
        self.assertEqual(data["previous"]["totals"]["expense"], "80.00")
        self.assertEqual(data["previous"]["change"]["expense"], "50.0")
        self.assertTrue(data["history"][-1]["in_progress"])

    def test_a_zero_base_has_no_percentage(self):
        # Noviembre solo tiene un gasto: sus ingresos son 0 y no hay porcentaje.
        self.make_movement("Salud", "5.00", date=datetime.date(2024, 11, 3))

        change = self.compare("/api/movements/comparison/?month=2024-12")["previous"]["change"]

        self.assertIsNone(change["income"])
        self.assertEqual(change["expense"], "1900.0")  # de 5 a 100

    def test_history_has_six_months_in_order(self):
        rows = self.compare()["history"]

        self.assertEqual(
            [row["month"] for row in rows],
            ["2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03"],
        )
        self.assertEqual(
            rows[0],
            {
                "month": "2024-10",
                "income": "0.00",
                "expense": "0.00",
                "balance": "0.00",
                "in_progress": False,
            },
        )
        self.assertEqual(rows[-1]["expense"], "170.00")  # el mes completo
        self.assertFalse(any(row["in_progress"] for row in rows))

    def test_categories_against_the_three_month_average(self):
        rows = self.compare()["categories"]

        self.assertEqual(
            [
                (r["name"], r["amount"], r["average"], r["change"], r["change_percent"])
                for r in rows
            ],
            [
                ("Vivienda", "50.00", "0.00", "50.00", None),  # nueva
                ("Alimentación", "120.00", "80.00", "40.00", "50.0"),
                ("Transporte", "0.00", "3.33", "-3.33", "-100.0"),
                ("Salud", "0.00", "10.00", "-10.00", "-100.0"),
            ],
        )

    def test_only_months_with_movements_enter_the_average(self):
        # Enero: antes solo hay diciembre con datos (noviembre y octubre vacíos).
        rows = self.compare("/api/movements/comparison/?month=2025-01")["categories"]
        food = next(r for r in rows if r["name"] == "Alimentación")
        self.assertEqual(food["average"], "100.00")

    def test_bolivars_convert_amounts_and_keep_percentages(self):
        dollars = self.compare()
        bolivars = self.compare(f"{self.URL}&currency=VES")

        self.assertEqual(bolivars["previous"]["totals"]["expense"], "36000.00")
        self.assertEqual(bolivars["categories"][1]["change"], "16000.00")
        self.assertEqual(bolivars["history"][-1]["expense"], "68000.00")
        self.assertEqual(bolivars["previous"]["change"], dollars["previous"]["change"])
        self.assertEqual(
            [r["change_percent"] for r in bolivars["categories"]],
            [r["change_percent"] for r in dollars["categories"]],
        )

    def test_clp_comparison_amounts_and_percentages_use_displayed_pesos(self):
        UsdQuote.objects.create(
            currency=Currency.objects.get(code="CLP"),
            date=self.today,
            units_per_usd=Decimal("1000.00"),
            source=UsdQuote.MINDICADOR,
            fetched_at=timezone.now(),
        )
        self.make_clp_movement("50000", date=datetime.date(2025, 2, 6))
        self.make_clp_movement("50000", date=datetime.date(2025, 3, 11))

        data = self.compare(f"{self.URL}&currency=CLP")

        self.assertEqual(data["previous"]["totals"]["expense"], "140000")
        self.assertEqual(data["previous"]["change"]["expense"], "57.1")
        self.assertEqual(data["history"][-1]["expense"], "220000")

    def test_without_previous_months_there_is_nothing_to_compare(self):
        data = self.compare("/api/movements/comparison/?month=2024-12")

        self.assertIsNone(data["previous"])
        self.assertEqual(data["categories"], [])

    def test_never_includes_another_family(self):
        data = self.compare(user=self.outsider)

        self.assertIsNone(data["previous"])
        self.assertEqual(data["history"][-1]["expense"], "999.00")

    def test_bad_parameters_and_no_session(self):
        for query in ["month=marzo", "currency=XXX"]:
            response = self.client.get(f"/api/movements/comparison/?{query}")
            self.assertEqual(response.status_code, 400, query)
        self.assertEqual(APIClient().get(self.URL).status_code, 401)


class ExportTests(BaseTestCase):
    """Spec 008: los movimientos de un rango en CSV."""

    def setUp(self):
        super().setUp()
        self.set_rate("400", "440")
        UsdQuote.objects.create(
            currency=Currency.objects.get(code="CLP"),
            date=self.today,
            units_per_usd=Decimal("984.09"),
            source=UsdQuote.MINDICADOR,
            fetched_at=timezone.now(),
        )

    def export(self, client=None, start=None, end=None):
        start = start or self.today.replace(day=1)
        end = end or self.today
        return (client or self.client).get(
            "/api/movements/export/", {"from": start.isoformat(), "to": end.isoformat()}
        )

    def rows(self, response):
        content = response.content.decode("utf-8")
        self.assertTrue(content.startswith("﻿"))  # BOM, para Excel
        return list(csv.reader(io.StringIO(content[1:]), delimiter=";"))

    def test_every_member_downloads_the_range_from_oldest_to_newest(self):
        start = self.today - datetime.timedelta(days=10)
        older = self.make_movement(amount="10.00", date=start)
        newer = self.make_movement(amount="20.00", user=self.editor)
        self.make_movement(date=start - datetime.timedelta(days=1))  # fuera del rango

        for user in (self.admin, self.editor, self.viewer):
            response = self.export(self.client_for(user), start, self.today)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
            filename = f"movimientos-{start.isoformat()}-a-{self.today.isoformat()}.csv"
            self.assertEqual(response["Content-Disposition"], f'attachment; filename="{filename}"')
            rows = self.rows(response)
            self.assertEqual(
                rows[0],
                [
                    "Fecha",
                    "Tipo",
                    "Categoría",
                    "Descripción",
                    "Método de pago",
                    "Monto USD",
                    "Monto CLP",
                    "Monto anotado",
                    "Moneda anotada",
                    "Tasa usada",
                    "Anotado por",
                ],
            )
            dates = [row[0] for row in rows[1:]]
            expected = [older.date.strftime("%d/%m/%Y"), newer.date.strftime("%d/%m/%Y")]
            self.assertEqual(dates, expected)
            self.assertEqual(rows[2][10], self.editor.full_name)

    def test_expenses_are_negative_and_the_rate_is_empty_in_dollars(self):
        self.make_movement(amount="45.30")
        Movement.objects.create(
            family=self.family,
            category=self.category("Salario"),
            payment_method=self.payment_method("Efectivo"),
            amount=Decimal("1234.50"),
            original_amount=Decimal("493800.00"),
            original_currency=Currency.objects.get(code="VES"),
            exchange_rate=Decimal("400.00000000"),
            date=self.today,
            description="Quincena",
            created_by=self.admin,
        )

        expense, income = self.rows(self.export())[1:]

        self.assertEqual(expense[1:3], ["Gasto", "Alimentación"])
        self.assertEqual(expense[5:10], ["-45,30", "-44579", "45,30", "USD", ""])
        self.assertEqual(
            income[1:7],
            ["Ingreso", "Salario", "Quincena", "Efectivo", "1234,50", "1214859"],
        )
        self.assertEqual(income[7:10], ["493800,00", "VES", "400,00000000"])

    def test_only_the_family_movements_and_a_session_is_needed(self):
        self.make_movement(user=self.outsider)

        self.assertEqual(len(self.rows(self.export())), 1)  # solo los encabezados
        self.assertEqual(self.export(APIClient()).status_code, 401)

    def test_bad_ranges_are_rejected(self):
        day = datetime.date(2026, 1, 1)
        year_later = day + datetime.timedelta(days=365)  # 366 días contando los dos
        self.assertEqual(self.export(start=day, end=year_later).status_code, 200)

        too_long = (year_later + datetime.timedelta(days=1)).isoformat()
        cases = [
            ({"from": "2026-01-02", "to": "2026-01-01"}, "to"),  # invertido
            ({"from": "1999-12-31", "to": "2000-06-01"}, "from"),  # antes del 2000
            ({"from": day.isoformat(), "to": too_long}, "to"),  # más de 366 días
            ({"from": "ayer", "to": "2026-01-01"}, "from"),  # mal escrito
            ({"from": "2026-01-01"}, "to"),  # falta
        ]
        for query, field in cases:
            response = self.client.get("/api/movements/export/", query)
            self.assertEqual(response.status_code, 400, query)
            self.assertIn(field, response.json(), query)

    def test_values_that_look_like_formulas_get_an_apostrophe(self):
        movement = self.make_movement()
        movement.description = "=HYPERLINK(\"http://x\")"
        movement.save()
        category = self.category("Alimentación")
        category.name = "@Comida"
        category.save()

        row = self.rows(self.export())[1]

        self.assertEqual(row[3], "'=HYPERLINK(\"http://x\")")
        self.assertEqual(row[2], "'@Comida")
        self.assertEqual(row[5], "-10,00")  # el signo de un monto no lleva apóstrofo
        self.assertEqual(export.text("\t=1+1"), "'\t=1+1")

    def test_clp_column_preserves_original_amount_and_converts_other_currencies(self):
        self.make_clp_movement("50000")
        self.make_movement(amount="20.00")

        rows = self.rows(self.export())[1:]

        clp_row = next(row for row in rows if row[8] == "CLP")
        usd_row = next(row for row in rows if row[8] == "USD")
        self.assertEqual(clp_row[6], "-50000")
        self.assertEqual(usd_row[6], "-19682")

    def test_export_requires_a_clp_rate_for_the_new_column(self):
        UsdQuote.objects.all().delete()

        response = self.export()

        self.assertEqual(response.status_code, 400)
        self.assertIn("currency", response.json())


@override_settings(DEBUG=True)  # seed_demo se niega a funcionar sin DEBUG
@mock.patch.dict(os.environ, {"DEMO_PASSWORD": PASSWORD})
class SeedDemoTests(BaseTestCase):
    def seed(self):
        with open(os.devnull, "w") as silence:
            call_command("seed_demo", stdout=silence)

    def test_demo_family_gets_movements_in_three_months(self):
        self.seed()

        demo = Family.objects.get(name="Familia Demo")
        months = {(date.year, date.month) for date in demo.movements.values_list("date", flat=True)}
        self.assertEqual(len(months), 3)
        self.assertFalse(demo.movements.filter(date__gt=self.today).exists())
        self.assertFalse(demo.movements.filter(amount__lte=0).exists())

    def test_running_twice_does_not_duplicate(self):
        self.seed()
        count = Movement.objects.count()

        self.seed()

        self.assertEqual(Movement.objects.count(), count)

    def test_other_families_are_not_touched(self):
        mine = self.make_movement()

        self.seed()

        self.assertEqual(list(Movement.objects.filter(family=self.family)), [mine])
        self.assertEqual(Movement.objects.filter(family=self.other_family).count(), 0)
