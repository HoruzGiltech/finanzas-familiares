from decimal import Decimal

from rest_framework.test import APIClient

from catalogs.models import Category
from movements.comparison import shift_month
from movements.models import Movement
from movements.tests import BaseTestCase

from .models import BudgetItem
from .serializers import next_month


class BudgetTestCase(BaseTestCase):
    """Presupuesto (spec 010). Tasa de hoy: 1 $ = 400 Bs."""

    def setUp(self):
        super().setUp()
        self.set_rate("400", "440")
        self.month = self.today.replace(day=1)
        self.month_text = self.month.strftime("%Y-%m")

    def item(self, description="Alquiler", category="Vivienda", amount="350.00", month=None):
        return BudgetItem.objects.create(
            family=self.family,
            month=month or self.month,
            category=self.category(category),
            description=description,
            amount=Decimal(amount),
            created_by=self.admin,
        )

    def new_item(self, client=None, **changes):
        data = {
            "month": self.month_text,
            "category": self.category("Vivienda").id,
            "description": "Alquiler",
            "amount": "350.00",
        }
        data.update(changes)
        return (client or self.client).post("/api/budget/items/", data)

    def realize(self, item, client=None, **changes):
        data = {
            "payment_method": self.payment_method("Transferencia").id,
            "amount": "360.00",
            "date": self.today.isoformat(),
        }
        data.update(changes)
        return (client or self.client).post(f"/api/budget/items/{item.id}/realize/", data)


class ItemTests(BudgetTestCase):
    def test_admin_and_editor_create_edit_and_remove_any_item(self):
        created = self.new_item()
        self.assertEqual(created.status_code, 201)
        item_id = created.json()["id"]

        editor = self.client_for(self.editor)
        # El editor corrige la partida que creó el administrador: es un plan común.
        edited = editor.patch(f"/api/budget/items/{item_id}/", {"amount": "380.00"})
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(BudgetItem.objects.get(pk=item_id).amount, Decimal("380.00"))

        self.assertEqual(editor.delete(f"/api/budget/items/{item_id}/").status_code, 204)
        self.assertFalse(BudgetItem.objects.filter(pk=item_id).exists())

    def test_viewer_anonymous_and_other_family(self):
        item = self.item()
        viewer = self.client_for(self.viewer)
        url = f"/api/budget/items/{item.id}/"

        self.assertEqual(self.new_item(viewer).status_code, 403)
        self.assertEqual(viewer.patch(url, {"amount": "1"}).status_code, 403)
        self.assertEqual(viewer.delete(url).status_code, 403)
        self.assertEqual(self.realize(item, viewer).status_code, 403)
        self.assertEqual(APIClient().get("/api/budget/").status_code, 401)
        self.assertEqual(self.client_for(self.outsider).delete(url).status_code, 404)
        self.assertEqual(viewer.get("/api/budget/").status_code, 200)  # ver sí puede

    def test_amount_written_in_bolivars_is_saved_in_dollars(self):
        response = self.new_item(amount="4000.00", currency="VES")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(BudgetItem.objects.get().amount, Decimal("10.00"))

    def test_invalid_items_are_rejected(self):
        inactive = self.category("Salud")
        inactive.is_active = False
        inactive.save()
        too_far = shift_month(next_month(self.today), 1).strftime("%Y-%m")
        cases = {
            "category": [
                self.category("Salario").id,  # de ingreso
                self.category("Vivienda", self.other_family).id,
                inactive.id,
            ],
            "amount": ["0", "-5", "10000000.00"],
            "month": [too_far, "1999-12"],
        }
        for field, values in cases.items():
            for value in values:
                response = self.new_item(**{field: value})
                self.assertEqual(response.status_code, 400, (field, value))
                self.assertIn(field, response.json())
        next_month_text = next_month(self.today).strftime("%Y-%m")
        self.assertEqual(self.new_item(month=next_month_text).status_code, 201)
        self.assertEqual(BudgetItem.objects.count(), 1)

    def test_an_item_keeps_its_category_after_it_is_deactivated(self):
        item = self.item()
        Category.objects.filter(pk=item.category_id).update(is_active=False)

        response = self.client.patch(f"/api/budget/items/{item.id}/", {"description": "Renta"})

        self.assertEqual(response.status_code, 200)


class RealizeTests(BudgetTestCase):
    def test_realize_creates_the_movement(self):
        item = self.item()

        response = self.realize(item, self.client_for(self.editor), amount="144000", currency="VES")

        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        movement = item.movement
        self.assertEqual(movement.category, item.category)
        self.assertEqual(movement.description, "Alquiler")
        self.assertEqual(movement.payment_method, self.payment_method("Transferencia"))
        self.assertEqual(movement.amount, Decimal("360.00"))  # 144.000 Bs. / 400
        self.assertEqual(movement.original_currency.code, "VES")
        self.assertEqual(movement.date, self.today)
        self.assertEqual(movement.created_by, self.editor)
        self.assertEqual(response.json()["movement"]["amount"], "360.00")

    def test_payment_method_is_required_and_twice_is_rejected(self):
        item = self.item()

        self.assertIn("payment_method", self.realize(item, payment_method="").json())
        self.assertEqual(self.realize(item).status_code, 200)
        second = self.realize(item)

        self.assertEqual(second.status_code, 400)
        self.assertEqual(Movement.objects.filter(description="Alquiler").count(), 1)

    def test_undo_deletes_the_movement_only_for_who_may(self):
        item = self.item()
        self.realize(item)  # lo marca el administrador
        item.refresh_from_db()
        movement_id = item.movement_id
        url = f"/api/budget/items/{item.id}/undo/"

        self.assertEqual(self.client_for(self.editor).post(url).status_code, 403)
        response = self.client.post(url)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["movement"])
        self.assertFalse(Movement.objects.filter(pk=movement_id).exists())
        self.assertEqual(self.client.post(url).status_code, 400)  # ya está pendiente

    def test_deleting_the_movement_leaves_the_item_pending(self):
        item = self.item()
        self.realize(item)
        item.refresh_from_db()

        self.client.delete(f"/api/movements/{item.movement_id}/")

        item.refresh_from_db()
        self.assertIsNone(item.movement)

    def test_removing_a_done_item_keeps_its_movement(self):
        item = self.item()
        self.realize(item)
        item.refresh_from_db()

        self.client.delete(f"/api/budget/items/{item.id}/")

        self.assertTrue(Movement.objects.filter(pk=item.movement_id).exists())


