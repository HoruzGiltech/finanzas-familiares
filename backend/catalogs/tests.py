from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Family, User

from .defaults import create_default_catalogs
from .models import Category, Currency, MovementType, PaymentMethod

PASSWORD = "clave-Segura-2026"


class BaseTestCase(TestCase):
    """Dos familias con sus catálogos iniciales, para comprobar que no se mezclan."""

    def setUp(self):
        cache.clear()  # el rate limit guarda sus contadores en la caché
        self.family = self.make_family("Familia Pérez")
        self.other_family = self.make_family("Familia Rojas")
        self.admin = self.make_user("admin@perez.com", User.Role.ADMIN)
        self.editor = self.make_user("editor@perez.com", User.Role.EDITOR)
        self.viewer = self.make_user("lector@perez.com", User.Role.VIEWER)
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


class InitialDataTests(BaseTestCase):
    def test_system_catalogs_are_loaded(self):
        types = list(MovementType.objects.values_list("code", "sign"))
        self.assertCountEqual(types, [("income", 1), ("expense", -1)])

        self.assertCountEqual(
            Currency.objects.values_list("code", flat=True), ["USD", "VES", "EUR"]
        )
        self.assertEqual(
            list(Currency.objects.filter(is_base=True).values_list("code", flat=True)), ["USD"]
        )

    def test_registered_family_gets_default_catalogs(self):
        response = APIClient().post(
            "/api/auth/register/",
            {
                "full_name": "Ana Gómez",
                "family_name": "Familia Gómez",
                "email": "ana@gomez.com",
                "password": PASSWORD,
            },
        )

        self.assertEqual(response.status_code, 201)
        family = Family.objects.get(name="Familia Gómez")
        self.assertEqual(family.categories.count(), 13)
        self.assertEqual(family.categories.filter(movement_type__code="expense").count(), 9)
        self.assertEqual(family.categories.filter(movement_type__code="income").count(), 4)
        self.assertEqual(family.payment_methods.count(), 6)


class ReadTests(BaseTestCase):
    def test_every_role_reads_the_four_catalogs(self):
        for user in (self.admin, self.editor, self.viewer):
            response = self.client_for(user).get("/api/catalogs/")

            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["movement_types"]), 2)
            self.assertEqual(len(data["currencies"]), 3)
            self.assertEqual(len(data["categories"]), 13)
            self.assertEqual(len(data["payment_methods"]), 6)

    def test_inactive_items_are_hidden_by_default(self):
        Category.objects.filter(family=self.family, name="Salud").update(is_active=False)
        PaymentMethod.objects.filter(family=self.family, name="Zelle").update(is_active=False)

        data = self.client.get("/api/catalogs/").json()

        self.assertEqual(len(data["categories"]), 12)
        self.assertEqual(len(data["payment_methods"]), 5)

    def test_only_admin_can_include_inactive_items(self):
        Category.objects.filter(family=self.family, name="Salud").update(is_active=False)
        url = "/api/catalogs/?include_inactive=1"

        self.assertEqual(len(self.client.get(url).json()["categories"]), 13)
        self.assertEqual(len(self.client_for(self.editor).get(url).json()["categories"]), 12)
        self.assertEqual(len(self.client_for(self.viewer).get(url).json()["categories"]), 12)

    def test_response_never_includes_another_family(self):
        Category.objects.create(
            family=self.other_family,
            movement_type=MovementType.objects.get(code="expense"),
            name="Solo de los Rojas",
        )
        PaymentMethod.objects.create(family=self.other_family, name="Cripto de los Rojas")

        body = self.client.get("/api/catalogs/?include_inactive=1").content.decode()

        self.assertNotIn("Rojas", body)


