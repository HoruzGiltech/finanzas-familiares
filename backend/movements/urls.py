from django.urls import path

from . import views

urlpatterns = [
    path("movements/", views.MovementListView.as_view(), name="movements"),
    path("movements/<int:movement_id>/", views.MovementDetailView.as_view(), name="movement"),
]
