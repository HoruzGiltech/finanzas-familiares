import secrets

from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.db import transaction
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from catalogs.defaults import create_default_catalogs

from .models import Family, User
from .permissions import IsFamilyAdmin
from .serializers import (
    ChangePasswordSerializer,
    FamilySerializer,
    FamilyUpdateSerializer,
    LoginSerializer,
    MemberCreateSerializer,
    MemberUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)

LOGIN_ERROR = "Correo o contraseña incorrectos."


def make_temporary_password():
    """12 caracteres aleatorios. Se muestra una sola vez y no se guarda en claro."""
    return secrets.token_urlsafe(9)


class CsrfView(APIView):
    """Entrega al frontend el token CSRF que debe enviar en cada POST o PATCH."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


# Las vistas públicas que modifican datos piden el token CSRF explícitamente,
# porque Django REST Framework solo lo exige cuando ya hay sesión.
@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    """Crea una familia y a su administrador, y deja la sesión iniciada."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # atomic: o se crean la familia, sus catálogos y el usuario, o no se crea nada.
        with transaction.atomic():
            family = Family.objects.create(name=data["family_name"])
            create_default_catalogs(family)
            user = User.objects.create_user(
                email=data["email"],
                password=data["password"],
                full_name=data["full_name"],
                family=family,
                role=User.Role.ADMIN,
            )

        login(request, user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        # Mismo mensaje para cualquier fallo: no revelamos si el correo existe
        # ni si el usuario está desactivado.
        if not serializer.is_valid():
            return Response({"detail": LOGIN_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(
            request,
            email=serializer.validated_data["email"].strip().lower(),
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response({"detail": LOGIN_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """El usuario que tiene la sesión iniciada."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        serializer = ChangePasswordSerializer(data=request.data, context={"user": user})
        serializer.is_valid(raise_exception=True)

        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.save()
        # Mantiene abierta esta sesión; las demás sesiones del usuario dejan de valer.
        update_session_auth_hash(request, user)
        return Response(UserSerializer(user).data)


class FamilyView(APIView):
    """El administrador cambia las monedas para anotar y para ver (specs 013 y 015).

    Para leerla no hace falta esta vista: viene con el usuario en auth/me/.
    """

    permission_classes = [IsFamilyAdmin]

    def patch(self, request):
        serializer = FamilyUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        family = request.user.family
        for field, currency in serializer.validated_data.items():
            setattr(family, field, currency)
        family.save(update_fields=list(serializer.validated_data))
        return Response(FamilySerializer(family).data)


class MemberListView(APIView):
    permission_classes = [IsFamilyAdmin]

    def get(self, request):
        members = User.objects.filter(family=request.user.family)
        return Response(UserSerializer(members, many=True).data)

    def post(self, request):
        serializer = MemberCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        temporary_password = make_temporary_password()
        member = User.objects.create_user(
            password=temporary_password,
            family=request.user.family,
            must_change_password=True,
            **serializer.validated_data,
        )
        data = UserSerializer(member).data
        data["temporary_password"] = temporary_password
        return Response(data, status=status.HTTP_201_CREATED)


def get_family_member(request, member_id):
    """Busca al miembro solo dentro de la familia de quien pregunta.

    Si es de otra familia responde 404, igual que si no existiera.
    """
    return get_object_or_404(User, pk=member_id, family=request.user.family)


class MemberDetailView(APIView):
    permission_classes = [IsFamilyAdmin]

    def patch(self, request, member_id):
        member = get_family_member(request, member_id)
        serializer = MemberUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_role = serializer.validated_data.get("role", member.role)
        new_is_active = serializer.validated_data.get("is_active", member.is_active)

        # Regla: la familia nunca se queda sin un administrador activo.
        is_active_admin = member.is_family_admin and member.is_active
        stops_being_admin = new_role != User.Role.ADMIN or not new_is_active
        if is_active_admin and stops_being_admin:
            other_admins = User.objects.filter(
                family=member.family, role=User.Role.ADMIN, is_active=True
            ).exclude(pk=member.pk)
            if not other_admins.exists():
                return Response(
                    {"detail": "La familia debe tener al menos un administrador activo."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        member.role = new_role
        member.is_active = new_is_active
        member.save()
        return Response(UserSerializer(member).data)


class MemberResetPasswordView(APIView):
    permission_classes = [IsFamilyAdmin]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, member_id):
        member = get_family_member(request, member_id)
        if member == request.user:
            return Response(
                {"detail": 'Para tu propia contraseña usa "Cambiar contraseña".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        temporary_password = make_temporary_password()
        member.set_password(temporary_password)
        member.must_change_password = True
        member.save()

        data = UserSerializer(member).data
        data["temporary_password"] = temporary_password
        return Response(data)
