import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import Family, User
from catalogs.defaults import create_default_catalogs
from movements.demo import create_demo_movements

DEMO_FAMILY = "Familia Demo"
DEMO_USERS = [
    ("admin@demo.test", "Ana Demo", User.Role.ADMIN),
    ("editor@demo.test", "Luis Demo", User.Role.EDITOR),
    ("lector@demo.test", "Sofía Demo", User.Role.VIEWER),
]


class Command(BaseCommand):
    help = "Crea una familia de ejemplo con usuarios y movimientos (solo en desarrollo)."

    def handle(self, *args, **options):
        # Usuarios con contraseña conocida: jamás en un servidor real.
        if not settings.DEBUG:
            raise CommandError("seed_demo solo se puede usar con DEBUG=True.")

        password = os.environ.get("DEMO_PASSWORD")
        if not password:
            raise CommandError("Define DEMO_PASSWORD en backend/.env antes de usar seed_demo.")

        with transaction.atomic():
            family = Family.objects.filter(name=DEMO_FAMILY).first()
            if family:
                self.stdout.write("La familia de ejemplo ya existe.")
            else:
                family = self.create_family(password)

            # Solo se cargan movimientos si no tiene ninguno, para no duplicarlos.
            if family.movements.exists():
                self.stdout.write("Ya tiene movimientos. No se añadió ninguno.")
            else:
                count = create_demo_movements(family)
                self.stdout.write(self.style.SUCCESS(f"Movimientos de ejemplo creados: {count}."))

    def create_family(self, password):
        family = Family.objects.create(name=DEMO_FAMILY)
        create_default_catalogs(family)
        for email, full_name, role in DEMO_USERS:
            User.objects.create_user(
                email=email, password=password, full_name=full_name, family=family, role=role
            )

        self.stdout.write(self.style.SUCCESS("Familia de ejemplo creada. Usuarios:"))
        for email, _, role in DEMO_USERS:
            self.stdout.write(f"  {email}  ({role})")
        self.stdout.write("La contraseña de los tres es el valor de DEMO_PASSWORD en backend/.env.")
        return family
