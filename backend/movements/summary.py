"""
Resumen de los gastos de un mes para el dashboard (spec 006).

Todo se suma en USD y cada monto se convierte al final con `convert`, para no
acumular redondeos. Los porcentajes se calculan en USD: no cambian con la moneda.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, Sum

from catalogs.models import MovementType

TOP_EXPENSES = 5  # cuántos gastos grandes se muestran
ONE_DECIMAL = Decimal("0.1")


def percent(part, total):
    """Qué parte de `total` es `part`, con un decimal y como texto: "35.5"."""
    return str((part * 100 / total).quantize(ONE_DECIMAL, rounding=ROUND_HALF_UP))


def grouped(expenses, field, total, convert):
    """Gastos sumados por categoría o por método de pago, de mayor a menor."""
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


def by_day(expenses, convert):
    """Solo los días con gastos; el frontend pone los demás en cero."""
    rows = expenses.values("date").annotate(total=Sum("amount"), count=Count("id")).order_by("date")
    return [
        {"date": row["date"].isoformat(), "amount": str(convert(row["total"])), "count": row["count"]}
        for row in rows
    ]


def top_expenses(expenses, convert):
    """Los gastos más grandes; a igual monto, el más reciente primero."""
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


def expense_summary(movements, convert):
    """Los gastos del mes por categoría, por día y por método de pago."""
    expenses = movements.filter(category__movement_type__code=MovementType.EXPENSE)
    total = expenses.aggregate(total=Sum("amount"))["total"]
    if not total:
        return {"by_category": [], "by_day": [], "by_payment_method": [], "top_expenses": []}
    return {
        "by_category": grouped(expenses, "category", total, convert),
        "by_day": by_day(expenses, convert),
        "by_payment_method": grouped(expenses, "payment_method", total, convert),
        "top_expenses": top_expenses(expenses, convert),
    }
