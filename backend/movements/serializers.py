import datetime
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from catalogs.models import Category, Currency, MovementType, PaymentMethod
from rates.services import NO_RATE_MESSAGE, today_rate

from .models import Movement

MAX_AMOUNT = Decimal("9999999.99")
MIN_DATE = datetime.date(2000, 1, 1)


class MovementSerializer(serializers.ModelSerializer):
    """Lo que la API devuelve de un movimiento.

    `amount` sale en USD, salvo que el contexto traiga `convert`: una función
    que pasa de USD a la moneda que se está viendo.
    """

    amount = serializers.SerializerMethodField()
    original_currency = serializers.CharField(source="original_currency.code")
    movement_type = serializers.CharField(source="category.movement_type.code")
    category = serializers.SerializerMethodField()
    payment_method = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Movement
        fields = [
            "id",
            "date",
            "amount",
            "original_amount",
            "original_currency",
            "description",
            "movement_type",
            "category",
            "payment_method",
            "created_by",
            "can_edit",
        ]

    def get_amount(self, movement):
        convert = self.context.get("convert")
        # Como texto, para no perder decimales.
        return str(convert(movement.amount) if convert else movement.amount)

    def get_category(self, movement):
        return {"id": movement.category_id, "name": movement.category.name}

    def get_payment_method(self, movement):
        return {"id": movement.payment_method_id, "name": movement.payment_method.name}

    def get_created_by(self, movement):
        return {"id": movement.created_by_id, "full_name": movement.created_by.full_name}

    def get_can_edit(self, movement):
        # Solo sirve para que el frontend muestre u oculte botones.
        # La API lo vuelve a comprobar en cada PATCH y DELETE.
        return movement.can_be_edited_by(self.context["user"])


class MovementWriteSerializer(serializers.Serializer):
    """Datos para crear o corregir un movimiento.

    Necesita `context={"family": ...}`. Al corregir se le pasa también el
    movimiento, para permitirle conservar una categoría ya desactivada.

    `amount` es lo que la persona escribió, en la moneda `currency` (USD si
    falta). Al validar se convierte a USD y se devuelven los campos del modelo:
    `amount` (USD), `original_amount`, `original_currency` y `exchange_rate`.
    """

    category = serializers.IntegerField()
    payment_method = serializers.IntegerField()
    # El tope en USD se comprueba después de convertir; aquí solo que quepa.
    amount = serializers.DecimalField(
        max_digits=16, decimal_places=2, min_value=Decimal("0.01")
    )
    # Se aceptan todas; validate_currency deja pasar una desactivada solo si
    # es la que el movimiento ya tenía (como con las categorías).
    currency = serializers.SlugRelatedField(
        slug_field="code",
        queryset=Currency.objects.all(),
        required=False,
        error_messages={"does_not_exist": "Elige una moneda activa."},
    )
    date = serializers.DateField()
    description = serializers.CharField(max_length=200, allow_blank=True, required=False)

    def find_option(self, model, item_id, current, message):
        """Busca una categoría o método de pago entre los que se pueden elegir."""
        item = model.objects.filter(family=self.context["family"], pk=item_id).first()
        # Vale si está activo, o si es el que el movimiento ya tenía.
        if item is None or not (item.is_active or item == current):
            raise serializers.ValidationError(message)
        return item

    def validate_category(self, value):
        current = self.instance.category if self.instance else None
        return self.find_option(
            Category, value, current, "Elige una categoría activa de tu familia."
        )

    def validate_payment_method(self, value):
        current = self.instance.payment_method if self.instance else None
        return self.find_option(
            PaymentMethod, value, current, "Elige un método de pago activo de tu familia."
        )

    def validate_currency(self, value):
        current = self.instance.original_currency if self.instance else None
        if not (value.is_active or value == current):
            raise serializers.ValidationError("Elige una moneda activa.")
        return value

    def validate_date(self, value):
        # localdate() usa la zona horaria del proyecto (Venezuela).
        if value > timezone.localdate():
            raise serializers.ValidationError("La fecha no puede ser futura.")
        if value < MIN_DATE:
            raise serializers.ValidationError("La fecha no puede ser anterior al año 2000.")
        return value

    def validate(self, attrs):
        currency = attrs.pop("currency", None)
        if "amount" not in attrs and currency is None:
            return attrs  # una corrección que no toca el dinero

        movement = self.instance
        if movement:
            amount = attrs.get("amount", movement.original_amount)
            currency = currency or movement.original_currency
            # Si el dinero no cambió, el monto en USD tampoco (spec 005, regla 3).
            if amount == movement.original_amount and currency == movement.original_currency:
                attrs.pop("amount", None)
                return attrs
        else:
            amount = attrs["amount"]
            currency = currency or Currency.objects.get(is_base=True)

        attrs.update(money_fields(amount, currency))
        return attrs


def money_fields(amount, currency):
    """Convierte lo escrito a USD con la tasa de hoy y comprueba los límites."""
    if currency.is_base:
        usd, exchange_rate = amount, None
    else:
        rate = today_rate()
        if currency.code not in rate.bs_per_unit:
            raise serializers.ValidationError({"currency": NO_RATE_MESSAGE})
        usd = rate.to_usd(amount, currency.code)
        exchange_rate = rate.bs_per_unit[currency.code]

    if usd < Decimal("0.01"):
        raise serializers.ValidationError(
            {"amount": "El monto es muy pequeño: en dólares queda por debajo de 0,01."}
        )
    if usd > MAX_AMOUNT:
        raise serializers.ValidationError(
            {"amount": "El monto supera el máximo de 9.999.999,99 dólares."}
        )
    return {
        "amount": usd,
        "original_amount": amount,
        "original_currency": currency,
        "exchange_rate": exchange_rate,
    }


class MovementFilterSerializer(serializers.Serializer):
    """Filtros de la lista: ?month=2026-10&type=expense&category=7"""

    # "2026-10" se convierte en el día 1 de ese mes.
    month = serializers.DateField(input_formats=["%Y-%m"], required=False)
    type = serializers.SlugRelatedField(
        slug_field="code", queryset=MovementType.objects.all(), required=False
    )
    category = serializers.IntegerField(required=False)
    # Moneda en la que se ven montos y totales. Si falta, USD.
    currency = serializers.SlugRelatedField(
        slug_field="code",
        queryset=Currency.objects.filter(is_active=True),
        required=False,
        error_messages={"does_not_exist": "Elige una moneda activa."},
    )
