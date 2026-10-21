from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import CanEditMovements
from catalogs.models import Currency, MovementType
from movements.comparison import shift_month
from movements.money import CLP_CODE, movement_amount
from movements.models import Movement
from movements.serializers import MovementWriteSerializer
from movements.views import read_view

from .models import BudgetItem, ShoppingListItem
from .serializers import (
    BudgetItemWriteSerializer,
    ProposalSerializer,
    ShoppingListSerializer,
    list_amount,
)

ZERO = Decimal("0.00")
ALREADY_DONE = "Esta partida ya está realizada."
NOT_DONE = "Esta partida todavía no está realizada."
LIST_LOCKED = "La lista de una partida realizada no se cambia: deshazla antes."


def movement_data(movement, convert, user, currency_code="USD", rate=None):
    """El movimiento de una partida realizada."""
    amount = (
        movement_amount(movement, currency_code, rate)
        if rate is not None
        else convert(movement.amount)
    )
    return {
        "id": movement.id,
        "date": movement.date.isoformat(),
        "amount": str(amount),
        "original_amount": str(movement.original_amount),
        "original_currency": movement.original_currency.code,
        "payment_method": movement.payment_method.name,
        # Deshacer borra el movimiento: solo quien podría borrarlo (spec 004).
        "can_undo": movement.can_be_edited_by(user),
    }


def shopping_list_data(item):
    """Los productos de la lista, en USD: así se escriben (spec 011)."""
    return [
        {
            "id": line.id,
            "name": line.name,
            "quantity": str(line.quantity),
            "unit_price": str(line.unit_price),
            "total": str(line.total),
        }
        for line in item.shopping_list.all()
    ]


def save_shopping_list(item, lines):
    """Reemplaza la lista de la partida por `lines`, en el orden en que llegan."""
    item.shopping_list.all().delete()
    ShoppingListItem.objects.bulk_create(
        ShoppingListItem(budget_item=item, position=position, **line)
        for position, line in enumerate(lines)
    )


def create_item(family, user, data):
    """Crea una partida y, si la trae, su lista."""
    lines = data.pop("shopping_list", None)
    item = BudgetItem.objects.create(family=family, created_by=user, **data)
    if lines:
        save_shopping_list(item, lines)
    return item


def budget_amount(item, currency_code, rate):
    """El monto mostrado, preservando el original cuando se ve esa moneda."""
    if item.original_currency.code == currency_code:
        amount = item.original_amount
    elif currency_code == "USD":
        amount = item.amount
    else:
        amount = rate.from_usd(item.amount, currency_code)
    if currency_code == CLP_CODE:
        return amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return amount


def item_data(item, convert, user, currency_code="USD", rate=None):
    """Lo que la API devuelve de una partida. Los montos, en la moneda que se ve."""
    amount = (
        budget_amount(item, currency_code, rate)
        if rate is not None
        else convert(item.amount)
    )
    return {
        "id": item.id,
        "month": item.month.strftime("%Y-%m"),
        "description": item.description,
        "category": {"id": item.category_id, "name": item.category.name},
        "amount": str(amount),
        "movement": (
            movement_data(item.movement, convert, user, currency_code, rate)
            if item.is_done
            else None
        ),
        "shopping_list": shopping_list_data(item),
    }


def items_of(family, month):
    return (
        BudgetItem.objects.filter(family=family, month=month)
        .select_related(
            "category",
            "original_currency",
            "movement__payment_method",
            "movement__original_currency",
        )
        .prefetch_related("shopping_list")
        .order_by("-amount", "description", "id")  # de mayor a menor (spec 011)
    )


def has_items(family, month):
    return BudgetItem.objects.filter(family=family, month=month).exists()


