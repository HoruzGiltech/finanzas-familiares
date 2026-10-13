from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsFamilyAdmin, IsFamilyMember

from .models import Category, Currency, MovementType, PaymentMethod
from .serializers import (
    CategoryCreateSerializer,
    CategorySerializer,
    CurrencySerializer,
    ItemUpdateSerializer,
    MovementTypeSerializer,
    PaymentMethodCreateSerializer,
    PaymentMethodSerializer,
)

DUPLICATE_NAME = "Ya existe uno con este nombre."
LAST_ACTIVE = "Debe quedar al menos uno activo."


def bad_request(field, message):
    return Response({field: [message]}, status=status.HTTP_400_BAD_REQUEST)


class CatalogsView(APIView):
    """Los cuatro catálogos en una sola respuesta, para llenar formularios."""

    permission_classes = [IsFamilyMember]

    def get(self, request):
        family = request.user.family
        categories = Category.objects.filter(family=family).select_related("movement_type")
        payment_methods = PaymentMethod.objects.filter(family=family)

        # Solo el administrador puede pedir también lo desactivado.
        wants_inactive = request.query_params.get("include_inactive") == "1"
        if not (wants_inactive and request.user.is_family_admin):
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
                "categories": CategorySerializer(categories, many=True).data,
                "payment_methods": PaymentMethodSerializer(payment_methods, many=True).data,
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
    return Response(output_serializer(item).data)


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
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)


class CategoryDetailView(APIView):
    permission_classes = [IsFamilyAdmin]

    def patch(self, request, item_id):
        # Buscar dentro de la familia: lo de otra familia responde 404.
        category = get_object_or_404(Category, pk=item_id, family=request.user.family)
        siblings = Category.objects.filter(
            family=category.family, movement_type=category.movement_type
        ).exclude(pk=category.pk)
        return update_item(request, category, siblings, CategorySerializer)


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
        return Response(
            PaymentMethodSerializer(payment_method).data, status=status.HTTP_201_CREATED
        )


class PaymentMethodDetailView(APIView):
    permission_classes = [IsFamilyAdmin]

    def patch(self, request, item_id):
        payment_method = get_object_or_404(
            PaymentMethod, pk=item_id, family=request.user.family
        )
        siblings = PaymentMethod.objects.filter(family=payment_method.family).exclude(
            pk=payment_method.pk
        )
        return update_item(request, payment_method, siblings, PaymentMethodSerializer)
