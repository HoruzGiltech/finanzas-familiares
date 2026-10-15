import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("movements", "0002_original_amount"),
    ]

    operations = [
        migrations.AlterField(
            model_name="movement",
            name="original_amount",
            field=models.DecimalField(decimal_places=2, max_digits=16),
        ),
        migrations.AlterField(
            model_name="movement",
            name="original_currency",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, to="catalogs.currency"
            ),
        ),
    ]
