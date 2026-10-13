import datetime
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from catalogs.models import Category, MovementType, PaymentMethod

from .models import Movement

MAX_AMOUNT = Decimal("9999999.99")
MIN_DATE = datetime.date(2000, 1, 1)


class MovementSerializer(serializers.ModelSerializer):
    """Lo que la API devuelve de un movimiento."""

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
            "description",
            "movement_type",
            "category",
            "payment_method",
            "created_by",
            "can_edit",
        ]

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
    """

    category = serializers.IntegerField()
    payment_method = serializers.IntegerField()
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01"), max_value=MAX_AMOUNT
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

    def validate_date(self, value):
        # localdate() usa la zona horaria del proyecto (Venezuela).
        if value > timezone.localdate():
            raise serializers.ValidationError("La fecha no puede ser futura.")
        if value < MIN_DATE:
            raise serializers.ValidationError("La fecha no puede ser anterior al año 2000.")
        return value


class MovementFilterSerializer(serializers.Serializer):
    """Filtros de la lista: ?month=2026-10&type=expense&category=7"""

    # "2026-10" se convierte en el día 1 de ese mes.
    month = serializers.DateField(input_formats=["%Y-%m"], required=False)
    type = serializers.SlugRelatedField(
        slug_field="code", queryset=MovementType.objects.all(), required=False
    )
    category = serializers.IntegerField(required=False)
