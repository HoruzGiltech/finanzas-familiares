from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from rest_framework.throttling import AnonRateThrottle


class HealthTests(TestCase):
    def setUp(self):
        # El rate limit guarda sus contadores en la caché: empezamos de cero.
        cache.clear()

    def test_health_ok(self):
        response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "database": "ok"})

    def test_health_database_down(self):
        with patch("core.views.database_is_up", return_value=False):
            response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "error", "database": "error"})


class RateLimitTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_too_many_requests_returns_429(self):
        # Bajamos el límite a 3 por minuto para no hacer 60 peticiones en la prueba.
        rates = {"anon": "3/min", "user": "300/min"}
        with patch.object(AnonRateThrottle, "THROTTLE_RATES", rates):
            for _ in range(3):
                self.assertEqual(self.client.get("/api/health/").status_code, 200)

            response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, 429)
