import datetime
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

from rates.models import ExchangeRate
from rates.sources import SourceError

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

    def make_movement(self, category="Alimentación", amount="10.00", user=None, date=None):
        user = user or self.admin
        return Movement.objects.create(
            family=user.family,
            category=self.category(category, user.family),
            payment_method=self.payment_method("Efectivo", user.family),
            amount=Decimal(amount),
            original_amount=Decimal(amount),
            original_currency=Currency.objects.get(code="USD"),
            date=date or self.today,
            created_by=user,
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
