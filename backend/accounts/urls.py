from django.urls import path

from . import views

urlpatterns = [
    path("auth/csrf/", views.CsrfView.as_view(), name="csrf"),
    path("auth/register/", views.RegisterView.as_view(), name="register"),
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("auth/password/", views.ChangePasswordView.as_view(), name="password"),
    path("members/", views.MemberListView.as_view(), name="members"),
    path("members/<int:member_id>/", views.MemberDetailView.as_view(), name="member"),
    path(
        "members/<int:member_id>/reset-password/",
        views.MemberResetPasswordView.as_view(),
        name="member-reset-password",
    ),
]
