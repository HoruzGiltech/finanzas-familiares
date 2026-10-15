from django.conf import settings
from django.db import models

from accounts.models import Family
from catalogs.models import Category, Currency, PaymentMethod


class Movement(models.Model):
    """Una entrada o una salida de dinero de la familia."""

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="movements")
    # PROTECT: un movimiento nunca se pierde porque alguien borre su categoría,
    # su método de pago o al usuario que lo anotó.
    # Si es ingreso o gasto lo dice la categoría (category.movement_type).
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    payment_method = models.ForeignKey(PaymentMethod, on_delete=models.PROTECT)
    # En USD y siempre positivo: el signo lo pone el tipo de movimiento.
    # Es el que vale para todas las cuentas y nunca cambia con la tasa.
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    # Lo que la persona escribió, en la moneda en que lo escribió (spec 005).
    original_amount = models.DecimalField(max_digits=16, decimal_places=2)
    original_currency = models.ForeignKey(Currency, on_delete=models.PROTECT)
    # Bolívares por unidad de la moneda original al convertir. Vacío si fue en USD.
    exchange_rate = models.DecimalField(
        max_digits=20, decimal_places=8, null=True, blank=True
    )
    date = models.DateField()  # el día en que ocurrió, no el día en que se anotó
    description = models.CharField(max_length=200, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Del más reciente al más antiguo.
        ordering = ["-date", "-id"]
        # Siempre se consulta "los movimientos de esta familia en este mes".
        indexes = [models.Index(fields=["family", "date"])]

    def __str__(self):
        return f"{self.date} {self.category} {self.amount}"

    def can_be_edited_by(self, user):
        """El administrador corrige todo; el editor, solo lo que anotó él."""
        if user.is_family_admin:
            return True
        return user.can_edit_movements and self.created_by_id == user.id
