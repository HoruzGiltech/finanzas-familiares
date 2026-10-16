from rest_framework import serializers

from .models import Category, Currency, MovementType, PaymentMethod


def clean_name(value):
    """Quita espacios sobrantes: '  Pago   móvil ' -> 'Pago móvil'."""
    return " ".join(value.split())


class MovementTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MovementType
        fields = ["id", "code", "name"]


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = ["id", "code", "name", "symbol", "is_base"]


class CategorySerializer(serializers.ModelSerializer):
    """Lo que la API devuelve de una categoría. El tipo va como 'income' o 'expense'."""

    movement_type = serializers.SlugRelatedField(slug_field="code", read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "movement_type", "is_active", "is_shopping_list"]


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = ["id", "name", "is_active"]


class CategoryAdminSerializer(CategorySerializer):
    """Para Configuración: también cuántos movimientos la usan (spec 009).

    `movement_count` lo pone la vista en el objeto (con annotate o a mano).
    """

    movement_count = serializers.IntegerField(read_only=True)

    class Meta(CategorySerializer.Meta):
        fields = CategorySerializer.Meta.fields + ["movement_count"]


class PaymentMethodAdminSerializer(PaymentMethodSerializer):
    movement_count = serializers.IntegerField(read_only=True)

    class Meta(PaymentMethodSerializer.Meta):
        fields = PaymentMethodSerializer.Meta.fields + ["movement_count"]


class CategoryCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=60)
    movement_type = serializers.SlugRelatedField(
        slug_field="code", queryset=MovementType.objects.all()
    )

    def validate_name(self, value):
        return clean_name(value)


class PaymentMethodCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=60)

    def validate_name(self, value):
        return clean_name(value)


class ItemUpdateSerializer(serializers.Serializer):
    """Cambios permitidos en una categoría o método de pago: nombre y estado.

    El tipo de una categoría no está aquí a propósito: no se puede cambiar.
    """

    name = serializers.CharField(max_length=60, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_name(self, value):
        return clean_name(value)
