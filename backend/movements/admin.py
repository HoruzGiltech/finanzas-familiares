from django.contrib import admin

from .models import Movement


@admin.register(Movement)
class MovementAdmin(admin.ModelAdmin):
    list_display = ["date", "category", "amount", "payment_method", "family", "created_by"]
    list_filter = ["category__movement_type"]
    date_hierarchy = "date"
