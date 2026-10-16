from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from catalogs.models import Category, Currency, MovementType
from movements.serializers import MIN_DATE, money_fields


def next_month(today):
    """Primer día del mes siguiente a `today`."""
    if today.month == 12:
        return today.replace(year=today.year + 1, month=1, day=1)
    return today.replace(month=today.month + 1, day=1)


class BudgetItemWriteSerializer(serializers.Serializer):
    """Datos para crear o corregir una partida (spec 010).

    Necesita `context={"family": ...}`. Al corregir, se le pasa también la partida,
    para que pueda conservar una categoría que ya se desactivó.

    `amount` es lo que se escribió, en la moneda `currency` (USD si falta). Al
    validar se pasa a USD con la tasa de hoy: es lo único que se guarda.
    """

    # "2026-11" se convierte en el día 1 de ese mes. Solo al crear.
    month = serializers.DateField(input_formats=["%Y-%m"], required=False)
    category = serializers.IntegerField()
    description = serializers.CharField(max_length=200)
    amount = serializers.DecimalField(max_digits=16, decimal_places=2, min_value=Decimal("0.01"))
    currency = serializers.SlugRelatedField(
        slug_field="code",
        queryset=Currency.objects.filter(is_active=True),
        required=False,
        error_messages={"does_not_exist": "Elige una moneda activa."},
    )

    def validate_month(self, value):
        if value < MIN_DATE:
            raise serializers.ValidationError("El mes no puede ser anterior al año 2000.")
        if value > next_month(timezone.localdate()):
            raise serializers.ValidationError("Solo se puede planificar hasta el mes siguiente.")
        return value

    def validate_category(self, value):
        current = self.instance.category if self.instance else None
        category = Category.objects.filter(
            family=self.context["family"],
            pk=value,
            movement_type__code=MovementType.EXPENSE,
        ).first()
        # Vale si está activa, o si es la que la partida ya tenía.
        if category is None or not (category.is_active or category == current):
            raise serializers.ValidationError("Elige una categoría de gasto activa de tu familia.")
        return category

    def validate(self, attrs):
        if self.instance is None and "month" not in attrs:
            raise serializers.ValidationError({"month": "Elige el mes del presupuesto."})
        currency = attrs.pop("currency", None)
        if "amount" in attrs:
            currency = currency or Currency.objects.get(is_base=True)
            # Mismas reglas que un movimiento: tasa de hoy y límites en USD.
            attrs["amount"] = money_fields(attrs["amount"], currency)["amount"]
        return attrs


class ProposalSerializer(serializers.Serializer):
    """Las partidas que se eligieron de la propuesta: {"month", "items": [...]}."""

    month = serializers.DateField(input_formats=["%Y-%m"])
    items = serializers.ListField(child=serializers.DictField(), min_length=1, max_length=100)
