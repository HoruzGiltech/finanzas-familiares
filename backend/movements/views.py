import datetime
from dataclasses import dataclass
from decimal import Decimal

from django.db.models import QuerySet, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import CanEditMovements, IsFamilyMember
from catalogs.models import Currency, MovementType
from rates.services import NO_RATE_MESSAGE, TodayRate, rate_data, today_rate

from . import comparison, export, summary
from .money import CLP_CODE, movement_amount
from .models import Movement
from .serializers import (
    ExportFilterSerializer,
    MovementFilterSerializer,
    MovementSerializer,
    MovementWriteSerializer,
)


def month_totals(movements, view):
    """Suma de ingresos, suma de gastos y su diferencia, en la moneda que se ve.

    En CLP se suman los importes individuales para que coincidan con las filas.
    """
    if view.currency.code == CLP_CODE:
        rows = movements.select_related("category__movement_type", "original_currency")
        totals = {MovementType.INCOME: Decimal("0"), MovementType.EXPENSE: Decimal("0")}
        for movement in rows:
            code = movement.category.movement_type.code
            totals[code] += view.amount_for_movement(movement)
        income = totals[MovementType.INCOME]
        expense = totals[MovementType.EXPENSE]
        return {
            "income": str(income),
            "expense": str(expense),
            "balance": str(income - expense),
        }

    rows = movements.values("category__movement_type__code").annotate(total=Sum("amount"))
    by_type = {row["category__movement_type__code"]: row["total"] for row in rows}
    income = by_type.get(MovementType.INCOME, Decimal("0.00"))
    expense = by_type.get(MovementType.EXPENSE, Decimal("0.00"))
    # Como texto, igual que los montos de cada movimiento, para no perder decimales.
    income, expense = view.convert(income), view.convert(expense)
    # El balance se resta ya convertido para que en pantalla cuadre al céntimo.
    return {
        "income": str(income),
        "expense": str(expense),
        "balance": str(income - expense),
    }


@dataclass
class MonthView:
    """El mes y la moneda que se están viendo, con la tasa de hoy."""

    filters: dict
    month: datetime.date
    currency: Currency
    rate: TodayRate
    movements: QuerySet  # los del mes completo, de la familia

    def convert(self, amount):
        """De USD a la moneda que se está viendo."""
        if self.currency.is_base:
            return amount
        return self.rate.from_usd(amount, self.currency.code)

    def amount_for_movement(self, movement):
        return movement_amount(movement, self.currency.code, self.rate)

    def header(self):
        """Lo que toda respuesta del mes repite: mes, moneda y tasa."""
        return {
            "month": self.month.strftime("%Y-%m"),
            "currency": self.currency.code,
            "rate": rate_data(self.rate),
        }


def read_view(request):
    """Valida los filtros de la URL. Sin tasa, pedir otra moneda responde 400."""
    filters = MovementFilterSerializer(data=request.query_params)
    filters.is_valid(raise_exception=True)
    data = filters.validated_data
    month = data.get("month") or timezone.localdate()

    # Siempre la tasa de hoy, también para los meses pasados (spec 005).
    rate = today_rate()
    currency = data.get("currency") or Currency.objects.get(is_base=True)
    if not currency.is_base and currency.code not in rate.bs_per_unit:
        raise ValidationError({"currency": [NO_RATE_MESSAGE]})

    movements = Movement.objects.filter(
        family=request.user.family, date__year=month.year, date__month=month.month
    )
    return MonthView(data, month, currency, rate, movements)


def output(movement, request):
    return MovementSerializer(movement, context={"user": request.user}).data


class MovementListView(APIView):
    def get_permissions(self):
        # Todos los miembros leen; solo administradores y editores registran.
        if self.request.method == "POST":
            return [CanEditMovements()]
        return [IsFamilyMember()]

    def get(self, request):
        view = read_view(request)
        filters = view.filters

        # Los totales son los del mes completo: no dependen de los filtros.
        movements = view.movements.select_related(
            "category__movement_type", "payment_method", "created_by", "original_currency"
        )
        if "type" in filters:
            movements = movements.filter(category__movement_type=filters["type"])
        if "category" in filters:
            movements = movements.filter(category_id=filters["category"])

        return Response(
            {
                **view.header(),
                "totals": month_totals(view.movements, view),
                "movements": MovementSerializer(
                    movements,
                    many=True,
                    context={
                        "user": request.user,
                        "convert": view.convert,
                        "display_amount": view.amount_for_movement,
                    },
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


class MovementSummaryView(APIView):
    """Resumen del mes para el dashboard. Lo ve cualquier miembro (spec 006)."""

    def get(self, request):
        view = read_view(request)
        return Response(
            {
                **view.header(),
                "totals": month_totals(view.movements, view),
                **summary.expense_summary(
                    view.movements,
                    view.convert,
                    display_amount=(
                        view.amount_for_movement if view.currency.code == CLP_CODE else None
                    ),
                ),
            }
        )


class MovementComparisonView(APIView):
    """El mes frente a los anteriores. Lo ve cualquier miembro (spec 007)."""

    def get(self, request):
        view = read_view(request)
        month = view.month.replace(day=1)
        family_movements = Movement.objects.filter(family=request.user.family)
        return Response(
            {
                **view.header(),
                **comparison.comparison(
                    family_movements,
                    month,
                    timezone.localdate(),
                    view.convert,
                    display_amount=(
                        view.amount_for_movement if view.currency.code == CLP_CODE else None
                    ),
                ),
            }
        )


class MovementExportView(APIView):
    """Los movimientos de un rango en CSV. Lo descarga cualquier miembro (spec 008)."""

    def get(self, request):
        filters = ExportFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        start, end = filters.validated_data["from"], filters.validated_data["to"]

        movements = (
            Movement.objects.filter(family=request.user.family, date__range=(start, end))
            .select_related(
                "category__movement_type", "payment_method", "created_by", "original_currency"
            )
            .order_by("date", "id")  # del más antiguo al más reciente
        )
        rate = today_rate()
        if CLP_CODE not in rate.bs_per_unit:
            raise ValidationError({"currency": [export.NO_CLP_RATE_MESSAGE]})
        response = HttpResponse(
            export.movements_csv(movements, rate),
            content_type="text/csv; charset=utf-8",
        )
        filename = f"movimientos-{start.isoformat()}-a-{end.isoformat()}.csv"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


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
