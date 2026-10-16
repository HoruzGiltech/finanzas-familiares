from django.core.management.base import BaseCommand, CommandError

from rates.services import today_rate, update_quotes, update_rates


class Command(BaseCommand):
    help = "Consulta la tasa del BCV y la del peso chileno aunque ya se hayan consultado hoy."

    def handle(self, *args, **options):
        # El peso primero: si el BCV falla, al menos queda guardado.
        clp_ok = update_quotes(force=True)
        if not update_rates(force=True):
            raise CommandError("No se pudo leer la tasa del BCV. Revisa el registro.")
        if not clp_ok:
            self.stderr.write("No se pudo leer la tasa del peso chileno. Revisa el registro.")
        rate = today_rate()
        values = ", ".join(f"1 {code} = {value} Bs." for code, value in rate.bs_per_unit.items())
        self.stdout.write(self.style.SUCCESS(f"Tasa de hoy ({rate.date}): {values}"))
