from django.conf import settings
from django.db import models

from accounts.models import Family
from catalogs.models import Category
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
