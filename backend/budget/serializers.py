from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from catalogs.models import Category, Currency, MovementType
from movements.serializers import MAX_AMOUNT, MIN_DATE, money_fields

from .models import line_total

FROM_LIST = "El monto sale de la lista: cambia los productos."
NO_SHOPPING_CATEGORY = "Tu familia no tiene activa la categoría de la lista del supermercado."


def next_month(today):
    """Primer día del mes siguiente a `today`."""
    if today.month == 12:
        return today.replace(year=today.year + 1, month=1, day=1)
    return today.replace(month=today.month + 1, day=1)


class ShoppingLineSerializer(serializers.Serializer):
    """Un producto de la lista del supermercado (spec 011, reglas 2 a 4)."""

    name = serializers.CharField(max_length=100)
    quantity = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=Decimal("0.01"), max_value=Decimal("9999")
    )
    unit_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01"), max_value=Decimal("999999.99")
    )


class ShoppingListField(serializers.ListField):
    """La lista entera: de 1 a 200 productos."""

    def __init__(self, **kwargs):
        super().__init__(
            child=ShoppingLineSerializer(),
            min_length=1,
            max_length=200,
            error_messages={
                "min_length": "La lista necesita al menos un producto.",
                "max_length": "La lista admite como mucho 200 productos.",
                "empty": "La lista necesita al menos un producto.",
            },
            **kwargs,
        )


def list_amount(lines):
    """El monto de una partida con lista: la suma de cada producto, ya redondeado."""
    total = sum((line_total(line["quantity"], line["unit_price"]) for line in lines), Decimal("0"))
    if total > MAX_AMOUNT:
        raise serializers.ValidationError(
            {"shopping_list": "La lista supera el máximo de 9.999.999,99 dólares."}
        )
    return total


class ShoppingListSerializer(serializers.Serializer):
    """Para reemplazar la lista de una partida: {"shopping_list": [...]}."""

    shopping_list = ShoppingListField()


class BudgetItemWriteSerializer(serializers.Serializer):
    """Datos para crear o corregir una partida (spec 010).

    Necesita `context={"family": ...}`. Al corregir, se le pasa también la partida,
    para que pueda conservar una categoría que ya se desactivó.

    `amount` es lo que se escribió, en la moneda `currency` (USD si falta). Al
    validar se pasa a USD con la tasa de hoy: es lo único que se guarda.

    Al crear se puede enviar `shopping_list` en vez de `amount`: la partida nace
    con su lista y su monto es el total (spec 011). Sin `category`, la lista va a
    la categoría marcada para la lista del supermercado.
    """

    # "2026-11" se convierte en el día 1 de ese mes. Solo al crear.
    month = serializers.DateField(input_formats=["%Y-%m"], required=False)
    category = serializers.IntegerField(required=False)
    description = serializers.CharField(max_length=200)
    amount = serializers.DecimalField(
        max_digits=16, decimal_places=2, min_value=Decimal("0.01"), required=False
    )
    currency = serializers.SlugRelatedField(
        slug_field="code",
        queryset=Currency.objects.filter(is_active=True),
        required=False,
        error_messages={"does_not_exist": "Elige una moneda activa."},
    )
    shopping_list = ShoppingListField(required=False)

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

    def default_category(self, has_list):
        """La categoría de la lista del supermercado, si se crea una lista sin elegirla."""
        category = Category.objects.filter(
            family=self.context["family"],
            is_shopping_list=True,
            is_active=True,
            movement_type__code=MovementType.EXPENSE,
        ).first()
        if not has_list:
            raise serializers.ValidationError({"category": "Elige una categoría."})
        if category is None:
            raise serializers.ValidationError({"category": NO_SHOPPING_CATEGORY})
        return category

    def validate(self, attrs):
        if self.instance is None and "month" not in attrs:
            raise serializers.ValidationError({"month": "Elige el mes del presupuesto."})
        has_list = "shopping_list" in attrs or (
            self.instance is not None and self.instance.shopping_list.exists()
        )
        if has_list and "amount" in attrs:
            raise serializers.ValidationError({"amount": FROM_LIST})
        if self.instance is None and not has_list and "amount" not in attrs:
            raise serializers.ValidationError({"amount": "Escribe el monto."})
        if self.instance is None and "category" not in attrs:
            attrs["category"] = self.default_category(has_list)

        currency = attrs.pop("currency", None)
        if "shopping_list" in attrs:
            attrs["amount"] = list_amount(attrs["shopping_list"])
        elif "amount" in attrs:
            currency = currency or Currency.objects.get(is_base=True)
            # Mismas reglas que un movimiento: tasa de hoy y límites en USD.
            attrs["amount"] = money_fields(attrs["amount"], currency)["amount"]
        return attrs


class ProposalSerializer(serializers.Serializer):
    """Las partidas que se eligieron de la propuesta: {"month", "items": [...]}."""

    month = serializers.DateField(input_formats=["%Y-%m"])
    items = serializers.ListField(child=serializers.DictField(), min_length=1, max_length=100)
