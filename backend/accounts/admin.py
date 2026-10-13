from django.contrib import admin

from .models import Family, User


@admin.register(Family)
class FamilyAdmin(admin.ModelAdmin):
    list_display = ["name", "created_at"]


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ["email", "full_name", "family", "role", "is_active"]
    list_filter = ["role", "is_active"]
    search_fields = ["email", "full_name"]
    # La contraseña no se edita desde aquí: se guardaría sin cifrar.
    # Usa `python manage.py changepassword <correo>`.
    exclude = ["password"]
