from decimal import Decimal

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import CanEditMovements, IsFamilyMember
from catalogs.models import MovementType

from .models import Movement
from .serializers import MovementFilterSerializer, MovementSerializer, MovementWriteSerializer


def month_totals(movements):
    """Suma de ingresos, suma de gastos y su diferencia."""
    rows = movements.values("category__movement_type__code").annotate(total=Sum("amount"))
    by_type = {row["category__movement_type__code"]: row["total"] for row in rows}
    income = by_type.get(MovementType.INCOME, Decimal("0.00"))
    expense = by_type.get(MovementType.EXPENSE, Decimal("0.00"))
    # Como texto, igual que los montos de cada movimiento, para no perder decimales.
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

        in_month = Movement.objects.filter(
            family=request.user.family, date__year=month.year, date__month=month.month
        )

        # Los totales son los del mes completo: no dependen de los filtros.
        movements = in_month.select_related(
            "category__movement_type", "payment_method", "created_by"
        )
        if "type" in filters.validated_data:
            movements = movements.filter(category__movement_type=filters.validated_data["type"])
        if "category" in filters.validated_data:
            movements = movements.filter(category_id=filters.validated_data["category"])

        return Response(
            {
                "month": month.strftime("%Y-%m"),
                "totals": month_totals(in_month),
                "movements": MovementSerializer(
                    movements, many=True, context={"user": request.user}
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
