from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def database_is_up():
    """Hace la consulta más barata posible para saber si Postgres responde."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return True
    except Exception:
        return False


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Indica si la API y la base de datos están funcionando."""
    if database_is_up():
        return Response({"status": "ok", "database": "ok"})
    return Response({"status": "error", "database": "error"}, status=503)