class WriteTests(BaseTestCase):
    def test_admin_creates_renames_deactivates_and_reactivates_category(self):
        created = self.client.post(
            "/api/categories/", {"name": "  Mascotas ", "movement_type": "expense"}
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["name"], "Mascotas")
        self.assertEqual(created.json()["movement_type"], "expense")
        url = f"/api/categories/{created.json()['id']}/"

        renamed = self.client.patch(url, {"name": "Mascotas y veterinario"})
        self.assertEqual(renamed.json()["name"], "Mascotas y veterinario")

        deactivated = self.client.patch(url, {"is_active": False})
        self.assertFalse(deactivated.json()["is_active"])

        reactivated = self.client.patch(url, {"is_active": True})
        self.assertTrue(reactivated.json()["is_active"])

    def test_admin_creates_renames_deactivates_and_reactivates_payment_method(self):
        created = self.client.post("/api/payment-methods/", {"name": "Binance"})
        self.assertEqual(created.status_code, 201)
        url = f"/api/payment-methods/{created.json()['id']}/"

        self.assertEqual(self.client.patch(url, {"name": "Cripto"}).json()["name"], "Cripto")
        self.assertFalse(self.client.patch(url, {"is_active": False}).json()["is_active"])
        self.assertTrue(self.client.patch(url, {"is_active": True}).json()["is_active"])

    def test_editor_and_viewer_cannot_write(self):
        category_url = f"/api/categories/{self.category('Salud').id}/"
        method_url = f"/api/payment-methods/{self.payment_method('Zelle').id}/"

        for user in (self.editor, self.viewer):
            client = self.client_for(user)
            responses = [
                client.post("/api/categories/", {"name": "X", "movement_type": "expense"}),
                client.patch(category_url, {"name": "X"}),
                client.post("/api/payment-methods/", {"name": "X"}),
                client.patch(method_url, {"name": "X"}),
            ]
            for response in responses:
                self.assertEqual(response.status_code, 403)

    def test_item_of_another_family_is_not_found(self):
        category = self.category("Salud", family=self.other_family)
        method = self.payment_method("Zelle", family=self.other_family)

        responses = [
            self.client.patch(f"/api/categories/{category.id}/", {"name": "Hackeada"}),
            self.client.patch(f"/api/payment-methods/{method.id}/", {"is_active": False}),
        ]

        for response in responses:
            self.assertEqual(response.status_code, 404)
        category.refresh_from_db()
        method.refresh_from_db()
        self.assertEqual(category.name, "Salud")
        self.assertTrue(method.is_active)

    def test_duplicate_name_is_rejected_ignoring_case_and_spaces(self):
        responses = [
            self.client.post(
                "/api/categories/", {"name": " alimentación ", "movement_type": "expense"}
            ),
            self.client.patch(f"/api/categories/{self.category('Salud').id}/", {"name": "VIVIENDA"}),
            self.client.post("/api/payment-methods/", {"name": "pago   móvil"}),
            self.client.patch(
                f"/api/payment-methods/{self.payment_method('Zelle').id}/", {"name": "efectivo"}
            ),
        ]

        for response in responses:
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json(), {"name": ["Ya existe uno con este nombre."]})

    def test_same_name_is_allowed_in_other_type_and_other_family(self):
        # "Salario" existe como ingreso: se puede crear como gasto.
        other_type = self.client.post(
            "/api/categories/", {"name": "Salario", "movement_type": "expense"}
        )
        # "Mascotas" en las dos familias.
        Category.objects.create(
            family=self.other_family,
            movement_type=MovementType.objects.get(code="expense"),
            name="Mascotas",
        )
        other_family = self.client.post(
            "/api/categories/", {"name": "Mascotas", "movement_type": "expense"}
        )

        self.assertEqual(other_type.status_code, 201)
        self.assertEqual(other_family.status_code, 201)

    def test_item_can_change_only_the_case_of_its_own_name(self):
        category = self.category("Salud")

        response = self.client.patch(f"/api/categories/{category.id}/", {"name": "SALUD"})

        self.assertEqual(response.status_code, 200)

    def test_movement_type_cannot_be_changed(self):
        category = self.category("Salud")

        response = self.client.patch(
            f"/api/categories/{category.id}/", {"movement_type": "income", "name": "Salud 2"}
        )

        self.assertEqual(response.status_code, 200)
        category.refresh_from_db()
        self.assertEqual(category.movement_type.code, "expense")
        self.assertEqual(category.name, "Salud 2")

    def test_unknown_movement_type_is_rejected(self):
        response = self.client.post(
            "/api/categories/", {"name": "Rara", "movement_type": "transfer"}
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("movement_type", response.json())

    def test_last_active_item_cannot_be_deactivated(self):
        # Dejamos una sola categoría de ingreso y un solo método de pago activos.
        income = Category.objects.filter(family=self.family, movement_type__code="income")
        income.exclude(name="Salario").update(is_active=False)
        PaymentMethod.objects.filter(family=self.family).exclude(name="Efectivo").update(
            is_active=False
        )

        responses = [
            self.client.patch(
                f"/api/categories/{self.category('Salario').id}/", {"is_active": False}
            ),
            self.client.patch(
                f"/api/payment-methods/{self.payment_method('Efectivo').id}/",
                {"is_active": False},
            ),
        ]

        for response in responses:
            self.assertEqual(response.status_code, 400)
        self.assertTrue(self.category("Salario").is_active)
        self.assertTrue(self.payment_method("Efectivo").is_active)

    def test_routes_need_a_session(self):
        anonymous = APIClient()

        responses = [
            anonymous.get("/api/catalogs/"),
            anonymous.post("/api/categories/", {}),
            anonymous.patch(f"/api/categories/{self.category('Salud').id}/", {}),
            anonymous.post("/api/payment-methods/", {}),
            anonymous.patch(f"/api/payment-methods/{self.payment_method('Zelle').id}/", {}),
        ]

        for response in responses:
            self.assertEqual(response.status_code, 401)
