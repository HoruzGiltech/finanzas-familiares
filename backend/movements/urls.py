from django.urls import path

from . import views

urlpatterns = [
    path("movements/", views.MovementListView.as_view(), name="movements"),
    path("movements/summary/", views.MovementSummaryView.as_view(), name="movement-summary"),
    path(
        "movements/comparison/",
        views.MovementComparisonView.as_view(),
        name="movement-comparison",
    ),
    path("movements/export/", views.MovementExportView.as_view(), name="movement-export"),
    path("movements/<int:movement_id>/", views.MovementDetailView.as_view(), name="movement"),
]
