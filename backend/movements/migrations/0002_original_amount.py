import django.db.models.deletion
from django.db import migrations, models
from django.db.models import F


def mark_existing_as_usd(apps, schema_editor):
    """Los movimientos de antes de la spec 005 se anotaron todos en USD."""
    Movement = apps.get_model("movements", "Movement")
    Currency = apps.get_model("catalogs", "Currency")
    usd = Currency.objects.get(code="USD")
    Movement.objects.update(original_amount=F("amount"), original_currency=usd)


class Migration(migrations.Migration):
    dependencies = [
        ("catalogs", "0003_default_catalogs_for_existing_families"),
        ("movements", "0001_initial"),
    ]

    operations = [
        # Primero se añaden vacíos, se rellenan, y en la migración 0003 pasan a
        # ser obligatorios.
        migrations.AddField(
            model_name="movement",
            name="original_amount",
            field=models.DecimalField(decimal_places=2, max_digits=16, null=True),
        ),
        migrations.AddField(
            model_name="movement",
            name="original_currency",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                to="catalogs.currency",
            ),
        ),
        migrations.AddField(
            model_name="movement",
            name="exchange_rate",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=20, null=True),
        ),
        migrations.RunPython(mark_existing_as_usd, migrations.RunPython.noop),
    ]