class BudgetView(APIView):
    """El presupuesto de un mes con sus totales. Lo ve cualquier miembro."""

    def get(self, request):
        view = read_view(request)
        family = request.user.family
        month = view.month.replace(day=1)
        items = list(items_of(family, month))

        if view.currency.code == CLP_CODE:
            planned = sum(
                (budget_amount(item, CLP_CODE, view.rate) for item in items),
                ZERO,
            )
            done = sum(
                (
                    movement_amount(item.movement, CLP_CODE, view.rate)
                    for item in items
                    if item.is_done
                ),
                ZERO,
            )
            pending = sum(
                (
                    budget_amount(item, CLP_CODE, view.rate)
                    for item in items
                    if not item.is_done
                ),
                ZERO,
            )
        else:
            planned = sum((item.amount for item in items), ZERO)
            done = sum((item.movement.amount for item in items if item.is_done), ZERO)
            pending = sum((item.amount for item in items if not item.is_done), ZERO)
        # Gastos del mes que no vienen de ninguna partida.
        unplanned_movements = view.movements.filter(
            category__movement_type__code=MovementType.EXPENSE, budget_item__isnull=True
        )
        if view.currency.code == CLP_CODE:
            unplanned = sum(
                (
                    movement_amount(movement, CLP_CODE, view.rate)
                    for movement in unplanned_movements.select_related("original_currency")
                ),
                ZERO,
            )
        else:
            unplanned = (
                unplanned_movements.aggregate(total=Sum("amount"))["total"] or ZERO
            )

        if view.currency.code == CLP_CODE:
            totals = {
                "planned": str(planned.quantize(Decimal("1"))),
                "done": str(done.quantize(Decimal("1"))),
                "pending": str(pending.quantize(Decimal("1"))),
                "unplanned": str(unplanned.quantize(Decimal("1"))),
            }
        else:
            totals = {
                "planned": str(view.convert(planned)),
                "done": str(view.convert(done)),
                "pending": str(view.convert(pending)),
                "unplanned": str(view.convert(unplanned)),
            }

        return Response(
            {
                **view.header(),
                "totals": totals,
                # La propuesta se ofrece si este mes está vacío y el anterior no.
                "can_propose": not items and has_items(family, shift_month(month, -1)),
                "items": [
                    item_data(
                        item,
                        view.convert,
                        request.user,
                        view.currency.code,
                        view.rate,
                    )
                    for item in items
                ],
            }
        )


def base_convert(amount):
    """Las respuestas de escritura van en USD, la moneda en que se guarda."""
    return amount


class BudgetItemListView(APIView):
    permission_classes = [CanEditMovements]

    def post(self, request):
        family = request.user.family
        serializer = BudgetItemWriteSerializer(data=request.data, context={"family": family})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            item = create_item(family, request.user, serializer.validated_data)
        return Response(item_data(item, base_convert, request.user), status=status.HTTP_201_CREATED)


