from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Family(models.Model):
    """El grupo que comparte las finanzas. Todos los datos pertenecen a una familia."""

    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class UserManager(BaseUserManager):
    def create_user(self, email, password, **fields):
        # El correo se guarda siempre en minúsculas para que no haya duplicados
        # del tipo "Ana@correo.com" y "ana@correo.com".
        user = self.model(email=email.strip().lower(), **fields)
        user.set_password(password)
        user.save()
        return user

    def create_superuser(self, email, password, **fields):
        """Lo usa `python manage.py createsuperuser` (acceso al panel /admin/)."""
        family = Family.objects.create(name="Administración del sistema")
        return self.create_user(
            email,
            password,
            family=family,
            role=User.Role.ADMIN,
            is_staff=True,
            is_superuser=True,
            **fields,
        )


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = "admin", "Administrador"
        EDITOR = "editor", "Editor"
        VIEWER = "viewer", "Lector"

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150)
    # PROTECT: no se puede borrar una familia que todavía tiene miembros.
    family = models.ForeignKey(Family, on_delete=models.PROTECT, related_name="members")
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.VIEWER)
    is_active = models.BooleanField(default=True)
    # Verdadero mientras el usuario use una contraseña temporal.
    must_change_password = models.BooleanField(default=False)
    # Solo para entrar al panel /admin/ de Django. No tiene que ver con el rol.
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return self.email

    @property
    def is_family_admin(self):
        return self.role == self.Role.ADMIN

    @property
    def can_edit_movements(self):
        return self.role in (self.Role.ADMIN, self.Role.EDITOR)
