from rest_framework.response import Response
from rest_framework.views import APIView

from .services import rate_data, today_rate


class CurrentRateView(APIView):
    """La tasa de hoy y su estado. Cualquier miembro (permiso por defecto)."""

    def get(self, request):
        return Response(rate_data(today_rate()))
