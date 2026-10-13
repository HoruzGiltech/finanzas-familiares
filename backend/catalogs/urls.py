from django.urls import path

from . import views

urlpatterns = [
    path("catalogs/", views.CatalogsView.as_view(), name="catalogs"),
    path("categories/", views.CategoryListView.as_view(), name="categories"),
    path("categories/<int:item_id>/", views.CategoryDetailView.as_view(), name="category"),
    path("payment-methods/", views.PaymentMethodListView.as_view(), name="payment-methods"),
    path(
        "payment-methods/<int:item_id>/",
        views.PaymentMethodDetailView.as_view(),
        name="payment-method",
    ),
]
