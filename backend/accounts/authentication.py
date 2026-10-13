from rest_framework.authentication import SessionAuthentication


class SessionAuth(SessionAuthentication):
    """Sesión de Django. Solo añade que 'sin sesión' responda 401 en vez de 403.

    Así el frontend distingue "no has entrado" (401) de "no tienes permiso" (403).
    """

    def authenticate_header(self, request):
        return "Session"
