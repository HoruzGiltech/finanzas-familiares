from django.db import migrations

from catalogs.defaults import (
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_INCOME_CATEGORIES,
    DEFAULT_PAYMENT_METHODS,
)


def add_missing_defaults(apps, schema_editor):
    """Da los catálogos iniciales a las familias creadas antes de que existieran.

    Solo toca a las familias que no tienen ninguna categoría o ningún método
    de pago: nunca pisa lo que una familia ya haya configurado.
    """
    Family = apps.get_model("accounts", "Family")
    MovementType = apps.get_model("catalogs", "MovementType")
    Category = apps.get_model("catalogs", "Category")
    PaymentMethod = apps.get_model("catalogs", "PaymentMethod")

    expense = MovementType.objects.get(code="expense")
    income = MovementType.objects.get(code="income")

    for family in Family.objects.all():
        if not Category.objects.filter(family=family).exists():
            for name in DEFAULT_EXPENSE_CATEGORIES:
                Category.objects.create(family=family, movement_type=expense, name=name)
            for name in DEFAULT_INCOME_CATEGORIES:
                Category.objects.create(family=family, movement_type=income, name=name)

        if not PaymentMethod.objects.filter(family=family).exists():
            for name in DEFAULT_PAYMENT_METHODS:
                PaymentMethod.objects.create(family=family, name=name)


class Migration(migrations.Migration):
    dependencies = [
        ("catalogs", "0002_seed_system_catalogs"),
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_missing_defaults, migrations.RunPython.noop),
    ]
