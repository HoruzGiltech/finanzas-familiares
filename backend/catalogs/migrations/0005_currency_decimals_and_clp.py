from django.db import migrations, models


def add_chilean_peso(apps, schema_editor):
    """El peso chileno (spec 013): sin decimales, y "CLP$" para no confundirlo con el dólar."""
    Currency = apps.get_model("catalogs", "Currency")
    Currency.objects.get_or_create(
        code="CLP", defaults={"name": "Peso chileno", "symbol": "CLP$", "decimals": 0}
    )


class Migration(migrations.Migration):
    dependencies = [
        ("catalogs", "0004_shopping_list_category"),
    ]

    operations = [
        migrations.AddField(
            model_name="currency",
            name="decimals",
            field=models.PositiveSmallIntegerField(default=2),
        ),
        migrations.RunPython(add_chilean_peso, migrations.RunPython.noop),
    ]
