from decimal import ROUND_HALF_UP, Decimal

CLP_CODE = "CLP"
CLP_UNIT = Decimal("1")


def movement_amount(movement, currency_code, rate):
    """El importe que se muestra para un movimiento en la moneda elegida."""
    if currency_code == "USD":
        return movement.amount
    if currency_code == CLP_CODE and movement.original_currency.code == CLP_CODE:
        return movement.original_amount.quantize(CLP_UNIT)

    amount = rate.from_usd(movement.amount, currency_code)
    if currency_code == CLP_CODE:
        return amount.quantize(CLP_UNIT, rounding=ROUND_HALF_UP)
    return amount
