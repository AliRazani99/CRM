from rest_framework import viewsets

from accounts.permissions import (
    IsStoreOrPurchaseManager,
)

from .models import Purchase
from .serializers import (
    PurchaseCreateSerializer,
    PurchaseSerializer,
)


class PurchaseViewSet(
    viewsets.ModelViewSet
):
    queryset = (
        Purchase.objects
        .select_related(
            "supplier",
            "warehouse",
            "paying_account",
            "created_by",
        )
        .prefetch_related(
            "items__product",
            "payments__account",
        )
        .order_by("-id")
    )

    permission_classes = [
        IsStoreOrPurchaseManager,
    ]

    http_method_names = [
        "get",
        "post",
        "head",
        "options",
    ]

    def get_serializer_class(self):
        if self.action == "create":
            return PurchaseCreateSerializer

        return PurchaseSerializer
