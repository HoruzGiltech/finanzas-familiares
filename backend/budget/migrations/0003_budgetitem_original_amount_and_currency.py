import django.db.models.deletion
from django.db import migrations, models


def preserve_existing_amounts(apps, schema_editor):
    BudgetItem = apps.get_model("budget", "BudgetItem")
    Currency = apps.get_model("catalogs", "Currency")
    usd = Currency.objects.get(code="USD")
    BudgetItem.objects.update(
        original_amount=models.F("amount"),
        original_currency_id=usd.pk,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("budget", "0002_shopping_list"),
        ("catalogs", "0005_currency_decimals_and_clp"),
    ]

    operations = [
        migrations.AddField(
            model_name="budgetitem",
            name="original_amount",
            field=models.DecimalField(decimal_places=2, max_digits=16, null=True),
        ),
        migrations.AddField(
            model_name="budgetitem",
            name="original_currency",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                to="catalogs.currency",
            ),
        ),
        migrations.RunPython(preserve_existing_amounts, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="budgetitem",
            name="original_amount",
            field=models.DecimalField(decimal_places=2, max_digits=16),
        ),
        migrations.AlterField(
            model_name="budgetitem",
            name="original_currency",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                to="catalogs.currency",
            ),
        ),
    ]
