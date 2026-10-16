from django.contrib import admin

from .models import BudgetItem, ShoppingListItem


class ShoppingListInline(admin.TabularInline):
    model = ShoppingListItem
    extra = 0


@admin.register(BudgetItem)
class BudgetItemAdmin(admin.ModelAdmin):
    inlines = [ShoppingListInline]
    list_display = ["month", "description", "category", "amount", "movement", "family"]
    date_hierarchy = "month"
