from django.db import IntegrityError, transaction
from django.db.models import Count, ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFamilyAdmin, IsFamilyMember

from .models import Category, Currency, MovementType, PaymentMethod
from .serializers import (
    CategoryAdminSerializer,
    CategoryCreateSerializer,
    CategorySerializer,
    CurrencySerializer,
    ItemUpdateSerializer,
    MovementTypeSerializer,
    PaymentMethodAdminSerializer,
    PaymentMethodCreateSerializer,
    PaymentMethodSerializer,
)

DUPLICATE_NAME = "Ya existe uno con este nombre."
LAST_ACTIVE = "Debe quedar al menos uno activo."
IN_BUDGET = "Esta categoría se usa en el presupuesto. Quita esas partidas o desactívala."
IN_USE = (
    "{label} tiene {count}. Desactíva{pronoun} para que no se pueda elegir; así no se pierde nada."
)


def bad_request(field, message):
    return Response({field: [message]}, status=status.HTTP_400_BAD_REQUEST)


def movements_text(count):
    return "1 movimiento" if count == 1 else f"{count} movimientos"


class CatalogsView(APIView):
    """Los cuatro catálogos en una sola respuesta, para llenar formularios."""

    permission_classes = [IsFamilyMember]

    def get(self, request):
        family = request.user.family
        categories = Category.objects.filter(family=family).select_related("movement_type")
        payment_methods = PaymentMethod.objects.filter(family=family)

        # Solo el administrador puede pedir también lo desactivado. Es la lista de
        # Configuración, y trae cuántos movimientos usan cada elemento (spec 009)
        # para saber cuáles se pueden borrar.
        wants_inactive = request.query_params.get("include_inactive") == "1"
        if wants_inactive and request.user.is_family_admin:
            category_serializer = CategoryAdminSerializer
            payment_method_serializer = PaymentMethodAdminSerializer
            categories = categories.annotate(movement_count=Count("movement"))
            payment_methods = payment_methods.annotate(movement_count=Count("movement"))
        else:
            category_serializer = CategorySerializer
            payment_method_serializer = PaymentMethodSerializer
            categories = categories.filter(is_active=True)
            payment_methods = payment_methods.filter(is_active=True)

        return Response(
            {
                "movement_types": MovementTypeSerializer(
                    MovementType.objects.all(), many=True
                ).data,
                "currencies": CurrencySerializer(
                    Currency.objects.filter(is_active=True), many=True
                ).data,
                "categories": category_serializer(categories, many=True).data,
                "payment_methods": payment_method_serializer(payment_methods, many=True).data,
            }
        )


def update_item(request, item, siblings, output_serializer):
    """Renombra, activa o desactiva una categoría o un método de pago.

    `siblings` son los demás elementos entre los que el nombre no puede
    repetirse y de los que siempre debe quedar uno activo: las categorías del
    mismo tipo, o los demás métodos de pago de la familia.
    """
    serializer = ItemUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    if "name" in data:
        if siblings.filter(name__iexact=data["name"]).exists():
            return bad_request("name", DUPLICATE_NAME)
        item.name = data["name"]

    if "is_active" in data:
        turning_off = item.is_active and not data["is_active"]
        if turning_off and not siblings.filter(is_active=True).exists():
            return bad_request("detail", LAST_ACTIVE)
        item.is_active = data["is_active"]

    item.save()
    item.movement_count = item.movement_set.count()
    return Response(output_serializer(item).data)


def in_use(item, label):
    """400 para algo que usan movimientos: "Esta categoría tiene 12 movimientos..."."""
    count = movements_text(item.movement_set.count())
    name, pronoun = label
    return bad_request("detail", IN_USE.format(label=name, pronoun=pronoun, count=count))


def delete_item(item, siblings, label):
    """Borra una categoría o un método de pago que ningún movimiento usa (spec 009).

    Si alguno lo usa, se responde 400: borrarlo dejaría movimientos sin
    categoría o sin método de pago. `label` es ("Esta categoría", "la") o
    ("Este método de pago", "lo"), para escribir bien el mensaje.
    """
    if item.movement_set.exists():
        return in_use(item, label)
    # Las categorías también las usa el presupuesto (spec 010); los métodos de pago no.
    if hasattr(item, "budget_items") and item.budget_items.exists():
        return bad_request("detail", IN_BUDGET)
    if item.is_active and not siblings.filter(is_active=True).exists():
        return bad_request("detail", LAST_ACTIVE)
    try:
        # Si alguien lo usa justo ahora, gana el movimiento: la base de datos
        # no deja borrar algo que un movimiento usa (PROTECT).
        with transaction.atomic():
            item.delete()
    except (ProtectedError, IntegrityError):
        return in_use(item, label)
    return Response(status=status.HTTP_204_NO_CONTENT)


class CategoryListView(APIView):
    permission_classes = [IsFamilyAdmin]

    def post(self, request):
        serializer = CategoryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        family = request.user.family

        same_type = Category.objects.filter(family=family, movement_type=data["movement_type"])
        if same_type.filter(name__iexact=data["name"]).exists():
            return bad_request("name", DUPLICATE_NAME)

        category = Category.objects.create(family=family, **data)
        category.movement_count = 0
        return Response(CategoryAdminSerializer(category).data, status=status.HTTP_201_CREATED)


class CategoryDetailView(APIView):
    permission_classes = [IsFamilyAdmin]

    def get_category(self, request, item_id):
        # Buscar dentro de la familia: lo de otra familia responde 404.
        category = get_object_or_404(Category, pk=item_id, family=request.user.family)
        siblings = Category.objects.filter(
            family=category.family, movement_type=category.movement_type
        ).exclude(pk=category.pk)
        return category, siblings

    def patch(self, request, item_id):
        category, siblings = self.get_category(request, item_id)
        return update_item(request, category, siblings, CategoryAdminSerializer)

    def delete(self, request, item_id):
        category, siblings = self.get_category(request, item_id)
        return delete_item(category, siblings, ("Esta categoría", "la"))


class PaymentMethodListView(APIView):
    permission_classes = [IsFamilyAdmin]

    def post(self, request):
        serializer = PaymentMethodCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data["name"]
        family = request.user.family

        if PaymentMethod.objects.filter(family=family, name__iexact=name).exists():
            return bad_request("name", DUPLICATE_NAME)

        payment_method = PaymentMethod.objects.create(family=family, name=name)
        payment_method.movement_count = 0
        return Response(
            PaymentMethodAdminSerializer(payment_method).data, status=status.HTTP_201_CREATED
        )


class PaymentMethodDetailView(APIView):
    permission_classes = [IsFamilyAdmin]

    def get_payment_method(self, request, item_id):
        payment_method = get_object_or_404(
            PaymentMethod, pk=item_id, family=request.user.family
        )
        siblings = PaymentMethod.objects.filter(family=payment_method.family).exclude(
            pk=payment_method.pk
        )
        return payment_method, siblings

    def patch(self, request, item_id):
        payment_method, siblings = self.get_payment_method(request, item_id)
        return update_item(request, payment_method, siblings, PaymentMethodAdminSerializer)

    def delete(self, request, item_id):
        payment_method, siblings = self.get_payment_method(request, item_id)
        return delete_item(payment_method, siblings, ("Este método de pago", "lo"))
