from django.db import models

from catalogs.models import Currency


class ExchangeRate(models.Model):
    """Tasa oficial del BCV de una moneda en un día: cuántos bolívares vale 1 unidad."""

    BCV = "bcv"
    DOLARAPI = "dolarapi"  # solo rellena días que faltan (spec 005, sección 2.2)

    currency = models.ForeignKey(Currency, on_delete=models.PROTECT)
    date = models.DateField()  # la "Fecha Valor" del BCV: el día en que rige
    bs_per_unit = models.DecimalField(max_digits=20, decimal_places=8)
    source = models.CharField(max_length=10)
    fetched_at = models.DateTimeField()  # la última vez que se guardó o se confirmó

    class Meta:
        ordering = ["-date", "currency"]
        constraints = [
            models.UniqueConstraint("currency", "date", name="unique_rate_per_day"),
        ]

    def __str__(self):
        return f"{self.date} {self.currency}: {self.bs_per_unit} Bs."


class UsdQuote(models.Model):
    """Cuántas unidades de una moneda vale 1 USD un día (spec 013).

    Para monedas que el BCV no publica, como el peso chileno. Se pasan a
    bolívares con el dólar del BCV al calcular la tasa de hoy.
    """

    MINDICADOR = "mindicador"  # dólar observado del Banco Central de Chile
    ER_API = "er-api"  # respaldo: solo si mindicador falla

    currency = models.ForeignKey(Currency, on_delete=models.PROTECT)
    date = models.DateField()
    units_per_usd = models.DecimalField(max_digits=20, decimal_places=8)
    source = models.CharField(max_length=12)
    fetched_at = models.DateTimeField()

    class Meta:
        ordering = ["-date", "currency"]
        constraints = [
            models.UniqueConstraint("currency", "date", name="unique_usd_quote_per_day"),
        ]

    def __str__(self):
        return f"{self.date} 1 USD = {self.units_per_usd} {self.currency}"
