from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import models

from accounts.models import Family
from catalogs.models import Category, Currency
from movements.models import Movement


class BudgetItem(models.Model):
    """Un gasto previsto en el presupuesto de un mes (spec 010).

    Está pendiente hasta que se marca como realizado: entonces se crea un
    movimiento y queda enlazado aquí.
    """

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="budget_items")
    month = models.DateField()  # siempre el día 1 del mes
    # PROTECT: una categoría que usa el presupuesto no se puede borrar (spec 009).
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="budget_items")
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # en USD, siempre positivo
    original_amount = models.DecimalField(max_digits=16, decimal_places=2)
    original_currency = models.ForeignKey(Currency, on_delete=models.PROTECT)
    # SET_NULL: si el movimiento se borra desde Movimientos, la partida vuelve a pendiente.
    movement = models.OneToOneField(
        Movement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="budget_item",
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category__name", "description", "id"]
        # Siempre se consulta "el presupuesto de esta familia en este mes".
        indexes = [models.Index(fields=["family", "month"])]

    def __str__(self):
        return f"{self.month:%Y-%m} {self.description} {self.amount}"

    @property
    def is_done(self):
        return self.movement_id is not None


class ShoppingListItem(models.Model):
    """Un producto de la lista del supermercado de una partida (spec 011).

    Si una partida tiene lista, su monto es la suma de la lista.
    """

    # CASCADE: quitar la partida borra su lista.
    budget_item = models.ForeignKey(
        BudgetItem, on_delete=models.CASCADE, related_name="shopping_list"
    )
    name = models.CharField(max_length=100)
    quantity = models.DecimalField(max_digits=6, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)  # en USD
    position = models.PositiveIntegerField()  # el orden en que se escribió

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.quantity} × {self.name}"

    @property
    def total(self):
        return line_total(self.quantity, self.unit_price)


def line_total(quantity, unit_price):
    """Cantidad × precio, redondeado al céntimo (spec 011, regla 6)."""
    return (quantity * unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
