"""
Movimientos de ejemplo para la familia de prueba (los crea `seed_demo`).

Los montos son fijos, no aleatorios, para que los datos sean los mismos cada
vez y se puedan comparar un mes con otro.
"""
import datetime
from decimal import Decimal

from django.utils import timezone

from catalogs.models import Category, MovementType, PaymentMethod

from .models import Movement

# (día, tipo, categoría, método de pago, monto, descripción, correo de quien lo anota)
MONTH_TEMPLATE = [
    (1, "income", "Salario", "Transferencia", "950.00", "Quincena", "admin@demo.test"),
    (1, "expense", "Vivienda", "Transferencia", "350.00", "Alquiler", "admin@demo.test"),
    (2, "expense", "Alimentación", "Tarjeta de débito", "86.40", "Mercado de la semana", "editor@demo.test"),
    (3, "expense", "Transporte", "Efectivo", "20.00", "Gasolina", "editor@demo.test"),
    (4, "expense", "Servicios", "Pago móvil", "25.00", "Internet", "admin@demo.test"),
    (5, "expense", "Entretenimiento", "Tarjeta de crédito", "15.99", "Streaming", "admin@demo.test"),
    (6, "expense", "Alimentación", "Pago móvil", "12.50", "Panadería", "editor@demo.test"),
    (7, "income", "Remesas", "Zelle", "150.00", "Envío de la tía", "admin@demo.test"),
    (8, "expense", "Salud", "Pago móvil", "38.75", "Farmacia", "editor@demo.test"),
    (9, "expense", "Alimentación", "Tarjeta de débito", "92.10", "Mercado de la semana", "editor@demo.test"),
    (10, "expense", "Educación", "Transferencia", "120.00", "Mensualidad del colegio", "admin@demo.test"),
    (11, "expense", "Transporte", "Efectivo", "8.00", "Taxi", "editor@demo.test"),
    (12, "expense", "Entretenimiento", "Efectivo", "32.00", "Cine y cena", "admin@demo.test"),
    (13, "expense", "Servicios", "Pago móvil", "14.30", "Electricidad", "admin@demo.test"),
    (15, "income", "Salario", "Transferencia", "950.00", "Quincena", "admin@demo.test"),
    (16, "expense", "Alimentación", "Tarjeta de débito", "78.25", "Mercado de la semana", "editor@demo.test"),
    (18, "expense", "Ropa y calzado", "Tarjeta de crédito", "64.00", "Zapatos", "editor@demo.test"),
    (19, "expense", "Transporte", "Efectivo", "20.00", "Gasolina", "editor@demo.test"),
    (21, "income", "Negocio propio", "Pago móvil", "210.00", "Venta de tortas", "editor@demo.test"),
    (23, "expense", "Alimentación", "Tarjeta de débito", "95.60", "Mercado de la semana", "editor@demo.test"),
    (25, "expense", "Otros gastos", "Efectivo", "18.00", "Regalo de cumpleaños", "admin@demo.test"),
    (27, "expense", "Servicios", "Pago móvil", "9.50", "Agua", "admin@demo.test"),
]

# Cuánto cambia el gasto de cada mes respecto a la plantilla: el mes actual,
# el anterior y el de hace dos meses. Así la comparación entre meses no sale plana.
EXPENSE_FACTORS = [Decimal("1.00"), Decimal("0.88"), Decimal("1.12")]


def first_day_months_ago(today, months):
    """El día 1 del mes de hace `months` meses."""
    total = today.year * 12 + (today.month - 1) - months
    return datetime.date(total // 12, total % 12 + 1, 1)


def find_or_create(model, name, **fields):
    """Busca por nombre sin distinguir mayúsculas; si no existe, lo crea."""
    item = model.objects.filter(name__iexact=name, **fields).first()
    return item or model.objects.create(name=name, **fields)


def create_demo_movements(family):
    """Crea tres meses de movimientos para `family`. Devuelve cuántos creó."""
    today = timezone.localdate()
    types = {movement_type.code: movement_type for movement_type in MovementType.objects.all()}
    users = {user.email: user for user in family.members.all()}
    movements = []

    for months_ago, factor in enumerate(EXPENSE_FACTORS):
        first_day = first_day_months_ago(today, months_ago)
        for day, type_code, category_name, method_name, amount, description, email in MONTH_TEMPLATE:
            date = first_day.replace(day=day)
            if date > today:
                continue  # el mes actual solo llega hasta hoy

            amount = Decimal(amount)
            if type_code == MovementType.EXPENSE:
                amount = (amount * factor).quantize(Decimal("0.01"))

            movements.append(
                Movement(
                    family=family,
                    category=find_or_create(
                        Category, category_name, family=family, movement_type=types[type_code]
                    ),
                    payment_method=find_or_create(PaymentMethod, method_name, family=family),
                    amount=amount,
                    date=date,
                    description=description,
                    created_by=users[email],
                )
            )

    Movement.objects.bulk_create(movements)
    return len(movements)
