from decimal import Decimal

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import CanEditMovements, IsFamilyMember
from catalogs.models import Currency, MovementType
from rates.services import NO_RATE_MESSAGE, rate_data, today_rate

from .models import Movement
from .serializers import MovementFilterSerializer, MovementSerializer, MovementWriteSerializer


def month_totals(movements, convert):
    """Suma de ingresos, suma de gastos y su diferencia, en la moneda que se ve.

    Se suma en USD y se convierte cada total, para no acumular redondeos.
    """
    rows = movements.values("category__movement_type__code").annotate(total=Sum("amount"))
    by_type = {row["category__movement_type__code"]: row["total"] for row in rows}
    income = by_type.get(MovementType.INCOME, Decimal("0.00"))
    expense = by_type.get(MovementType.EXPENSE, Decimal("0.00"))
    # Como texto, igual que los montos de cada movimiento, para no perder decimales.
    income, expense = convert(income), convert(expense)
    # El balance se resta ya convertido para que en pantalla cuadre al céntimo.
    return {
        "income": str(income),
        "expense": str(expense),
        "balance": str(income - expense),
    }


def output(movement, request):
    return MovementSerializer(movement, context={"user": request.user}).data


class MovementListView(APIView):
    def get_permissions(self):
        # Todos los miembros leen; solo administradores y editores registran.
        if self.request.method == "POST":
            return [CanEditMovements()]
        return [IsFamilyMember()]

    def get(self, request):
        filters = MovementFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        month = filters.validated_data.get("month") or timezone.localdate()

        # Siempre la tasa de hoy, también para los meses pasados (spec 005).
        rate = today_rate()
        currency = filters.validated_data.get("currency") or Currency.objects.get(is_base=True)
        if not currency.is_base and currency.code not in rate.bs_per_unit:
            return Response({"currency": [NO_RATE_MESSAGE]}, status=status.HTTP_400_BAD_REQUEST)

        def convert(amount):
            """De USD a la moneda que se está viendo."""
            return amount if currency.is_base else rate.from_usd(amount, currency.code)

        in_month = Movement.objects.filter(
            family=request.user.family, date__year=month.year, date__month=month.month
        )

        # Los totales son los del mes completo: no dependen de los filtros.
        movements = in_month.select_related(
            "category__movement_type", "payment_method", "created_by", "original_currency"
        )
        if "type" in filters.validated_data:
            movements = movements.filter(category__movement_type=filters.validated_data["type"])
        if "category" in filters.validated_data:
            movements = movements.filter(category_id=filters.validated_data["category"])

        return Response(
            {
                "month": month.strftime("%Y-%m"),
                "currency": currency.code,
                "rate": rate_data(rate),
                "totals": month_totals(in_month, convert),
                "movements": MovementSerializer(
                    movements, many=True, context={"user": request.user, "convert": convert}
                ).data,
            }
        )

    def post(self, request):
        family = request.user.family
        serializer = MovementWriteSerializer(data=request.data, context={"family": family})
        serializer.is_valid(raise_exception=True)

        movement = Movement.objects.create(
            family=family, created_by=request.user, **serializer.validated_data
        )
        return Response(output(movement, request), status=status.HTTP_201_CREATED)


class MovementDetailView(APIView):
    permission_classes = [CanEditMovements]

    def get_movement(self, request, movement_id):
        # Buscar dentro de la familia: lo de otra familia responde 404.
        movement = get_object_or_404(Movement, pk=movement_id, family=request.user.family)
        if not movement.can_be_edited_by(request.user):
            raise PermissionDenied("Solo puedes modificar los movimientos que anotaste tú.")
        return movement

    def patch(self, request, movement_id):
        movement = self.get_movement(request, movement_id)
        serializer = MovementWriteSerializer(
            movement,
            data=request.data,
            partial=True,  # se puede enviar solo lo que cambia
            context={"family": request.user.family},
        )
        serializer.is_valid(raise_exception=True)

        for field, value in serializer.validated_data.items():
            setattr(movement, field, value)
        movement.save()
        return Response(output(movement, request))

    def delete(self, request, movement_id):
        self.get_movement(request, movement_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
