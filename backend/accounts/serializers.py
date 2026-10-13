from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Family, User


def check_password_strength(password, user):
    """Pasa la contraseña por los validadores de Django y traduce el error para la API."""
    try:
        validate_password(password, user)
    except DjangoValidationError as error:
        raise serializers.ValidationError(list(error.messages))


def clean_new_email(value):
    email = value.strip().lower()
    if User.objects.filter(email=email).exists():
        raise serializers.ValidationError("Ya existe un usuario con este correo.")
    return email


class FamilySerializer(serializers.ModelSerializer):
    class Meta:
        model = Family
        fields = ["id", "name"]


class UserSerializer(serializers.ModelSerializer):
    """Lo que la API devuelve de un usuario. Nunca incluye la contraseña."""

    family = FamilySerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "role",
            "is_active",
            "must_change_password",
            "family",
        ]


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    family_name = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        return clean_new_email(value)

    def validate(self, data):
        # Usuario sin guardar: sirve para comprobar que la contraseña no se
        # parezca al correo o al nombre.
        draft = User(email=data["email"], full_name=data["full_name"])
        try:
            check_password_strength(data["password"], draft)
        except serializers.ValidationError as error:
            raise serializers.ValidationError({"password": error.detail})
        return data


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["user"].check_password(value):
            raise serializers.ValidationError("La contraseña actual no es correcta.")
        return value

    def validate_new_password(self, value):
        check_password_strength(value, self.context["user"])
        return value


class MemberCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=User.Role.choices)

    def validate_email(self, value):
        return clean_new_email(value)


class MemberUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=User.Role.choices, required=False)
    is_active = serializers.BooleanField(required=False)
