"""
Configuración de Django.

Todo lo que cambia entre máquinas o es secreto se lee del archivo backend/.env.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env_list(name):
    """Convierte 'a, b,c' en ['a', 'b', 'c']."""
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


# --- Seguridad básica -------------------------------------------------------

# Sin valor por defecto a propósito: si falta la clave, Django no arranca.
SECRET_KEY = os.environ["SECRET_KEY"]

DEBUG = os.environ.get("DEBUG", "False") == "True"

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")

# Único origen (la aplicación React) que puede llamar a la API desde un navegador.
FRONTEND_ORIGIN = os.environ["FRONTEND_ORIGIN"]

CORS_ALLOWED_ORIGINS = [FRONTEND_ORIGIN]
CORS_ALLOW_CREDENTIALS = True  # permite enviar la cookie de sesión
CSRF_TRUSTED_ORIGINS = [FRONTEND_ORIGIN]

# Las cookies solo viajan por HTTPS cuando no estamos en desarrollo.
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"

# La sesión caduca tras 14 días sin uso (cada petición renueva el plazo).
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14
SESSION_SAVE_EVERY_REQUEST = True

# En producción (Railway) Django recibe por HTTP lo que llegó por HTTPS; el
# proxy lo indica en esta cabecera (spec 012).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Respuesta en JSON cuando falta o no coincide el token CSRF.
CSRF_FAILURE_VIEW = "core.views.csrf_failure"


# --- Aplicaciones -----------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "core",
    "accounts",
    "catalogs",
    "movements",
    "rates",
    "budget",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Sirve los estilos del panel /admin cuando DEBUG=False (spec 012).
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # debe ir antes de CommonMiddleware
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# --- Base de datos ----------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ["POSTGRES_DB"],
        "USER": os.environ["POSTGRES_USER"],
        "PASSWORD": os.environ["POSTGRES_PASSWORD"],
        "HOST": os.environ.get("POSTGRES_HOST", "127.0.0.1"),
        "PORT": os.environ.get("POSTGRES_PORT", "5434"),
        # Si Postgres no responde, fallar rápido en vez de dejar la petición colgada.
        "OPTIONS": {"connect_timeout": 3},
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# --- API (Django REST Framework) -------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "accounts.authentication.SessionAuth",
    ],
    # Cerrado por defecto: hace falta sesión y no estar usando una contraseña
    # temporal. Cada vista pública debe declararlo explícitamente.
    "DEFAULT_PERMISSION_CLASSES": ["accounts.permissions.IsFamilyMember"],
    # Cuántos proxies de confianza hay delante de Django. Con 0, el rate limit
    # identifica al cliente por su IP real e ignora la cabecera X-Forwarded-For,
    # que cualquiera puede falsificar para saltarse el límite. Al desplegar
    # detrás de un proxy (nginx, etc.) se pone 1.
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "0")),
    # Rate limit: se aplica a toda la API.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("THROTTLE_ANON", "60/min"),
        "user": os.environ.get("THROTTLE_USER", "300/min"),
        # Ámbito más estricto, reservado para el login (spec 002).
        "login": os.environ.get("THROTTLE_LOGIN", "5/min"),
    },
}


# --- Usuarios y contraseñas -------------------------------------------------

# Modelo de usuario propio: entra con correo y pertenece a una familia.
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ["email", "full_name"]},
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# --- Idioma y zona horaria --------------------------------------------------

LANGUAGE_CODE = "es"
TIME_ZONE = "America/Caracas"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# Donde `collectstatic` reúne los archivos que sirve whitenoise.
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}


# --- Solo durante las pruebas ----------------------------------------------

# El cifrado real de contraseñas es lento a propósito. En las pruebas usamos
# uno rápido para que no tarden minutos. Nunca se usa fuera de `manage.py test`.
if "test" in sys.argv:
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
