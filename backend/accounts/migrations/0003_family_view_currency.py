import django.db.models.deletion
from django.db import migrations, models

import accounts.models


def use_dollars(apps, schema_editor):
    """Las familias que ya existen ven en USD, como hasta ahora."""
    Currency = apps.get_model("catalogs", "Currency")
    Family = apps.get_model("accounts", "Family")
    Family.objects.update(view_currency=Currency.objects.get(is_base=True))


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_family_entry_currency"),
    ]

    operations = [
        # Primero vacío, se rellena y después pasa a obligatorio.
        migrations.AddField(
            model_name="family",
            name="view_currency",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="catalogs.currency",
            ),
        ),
        migrations.RunPython(use_dollars, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="family",
            name="view_currency",
            field=models.ForeignKey(
                default=accounts.models.base_currency_id,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="catalogs.currency",
            ),
        ),
    ]
