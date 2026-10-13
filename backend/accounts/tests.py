from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Family, User

PASSWORD = "clave-Segura-2026"
LOGIN_ERROR = "Correo o contraseña incorrectos."


class BaseTestCase(TestCase):
    """Prepara una familia con un administrador, un editor y un lector."""

    def setUp(self):
        cache.clear()  # el rate limit guarda sus contadores en la caché
        self.client = APIClient()
        self.family = Family.objects.create(name="Familia Pérez")
        self.admin = self.make_user("admin@perez.com", User.Role.ADMIN)
        self.editor = self.make_user("editor@perez.com", User.Role.EDITOR)
        self.viewer = self.make_user("lector@perez.com", User.Role.VIEWER)

    def make_user(self, email, role, family=None, **fields):
        return User.objects.create_user(
            email=email,
            password=PASSWORD,
            full_name=email.split("@")[0],
            family=family or self.family,
            role=role,
            **fields,
        )

    def login(self, email, password=PASSWORD, client=None):
        client = client or self.client
        return client.post("/api/auth/login/", {"email": email, "password": password})


class RegisterTests(BaseTestCase):
    def register(self, **changes):
        data = {
            "full_name": "Ana Gómez",
            "family_name": "Familia Gómez",
            "email": "ana@gomez.com",
            "password": PASSWORD,
        }
        data.update(changes)
        return self.client.post("/api/auth/register/", data)

    def test_register_creates_family_and_admin_and_logs_in(self):
        response = self.register()

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="ana@gomez.com")
        self.assertEqual(user.role, User.Role.ADMIN)
        self.assertEqual(user.family.name, "Familia Gómez")
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)

    def test_email_is_saved_in_lowercase(self):
        self.register(email="ANA@Gomez.com")

        self.assertTrue(User.objects.filter(email="ana@gomez.com").exists())

    def test_register_with_used_email_creates_nothing(self):
        response = self.register(email="admin@perez.com")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())
        self.assertEqual(Family.objects.count(), 1)

    def test_register_with_weak_password_creates_nothing(self):
        response = self.register(password="12345678")

        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())
        self.assertEqual(Family.objects.count(), 1)
        self.assertFalse(User.objects.filter(email="ana@gomez.com").exists())


class LoginTests(BaseTestCase):
    def test_login_ok(self):
        response = self.login("admin@perez.com")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], "admin@perez.com")

    def test_wrong_password_unknown_email_and_inactive_user_get_same_message(self):
        self.viewer.is_active = False
        self.viewer.save()

        responses = [
            self.login("admin@perez.com", "otra-clave"),
            self.login("nadie@perez.com"),
            self.login("lector@perez.com"),
        ]

        for response in responses:
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json(), {"detail": LOGIN_ERROR})

    def test_sixth_login_attempt_in_a_minute_returns_429(self):
        for _ in range(5):
            self.assertEqual(self.login("admin@perez.com", "mala").status_code, 400)

        self.assertEqual(self.login("admin@perez.com", "mala").status_code, 429)

    def test_fake_forwarded_header_does_not_reset_the_limit(self):
        # Cambiar X-Forwarded-For en cada intento no debe dar intentos nuevos.
        data = {"email": "admin@perez.com", "password": "mala"}
        for attempt in range(5):
            self.client.post("/api/auth/login/", data, HTTP_X_FORWARDED_FOR=f"10.0.0.{attempt}")

        response = self.client.post("/api/auth/login/", data, HTTP_X_FORWARDED_FOR="10.0.0.99")

        self.assertEqual(response.status_code, 429)

    def test_logout_ends_the_session(self):
        self.login("admin@perez.com")

        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)


class MemberTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_login(self.admin)

    def create_member(self):
        return self.client.post(
            "/api/members/",
            {"full_name": "Luis Pérez", "email": "luis@perez.com", "role": "editor"},
        )

    def test_admin_lists_only_members_of_own_family(self):
        other_family = Family.objects.create(name="Familia Rojas")
        self.make_user("admin@rojas.com", User.Role.ADMIN, family=other_family)

        response = self.client.get("/api/members/")

        self.assertEqual(response.status_code, 200)
        emails = [member["email"] for member in response.json()]
        self.assertEqual(len(emails), 3)
        self.assertNotIn("admin@rojas.com", emails)

    def test_admin_creates_member_with_temporary_password(self):
        response = self.create_member()

        self.assertEqual(response.status_code, 201)
        temporary_password = response.json()["temporary_password"]
        self.assertEqual(len(temporary_password), 12)
        member = User.objects.get(email="luis@perez.com")
        self.assertEqual(member.family, self.family)
        self.assertTrue(member.must_change_password)
        self.assertTrue(member.check_password(temporary_password))
        # La temporal solo viaja en la respuesta que la crea.
        self.assertNotIn("temporary_password", self.client.get("/api/members/").json()[0])

    def test_new_member_must_change_password_before_anything_else(self):
        temporary_password = self.create_member().json()["temporary_password"]
        member_client = APIClient()
        self.login("luis@perez.com", temporary_password, client=member_client)
        User.objects.filter(email="luis@perez.com").update(role=User.Role.ADMIN)

        # Con la temporal: puede verse a sí mismo, pero nada más.
        self.assertEqual(member_client.get("/api/auth/me/").status_code, 200)
        self.assertEqual(member_client.get("/api/members/").status_code, 403)

        response = member_client.post(
            "/api/auth/password/",
            {"current_password": temporary_password, "new_password": PASSWORD},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["must_change_password"])
        self.assertEqual(member_client.get("/api/members/").status_code, 200)

    def test_editor_and_viewer_cannot_use_member_routes(self):
        for user in (self.editor, self.viewer):
            client = APIClient()
            client.force_login(user)

            self.assertEqual(client.get("/api/members/").status_code, 403)
            self.assertEqual(client.post("/api/members/", {}).status_code, 403)
            self.assertEqual(
                client.patch(f"/api/members/{self.viewer.id}/", {"role": "admin"}).status_code,
                403,
            )
            self.assertEqual(
                client.post(f"/api/members/{self.viewer.id}/reset-password/").status_code,
                403,
            )

    def test_member_of_another_family_is_not_found(self):
        other_family = Family.objects.create(name="Familia Rojas")
        stranger = self.make_user("ana@rojas.com", User.Role.VIEWER, family=other_family)

        patch = self.client.patch(f"/api/members/{stranger.id}/", {"role": "admin"})
        reset = self.client.post(f"/api/members/{stranger.id}/reset-password/")

        self.assertEqual(patch.status_code, 404)
        self.assertEqual(reset.status_code, 404)
        stranger.refresh_from_db()
        self.assertEqual(stranger.role, User.Role.VIEWER)

    def test_admin_changes_role(self):
        response = self.client.patch(f"/api/members/{self.viewer.id}/", {"role": "editor"})

        self.assertEqual(response.status_code, 200)
        self.viewer.refresh_from_db()
        self.assertEqual(self.viewer.role, User.Role.EDITOR)

    def test_last_admin_cannot_lose_role_or_be_deactivated(self):
        url = f"/api/members/{self.admin.id}/"

        self.assertEqual(self.client.patch(url, {"role": "viewer"}).status_code, 400)
        self.assertEqual(self.client.patch(url, {"is_active": False}).status_code, 400)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Role.ADMIN)
        self.assertTrue(self.admin.is_active)

    def test_admin_can_step_down_when_there_is_another_admin(self):
        self.editor.role = User.Role.ADMIN
        self.editor.save()

        response = self.client.patch(f"/api/members/{self.admin.id}/", {"role": "viewer"})

        self.assertEqual(response.status_code, 200)

    def test_deactivated_member_loses_session_and_cannot_login(self):
        member_client = APIClient()
        self.login("lector@perez.com", client=member_client)
        self.assertEqual(member_client.get("/api/auth/me/").status_code, 200)

        self.client.patch(f"/api/members/{self.viewer.id}/", {"is_active": False})

        self.assertEqual(member_client.get("/api/auth/me/").status_code, 401)
        self.assertEqual(self.login("lector@perez.com").status_code, 400)

    def test_admin_resets_member_password(self):
        response = self.client.post(f"/api/members/{self.viewer.id}/reset-password/")

        self.assertEqual(response.status_code, 200)
        self.viewer.refresh_from_db()
        self.assertTrue(self.viewer.must_change_password)
        self.assertTrue(self.viewer.check_password(response.json()["temporary_password"]))


class ChangePasswordTests(BaseTestCase):
    def test_requires_current_password(self):
        self.client.force_login(self.editor)

        response = self.client.post(
            "/api/auth/password/",
            {"current_password": "no-es-esta", "new_password": "otra-Clave-2027"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.json())

    def test_rejects_weak_new_password(self):
        self.client.force_login(self.editor)

        response = self.client.post(
            "/api/auth/password/",
            {"current_password": PASSWORD, "new_password": "123"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.json())

    def test_change_closes_other_sessions(self):
        other_device = APIClient()
        self.login("editor@perez.com")
        self.login("editor@perez.com", client=other_device)

        response = self.client.post(
            "/api/auth/password/",
            {"current_password": PASSWORD, "new_password": "otra-Clave-2027"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)
        self.assertEqual(other_device.get("/api/auth/me/").status_code, 401)


class SecurityTests(BaseTestCase):
    def test_post_without_csrf_token_is_rejected(self):
        strict_client = APIClient(enforce_csrf_checks=True)

        login = strict_client.post(
            "/api/auth/login/", {"email": "admin@perez.com", "password": PASSWORD}
        )
        register = strict_client.post("/api/auth/register/", {})

        self.assertEqual(login.status_code, 403)
        self.assertEqual(register.status_code, 403)

    def test_post_with_session_but_without_csrf_token_is_rejected(self):
        strict_client = APIClient(enforce_csrf_checks=True)
        strict_client.force_login(self.admin)

        response = strict_client.post("/api/auth/logout/")

        self.assertEqual(response.status_code, 403)

    def test_post_with_csrf_token_is_accepted(self):
        strict_client = APIClient(enforce_csrf_checks=True)
        token = strict_client.get("/api/auth/csrf/").json()["csrfToken"]

        response = strict_client.post(
            "/api/auth/login/",
            {"email": "admin@perez.com", "password": PASSWORD},
            HTTP_X_CSRFTOKEN=token,
        )

        self.assertEqual(response.status_code, 200)

    def test_responses_never_include_the_password_hash(self):
        self.client.force_login(self.admin)

        bodies = [
            self.client.get("/api/auth/me/").content.decode(),
            self.client.get("/api/members/").content.decode(),
        ]

        for body in bodies:
            self.assertNotIn("password", body.replace("must_change_password", ""))
            self.assertNotIn(self.admin.password, body)

    def test_private_routes_need_a_session(self):
        member_url = f"/api/members/{self.viewer.id}/"

        responses = [
            self.client.get("/api/auth/me/"),
            self.client.post("/api/auth/logout/"),
            self.client.post("/api/auth/password/", {}),
            self.client.get("/api/members/"),
            self.client.post("/api/members/", {}),
            self.client.patch(member_url, {"role": "admin"}),
            self.client.post(f"{member_url}reset-password/"),
        ]

        for response in responses:
            self.assertEqual(response.status_code, 401)
