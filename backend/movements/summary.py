"""
Resumen de los gastos de un mes para el dashboard (spec 006).

En las monedas actuales se suma en USD y se convierte cada total al final. En
CLP se suman los importes redondeados por movimiento para que cuadren las filas.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, Sum

from catalogs.models import MovementType

TOP_EXPENSES = 5  # cuántos gastos grandes se muestran
ONE_DECIMAL = Decimal("0.1")


def percent(part, total):
    """Qué parte de `total` es `part`, con un decimal y como texto: "35.5"."""
    return str((part * 100 / total).quantize(ONE_DECIMAL, rounding=ROUND_HALF_UP))


def grouped(expenses, field, total, convert, display_amount=None):
    """Gastos sumados por categoría o por método de pago, de mayor a menor."""
    if display_amount:
        grouped_rows = {}
        for movement in expenses.select_related(
            "category", "payment_method", "original_currency"
        ):
            item = getattr(movement, field)
            key = (item.id, item.name)
            row = grouped_rows.setdefault(key, {"amount": Decimal("0"), "count": 0})
            row["amount"] += display_amount(movement)
            row["count"] += 1
        return [
            {
                "id": item_id,
                "name": name,
                "amount": str(row["amount"]),
                "percent": percent(row["amount"], total),
                "count": row["count"],
            }
            for (item_id, name), row in sorted(
                grouped_rows.items(), key=lambda pair: (-pair[1]["amount"], pair[0][1])
            )
        ]

    rows = (
        expenses.values(f"{field}_id", f"{field}__name")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("-total", f"{field}__name")
    )
    return [
        {
            "id": row[f"{field}_id"],
            "name": row[f"{field}__name"],
            "amount": str(convert(row["total"])),
            "percent": percent(row["total"], total),
            "count": row["count"],
        }
        for row in rows
    ]


def by_day(expenses, convert, display_amount=None):
    """Solo los días con gastos; el frontend pone los demás en cero."""
    if display_amount:
        grouped_rows = {}
        for movement in expenses.select_related("original_currency"):
            row = grouped_rows.setdefault(
                movement.date, {"amount": Decimal("0"), "count": 0}
            )
            row["amount"] += display_amount(movement)
            row["count"] += 1
        return [
            {"date": day.isoformat(), "amount": str(row["amount"]), "count": row["count"]}
            for day, row in sorted(grouped_rows.items())
        ]

    rows = expenses.values("date").annotate(total=Sum("amount"), count=Count("id")).order_by("date")
    return [
        {"date": row["date"].isoformat(), "amount": str(convert(row["total"])), "count": row["count"]}
        for row in rows
    ]


def top_expenses(expenses, convert, display_amount=None):
    """Los gastos más grandes; a igual monto, el más reciente primero."""
    if display_amount:
        biggest = list(
            expenses.select_related("category", "original_currency").order_by("-date", "-id")
        )
        biggest.sort(
            key=lambda movement: (
                -display_amount(movement),
                -movement.date.toordinal(),
                -movement.id,
            )
        )
        return [
            {
                "id": movement.id,
                "date": movement.date.isoformat(),
                "amount": str(display_amount(movement)),
                "description": movement.description,
                "category": {"id": movement.category_id, "name": movement.category.name},
            }
            for movement in biggest[:TOP_EXPENSES]
        ]

    biggest = expenses.select_related("category").order_by("-amount", "-date", "-id")
    return [
        {
            "id": movement.id,
            "date": movement.date.isoformat(),
            "amount": str(convert(movement.amount)),
            "description": movement.description,
            "category": {"id": movement.category_id, "name": movement.category.name},
        }
        for movement in biggest[:TOP_EXPENSES]
    ]


def expense_summary(movements, convert, display_amount=None):
    """Los gastos del mes por categoría, por día y por método de pago."""
    expenses = movements.filter(category__movement_type__code=MovementType.EXPENSE)
    if display_amount:
        total = sum(
            (
                display_amount(movement)
                for movement in expenses.select_related("original_currency")
            ),
            Decimal("0"),
        )
    else:
        total = expenses.aggregate(total=Sum("amount"))["total"]
    if not total:
        return {"by_category": [], "by_day": [], "by_payment_method": [], "top_expenses": []}
    return {
        "by_category": grouped(expenses, "category", total, convert, display_amount),
        "by_day": by_day(expenses, convert, display_amount),
        "by_payment_method": grouped(
            expenses, "payment_method", total, convert, display_amount
        ),
        "top_expenses": top_expenses(expenses, convert, display_amount),
    }
