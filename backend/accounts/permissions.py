"""
Permisos reutilizables por toda la API.

Quien use una contraseña temporal no pasa ninguno de estos tres permisos:
primero debe cambiarla.
"""
from rest_framework.permissions import BasePermission


def is_ready(user):
    """Tiene sesión y ya no usa una contraseña temporal."""
    return user.is_authenticated and not user.must_change_password


class IsFamilyMember(BasePermission):
    """Cualquier miembro con sesión. Es el permiso por defecto de la API."""

    message = "Debes cambiar tu contraseña temporal antes de continuar."

    def has_permission(self, request, view):
        return is_ready(request.user)


class CanEditMovements(BasePermission):
    """Administradores y editores."""

    message = "Tu rol no permite registrar ni modificar movimientos."

    def has_permission(self, request, view):
        return is_ready(request.user) and request.user.can_edit_movements


class IsFamilyAdmin(BasePermission):
    """Solo administradores de la familia."""

    message = "Solo un administrador puede hacer esto."

    def has_permission(self, request, view):
        return is_ready(request.user) and request.user.is_family_admin
