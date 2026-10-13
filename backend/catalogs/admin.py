from django.contrib import admin

from .models import Category, Currency, MovementType, PaymentMethod


@admin.register(MovementType)
class MovementTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "sign"]


@admin.register(Currency)
class CurrencyAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "symbol", "is_base", "is_active"]


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "movement_type", "family", "is_active"]
    list_filter = ["movement_type", "is_active"]


@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ["name", "family", "is_active"]
    list_filter = ["is_active"]
