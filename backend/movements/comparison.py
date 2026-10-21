"""
Comparación de un mes con los anteriores (spec 007).

Las monedas actuales se agregan en USD y se convierten al final. En CLP se
agregan los importes mostrados por movimiento, incluidos los porcentajes.

El mes en curso se compara "hasta el mismo día": el 15 de octubre, con lo del
1 al 15 de septiembre. Comparar medio mes con un mes entero engañaría.
"""
import calendar
import datetime
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Sum
from django.db.models.functions import TruncMonth

from catalogs.models import MovementType

HISTORY_MONTHS = 6  # meses del gráfico de tendencia
AVERAGE_MONTHS = 3  # meses que se promedian para saber qué es "lo normal"
CENT = Decimal("0.01")
ONE_DECIMAL = Decimal("0.1")
ZERO = Decimal("0.00")


def shift_month(first_day, delta):
    """Primer día del mes que está `delta` meses antes o después."""
    index = first_day.year * 12 + first_day.month - 1 + delta
    return datetime.date(index // 12, index % 12 + 1, 1)


def in_period(movements, first_day, until_day):
    """Los movimientos de ese mes, hasta el día `until_day` (o el mes entero si es None).

    Si el mes es más corto que `until_day` (febrero frente a un 31), entra entero.
    """
    last_day = calendar.monthrange(first_day.year, first_day.month)[1]
    end = first_day.replace(day=min(until_day or last_day, last_day))
    return movements.filter(date__gte=first_day, date__lte=end)


def totals_usd(movements):
    """{"income": Decimal, "expense": Decimal} en USD."""
    rows = movements.values("category__movement_type__code").annotate(total=Sum("amount"))
    by_type = {row["category__movement_type__code"]: row["total"] for row in rows}
    return {
        "income": by_type.get(MovementType.INCOME, ZERO),
        "expense": by_type.get(MovementType.EXPENSE, ZERO),
    }


def percent_change(now, before):
    """Cuánto cambió, en porcentaje con un decimal y como texto. None si la base es cero.

    Se divide entre el valor absoluto para que un balance negativo que mejora
    salga como subida.
    """
    if not before:
        return None
    change = (now - before) * 100 / abs(before)
    return str(change.quantize(ONE_DECIMAL, rounding=ROUND_HALF_UP))


def money(convert, amount, already_displayed=False):
    """Formatea un total ya convertido o lo pasa desde USD a la moneda elegida."""
    if already_displayed:
        return str(amount)
    return str(convert(amount.quantize(CENT, rounding=ROUND_HALF_UP)))


def totals(movements, display_amount=None):
    if not display_amount:
        return totals_usd(movements)
    result = {MovementType.INCOME: ZERO, MovementType.EXPENSE: ZERO}
    for movement in movements.select_related("category__movement_type", "original_currency"):
        code = movement.category.movement_type.code
        result[code] += display_amount(movement)
    return {
        key: value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        for key, value in result.items()
    }


def previous_month(movements, month, until_day, convert, display_amount=None):
    """Totales del mes anterior (en su periodo comparable) y cuánto cambió este mes."""
    before_month = shift_month(month, -1)
    if not in_period(movements, before_month, None).exists():
        return None
    now = totals(in_period(movements, month, until_day), display_amount)
    before = totals(in_period(movements, before_month, until_day), display_amount)
    now["balance"] = now["income"] - now["expense"]
    before["balance"] = before["income"] - before["expense"]
    return {
        "month": before_month.strftime("%Y-%m"),
        "totals": {
            key: money(convert, value, already_displayed=display_amount is not None)
            for key, value in before.items()
        },
        "change": {key: percent_change(now[key], before[key]) for key in now},
    }


def history(movements, month, today, convert, display_amount=None):
    """Los 6 meses que terminan en `month`, con sus totales completos."""
    first = shift_month(month, -(HISTORY_MONTHS - 1))
    end = shift_month(month, 1)
    if display_amount:
        by_month = {}
        rows = movements.filter(date__gte=first, date__lt=end).select_related(
            "category__movement_type", "original_currency"
        )
        for movement in rows:
            current = movement.date.replace(day=1)
            code = movement.category.movement_type.code
            totals = by_month.setdefault(current, {})
            totals[code] = totals.get(code, ZERO) + display_amount(movement)
    else:
        rows = (
            movements.filter(date__gte=first, date__lt=end)
            .annotate(month=TruncMonth("date"))
            .values("month", "category__movement_type__code")
            .annotate(total=Sum("amount"))
        )
        by_month = {}
        for row in rows:
            by_month.setdefault(row["month"], {})[
                row["category__movement_type__code"]
            ] = row["total"]

    result = []
    for delta in range(HISTORY_MONTHS):
        current = shift_month(first, delta)
        income = by_month.get(current, {}).get(MovementType.INCOME, ZERO)
        expense = by_month.get(current, {}).get(MovementType.EXPENSE, ZERO)
        if display_amount:
            income = income.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            expense = expense.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        else:
            income = convert(income)
            expense = convert(expense)
        result.append(
            {
                "month": current.strftime("%Y-%m"),
                "income": str(income),
                "expense": str(expense),
                # Se resta ya convertido para que cuadre al céntimo en pantalla.
                "balance": str(income - expense),
                "in_progress": (current.year, current.month) == (today.year, today.month),
            }
        )
    return result


def expenses_by_category(movements, names, display_amount=None):
    """{id de categoría: total en USD} de los gastos. Apunta cada nombre en `names`."""
    if display_amount:
        totals = {}
        expenses = movements.filter(
            category__movement_type__code=MovementType.EXPENSE
        ).select_related("category", "original_currency")
        for movement in expenses:
            names[movement.category_id] = movement.category.name
            totals[movement.category_id] = (
                totals.get(movement.category_id, ZERO) + display_amount(movement)
            )
        return {
            category_id: total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            for category_id, total in totals.items()
        }

    rows = (
        movements.filter(category__movement_type__code=MovementType.EXPENSE)
        .values("category_id", "category__name")
        .annotate(total=Sum("amount"))
    )
    totals = {}
    for row in rows:
        names[row["category_id"]] = row["category__name"]
        totals[row["category_id"]] = row["total"]
    return totals


def categories(movements, month, until_day, convert, display_amount=None):
    """Cada categoría de gasto frente al promedio de los meses anteriores,
    de la que más subió a la que más bajó.

    Se promedian solo los meses (de los 3 anteriores) que tienen movimientos:
    una familia que empezó hace dos meses no tiene un tercero en cero.
    """
    months = [shift_month(month, -n) for n in range(1, AVERAGE_MONTHS + 1)]
    months = [m for m in months if in_period(movements, m, None).exists()]
    if not months:
        return []

    names = {}
    now = expenses_by_category(
        in_period(movements, month, until_day), names, display_amount
    )
    before = {}  # suma de los meses anteriores, por categoría
    for previous in months:
        previous_totals = expenses_by_category(
            in_period(movements, previous, until_day), names, display_amount
        )
        for category_id, total in previous_totals.items():
            before[category_id] = before.get(category_id, ZERO) + total

    rows = []
    unit = Decimal("1") if display_amount else CENT
    for category_id in names:
        amount = now.get(category_id, ZERO)
        average = (before.get(category_id, ZERO) / len(months)).quantize(
            unit, rounding=ROUND_HALF_UP
        )
        rows.append((amount - average, names[category_id], category_id, amount, average))
    rows.sort(key=lambda row: (-row[0], row[1]))

    return [
        {
            "id": category_id,
            "name": name,
            "amount": money(convert, amount, display_amount is not None),
            "average": money(convert, average, display_amount is not None),
            "change": money(convert, change, display_amount is not None),
            "change_percent": percent_change(amount, average),
        }
        for change, name, category_id, amount, average in rows
    ]


def comparison(movements, month, today, convert, display_amount=None):
    """La respuesta de GET movements/comparison/. `movements`: todos los de la familia."""
    in_progress = (month.year, month.month) == (today.year, today.month)
    until_day = today.day if in_progress else None
    return {
        "partial_until": until_day,
        "previous": previous_month(
            movements, month, until_day, convert, display_amount
        ),
        "history": history(movements, month, today, convert, display_amount),
        "categories": categories(
            movements, month, until_day, convert, display_amount
        ),
    }
