from django.db import migrations

MOVEMENT_TYPES = [
    # code, name, sign
    ("income", "Ingreso", 1),
    ("expense", "Gasto", -1),
]

CURRENCIES = [
    # code, name, symbol, is_base
    ("USD", "Dólar estadounidense", "$", True),
    ("VES", "Bolívar", "Bs.", False),
    ("EUR", "Euro", "€", False),
]


def load_system_catalogs(apps, schema_editor):
    """Carga los catálogos del sistema: tipos de movimiento y monedas."""
    MovementType = apps.get_model("catalogs", "MovementType")
    Currency = apps.get_model("catalogs", "Currency")

    for code, name, sign in MOVEMENT_TYPES:
        MovementType.objects.get_or_create(code=code, defaults={"name": name, "sign": sign})

    for code, name, symbol, is_base in CURRENCIES:
        Currency.objects.get_or_create(
            code=code, defaults={"name": name, "symbol": symbol, "is_base": is_base}
        )


class Migration(migrations.Migration):
    dependencies = [
        ("catalogs", "0001_initial"),
    ]

    operations = [
        # Al deshacer la migración no se borra nada: las tablas se eliminan solas.
        migrations.RunPython(load_system_catalogs, migrations.RunPython.noop),
    ]