class TotalsTests(BudgetTestCase):
    def test_totals_in_dollars_and_bolivars(self):
        rent = self.item("Alquiler", "Vivienda", "350.00")
        self.item("Mercado", "Alimentación", "200.00")
        self.realize(rent, amount="360.00")
        self.make_movement("Entretenimiento", "40.00")  # sin presupuestar
        self.make_movement("Salario", "1000.00")  # ingreso: no cuenta

        dollars = self.client.get(f"/api/budget/?month={self.month_text}").json()
        bolivars = self.client.get(f"/api/budget/?month={self.month_text}&currency=VES").json()

        self.assertEqual(
            dollars["totals"],
            {"planned": "550.00", "done": "360.00", "pending": "200.00", "unplanned": "40.00"},
        )
        self.assertEqual(bolivars["totals"]["planned"], "220000.00")
        self.assertEqual(bolivars["items"][0]["amount"], "80000.00")  # Mercado
        self.assertEqual(len(dollars["items"]), 2)

    def test_never_shows_another_family(self):
        self.item()

        data = self.client_for(self.outsider).get(f"/api/budget/?month={self.month_text}").json()

        self.assertEqual(data["items"], [])
        self.assertEqual(data["totals"]["planned"], "0.00")


class ProposalTests(BudgetTestCase):
    def setUp(self):
        super().setUp()
        self.previous = shift_month(self.month, -1)
        rent = self.item("Alquiler", "Vivienda", "350.00", month=self.previous)
        self.item("Luz", "Servicios", "20.00", month=self.previous)
        self.realize(rent, amount="365.00", date=self.previous.isoformat())
        self.make_movement("Entretenimiento", "43.15", date=self.previous)  # sin presupuestar

    def test_can_propose_only_when_the_month_is_empty_and_the_previous_is_not(self):
        url = f"/api/budget/?month={self.month_text}"
        self.assertTrue(self.client.get(url).json()["can_propose"])
        previous_url = f"/api/budget/?month={self.previous.strftime('%Y-%m')}"
        self.assertFalse(self.client.get(previous_url).json()["can_propose"])

        self.item("Agua", "Servicios", "5.00")
        self.assertFalse(self.client.get(url).json()["can_propose"])

    def test_proposal_uses_what_was_really_spent(self):
        data = self.client.get(f"/api/budget/proposal/?month={self.month_text}").json()

        items = {item["description"]: item for item in data["items"]}
        self.assertEqual(items["Alquiler"]["proposed"], "365.00")  # lo gastado
        self.assertEqual(items["Alquiler"]["planned"], "350.00")
        self.assertEqual(items["Luz"]["proposed"], "20.00")  # quedó pendiente
        self.assertIsNone(items["Luz"]["spent"])
        fun = self.category("Entretenimiento")
        self.assertEqual(
            data["unplanned"],
            [{"category": {"id": fun.id, "name": "Entretenimiento"}, "amount": "43.15"}],
        )

    def test_creating_from_the_proposal_only_adds_the_chosen_items(self):
        rent = self.category("Vivienda").id
        fun = self.category("Entretenimiento").id
        chosen = [
            {"description": "Alquiler", "category": rent, "amount": "365.00"},
            {"description": "Entretenimiento", "category": fun, "amount": "43.15"},
        ]

        response = self.client.post(
            "/api/budget/proposal/", {"month": self.month_text, "items": chosen}, format="json"
        )

        self.assertEqual(response.status_code, 201)
        created = BudgetItem.objects.filter(month=self.month).order_by("description")
        self.assertEqual(
            [(item.description, str(item.amount)) for item in created],
            [("Alquiler", "365.00"), ("Entretenimiento", "43.15")],
        )
        self.assertTrue(all(item.movement is None for item in created))

    def test_one_bad_item_creates_nothing(self):
        chosen = [
            {"description": "Alquiler", "category": self.category("Vivienda").id, "amount": "365"},
            {"description": "Sueldo", "category": self.category("Salario").id, "amount": "10"},
        ]

        response = self.client.post(
            "/api/budget/proposal/", {"month": self.month_text, "items": chosen}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("1", response.json()["items"])
        self.assertFalse(BudgetItem.objects.filter(month=self.month).exists())

    def test_viewer_cannot_see_or_use_the_proposal(self):
        viewer = self.client_for(self.viewer)
        url = "/api/budget/proposal/"

        self.assertEqual(viewer.get(f"{url}?month={self.month_text}").status_code, 403)
        body = {"month": self.month_text, "items": []}
        self.assertEqual(viewer.post(url, body, format="json").status_code, 403)


class CategoryInBudgetTests(BudgetTestCase):
    def test_a_category_used_by_the_budget_cannot_be_deleted(self):
        item = self.item("Mascotas", "Ropa y calzado", "10.00")

        response = self.client.delete(f"/api/categories/{item.category_id}/")

        self.assertEqual(response.status_code, 400)
        self.assertIn("presupuesto", response.json()["detail"][0])