class BudgetItemDetailView(APIView):
    # Cualquier administrador o editor toca cualquier partida: es un plan común.
    permission_classes = [CanEditMovements]

    def get_item(self, request, item_id):
        # Buscar dentro de la familia: lo de otra familia responde 404.
        related = BudgetItem.objects.select_related(
            "category", "movement__payment_method", "movement__original_currency"
        )
        return get_object_or_404(related, pk=item_id, family=request.user.family)

    @transaction.atomic
    def patch(self, request, item_id):
        # select_for_update: que una lista guardada a la vez no descuadre el monto.
        item = get_object_or_404(
            BudgetItem.objects.select_for_update(), pk=item_id, family=request.user.family
        )
        # El mes no cambia; la lista se cambia con su propia ruta.
        data = {
            key: value
            for key, value in request.data.items()
            if key not in ("month", "shopping_list")
        }
        serializer = BudgetItemWriteSerializer(
            item, data=data, partial=True, context={"family": request.user.family}
        )
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(item, field, value)
        item.save()
        return Response(item_data(item, base_convert, request.user))

    def delete(self, request, item_id):
        # Si estaba realizada, su movimiento se queda: el gasto se hizo igual.
        self.get_item(request, item_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShoppingListView(APIView):
    """Reemplaza la lista de una partida y recalcula su monto (spec 011)."""

    permission_classes = [CanEditMovements]

    def put(self, request, item_id):
        serializer = ShoppingListSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lines = serializer.validated_data["shopping_list"]
        with transaction.atomic():
            item = get_object_or_404(
                BudgetItem.objects.select_for_update(), pk=item_id, family=request.user.family
            )
            if item.is_done:
                raise ValidationError({"detail": [LIST_LOCKED]})
            item.amount = list_amount(lines)
            item.original_amount = item.amount
            item.original_currency = Currency.objects.get(is_base=True)
            item.save()
            save_shopping_list(item, lines)
        item = items_of(request.user.family, item.month).get(pk=item.pk)
        return Response(item_data(item, base_convert, request.user))


class RealizeView(APIView):
    """Marca una partida como realizada: crea su movimiento (spec 010, regla 7)."""

    permission_classes = [CanEditMovements]

    def post(self, request, item_id):
        family = request.user.family
        with transaction.atomic():
            # select_for_update: dos clics seguidos no crean dos movimientos.
            item = get_object_or_404(
                BudgetItem.objects.select_for_update(), pk=item_id, family=family
            )
            if item.is_done:
                raise ValidationError({"detail": [ALREADY_DONE]})
            # Se valida como cualquier movimiento nuevo: método de pago, monto,
            # moneda (tasa de hoy) y fecha.
            serializer = MovementWriteSerializer(
                data={
                    "category": item.category_id,
                    "description": item.description,
                    "payment_method": request.data.get("payment_method"),
                    "amount": request.data.get("amount"),
                    "currency": request.data.get("currency", "USD"),
                    "date": request.data.get("date"),
                },
                context={"family": family},
            )
            serializer.is_valid(raise_exception=True)
            item.movement = Movement.objects.create(
                family=family, created_by=request.user, **serializer.validated_data
            )
            item.save()
        item = items_of(family, item.month).get(pk=item.pk)
        return Response(item_data(item, base_convert, request.user))


class UndoView(APIView):
    """Deshace una partida realizada: borra su movimiento y la deja pendiente."""

    permission_classes = [CanEditMovements]

    def post(self, request, item_id):
        item = get_object_or_404(
            BudgetItem.objects.select_related("movement"), pk=item_id, family=request.user.family
        )
        if not item.is_done:
            raise ValidationError({"detail": [NOT_DONE]})
        if not item.movement.can_be_edited_by(request.user):
            raise PermissionDenied("Solo puede deshacerla quien anotó el gasto o un administrador.")
        # Al borrar el movimiento, la partida queda pendiente sola (SET_NULL).
        item.movement.delete()
        item.refresh_from_db()
        return Response(item_data(item, base_convert, request.user))


class MonthParamSerializer(serializers.Serializer):
    month = serializers.DateField(input_formats=["%Y-%m"])


def proposed_amount(item):
    """Lo que realmente se gastó si se realizó; si no, lo previsto. Con lista, su total."""
    if item.is_done and not item.shopping_list.all():
        return item.movement.amount
    return item.amount


class ProposalView(APIView):
    """La propuesta del mes a partir del anterior (spec 010, sección 4). Todo en USD."""

    permission_classes = [CanEditMovements]

    def get(self, request):
        params = MonthParamSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        family = request.user.family
        previous = shift_month(params.validated_data["month"].replace(day=1), -1)

        items = [
            {
                "description": item.description,
                "category": {"id": item.category_id, "name": item.category.name},
                "proposed": str(proposed_amount(item)),
                "planned": str(item.amount),
                "spent": str(item.movement.amount) if item.is_done else None,
                # La lista se copia; su total es el monto (spec 011, sección 3.5).
                "shopping_list": shopping_list_data(item),
            }
            for item in items_of(family, previous)
        ]
        # Gastos del mes anterior que no venían de ninguna partida, por categoría.
        unplanned = (
            Movement.objects.filter(
                family=family,
                date__year=previous.year,
                date__month=previous.month,
                category__movement_type__code=MovementType.EXPENSE,
                budget_item__isnull=True,
            )
            .values("category_id", "category__name")
            .annotate(total=Sum("amount"))
            .order_by("-total", "category__name")
        )
        return Response(
            {
                "month": params.validated_data["month"].strftime("%Y-%m"),
                "previous_month": previous.strftime("%Y-%m"),
                "items": items,
                "unplanned": [
                    {
                        "category": {"id": row["category_id"], "name": row["category__name"]},
                        "amount": str(row["total"]),
                    }
                    for row in unplanned
                ],
            }
        )

    def post(self, request):
        family = request.user.family
        proposal = ProposalSerializer(data=request.data)
        proposal.is_valid(raise_exception=True)
        month_text = proposal.validated_data["month"].strftime("%Y-%m")

        # Cada partida se valida como una partida nueva; si una falla, no se crea ninguna.
        valid, errors = [], {}
        for index, data in enumerate(proposal.validated_data["items"]):
            item = BudgetItemWriteSerializer(
                data={**data, "month": month_text}, context={"family": family}
            )
            if item.is_valid():
                valid.append(item.validated_data)
            else:
                errors[str(index)] = item.errors
        if errors:
            raise ValidationError({"items": errors})

        with transaction.atomic():
            created = [create_item(family, request.user, data) for data in valid]
        return Response(
            [item_data(item, base_convert, request.user) for item in created],
            status=status.HTTP_201_CREATED,
        )
