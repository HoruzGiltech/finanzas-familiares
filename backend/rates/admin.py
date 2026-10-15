from django.contrib import admin

from .models import ExchangeRate


@admin.register(ExchangeRate)
class ExchangeRateAdmin(admin.ModelAdmin):
    list_display = ["date", "currency", "bs_per_unit", "source", "fetched_at"]
    list_filter = ["currency", "source"]
