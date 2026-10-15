from django.urls import path

from . import views

urlpatterns = [
    path("rates/current/", views.CurrentRateView.as_view(), name="current-rate"),
]
