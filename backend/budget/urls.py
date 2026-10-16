from django.urls import path

from . import views

urlpatterns = [
    path("budget/", views.BudgetView.as_view(), name="budget"),
    path("budget/items/", views.BudgetItemListView.as_view(), name="budget-items"),
    path("budget/items/<int:item_id>/", views.BudgetItemDetailView.as_view(), name="budget-item"),
    path(
        "budget/items/<int:item_id>/realize/",
        views.RealizeView.as_view(),
        name="budget-item-realize",
    ),
    path("budget/items/<int:item_id>/undo/", views.UndoView.as_view(), name="budget-item-undo"),
    path("budget/proposal/", views.ProposalView.as_view(), name="budget-proposal"),
]
