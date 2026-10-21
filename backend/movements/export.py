"""Los movimientos de un rango en CSV, pensado para Excel en español (spec 008)."""

import csv
import io

from catalogs.models import MovementType
from .money import movement_amount

NO_CLP_RATE_MESSAGE = "Todavía no hay tasa del peso chileno para calcular el monto en CLP."

HEADERS = [
    "Fecha",
    "Tipo",
    "Categoría",
    "Descripción",
    "Método de pago",
    "Monto USD",
    "Monto CLP",
    "Monto anotado",
    "Moneda anotada",
    "Tasa usada",
    "Anotado por",
]

# Excel ejecuta como fórmula una celda que empieza por uno de estos signos. El
# tabulador y el retorno de carro, porque Excel los salta y lee lo que sigue.
FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def text(value):
    """Texto escrito por alguien: con un apóstrofo delante si parece una fórmula."""
    return f"'{value}" if value.startswith(FORMULA_STARTS) else value


def number(value):
    """Decimal con coma y sin separador de miles, para que Excel lo sume."""
    return "" if value is None else str(value).replace(".", ",")


def row(movement, rate):
    is_expense = movement.category.movement_type.code == MovementType.EXPENSE
    amount_clp = movement_amount(movement, "CLP", rate)
    return [
        movement.date.strftime("%d/%m/%Y"),
        text(movement.category.movement_type.name),
        text(movement.category.name),
        text(movement.description),
        text(movement.payment_method.name),
        number(-movement.amount if is_expense else movement.amount),
        number(-amount_clp if is_expense else amount_clp),
        number(movement.original_amount),
        text(movement.original_currency.code),
        number(movement.exchange_rate),  # vacía si se anotó en USD
        text(movement.created_by.full_name),
    ]


def movements_csv(movements, rate):
    """El archivo completo como texto, con BOM para que Excel lea bien las tildes."""
    buffer = io.StringIO()
    buffer.write("﻿")
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(HEADERS)
    writer.writerows(row(movement, rate) for movement in movements)
    return buffer.getvalue()
