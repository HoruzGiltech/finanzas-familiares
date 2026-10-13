"""
Valores con los que arranca cada familia nueva, para no empezar en blanco.

Es el único lugar del código con nombres de categorías y métodos de pago.
Solo son un punto de partida: después cada familia los cambia desde
"Configuración" y lo que manda es la base de datos.
"""
from .models import Category, MovementType, PaymentMethod

DEFAULT_EXPENSE_CATEGORIES = [
    "Alimentación",
    "Vivienda",
    "Servicios",
    "Transporte",
    "Salud",
    "Educación",
    "Entretenimiento",
    "Ropa y calzado",
    "Otros gastos",
]

DEFAULT_INCOME_CATEGORIES = [
    "Salario",
    "Negocio propio",
    "Remesas",
    "Otros ingresos",
]

DEFAULT_PAYMENT_METHODS = [
    "Efectivo",
    "Pago móvil",
    "Transferencia",
    "Tarjeta de débito",
    "Tarjeta de crédito",
    "Zelle",
]


def create_default_catalogs(family):
    """Crea las categorías y los métodos de pago iniciales de una familia."""
    expense = MovementType.objects.get(code=MovementType.EXPENSE)
    income = MovementType.objects.get(code=MovementType.INCOME)

    categories = [
        Category(family=family, movement_type=expense, name=name)
        for name in DEFAULT_EXPENSE_CATEGORIES
    ] + [
        Category(family=family, movement_type=income, name=name)
        for name in DEFAULT_INCOME_CATEGORIES
    ]
    Category.objects.bulk_create(categories)

    PaymentMethod.objects.bulk_create(
        PaymentMethod(family=family, name=name) for name in DEFAULT_PAYMENT_METHODS
    )
