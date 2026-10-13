from django.db import models
from django.db.models.functions import Lower

from accounts.models import Family


class MovementType(models.Model):
    """Catálogo del sistema: Ingreso o Gasto. Decide si un monto suma o resta."""

    INCOME = "income"
    EXPENSE = "expense"

    code = models.CharField(max_length=20, unique=True)  # lo usa el código
    name = models.CharField(max_length=40)  # lo ve el usuario
    sign = models.SmallIntegerField()  # 1 suma, -1 resta

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.name


class Currency(models.Model):
    """Catálogo del sistema: monedas en las que se pueden ver los montos."""

    code = models.CharField(max_length=3, unique=True)
    name = models.CharField(max_length=40)
    symbol = models.CharField(max_length=5)
    # Solo una moneda es la base (USD): en ella se guardan todos los montos.
    is_base = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-is_base", "code"]
        verbose_name_plural = "currencies"

    def __str__(self):
        return self.code


class Category(models.Model):
    """Categoría de ingreso o de gasto de una familia."""

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="categories")
    movement_type = models.ForeignKey(MovementType, on_delete=models.PROTECT)
    name = models.CharField(max_length=60)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"
        constraints = [
            # Sin nombres repetidos por familia y tipo, ignorando mayúsculas.
            models.UniqueConstraint(
                "family", "movement_type", Lower("name"), name="unique_category_name"
            ),
        ]

    def __str__(self):
        return self.name


class PaymentMethod(models.Model):
    """Método de pago de una familia: efectivo, pago móvil, etc."""

    family = models.ForeignKey(
        Family, on_delete=models.CASCADE, related_name="payment_methods"
    )
    name = models.CharField(max_length=60)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint("family", Lower("name"), name="unique_payment_method_name"),
        ]

    def __str__(self):
        return self.name
