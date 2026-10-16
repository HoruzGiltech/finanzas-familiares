from django.contrib import admin

from .models import BudgetItem


@admin.register(BudgetItem)
class BudgetItemAdmin(admin.ModelAdmin):
    list_display = ["month", "description", "category", "amount", "movement", "family"]
    date_hierarchy = "month"
