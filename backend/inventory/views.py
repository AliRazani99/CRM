from rest_framework import viewsets

from accounts.permissions import (
    IsStoreManager,
    IsOperationalUser,
)

from .models import (
    Inventory,
    StockMovement,
    StockTransfer,
)

from .serializers import (
    InventorySerializer,
    StockMovementSerializer,
    StockTransferSerializer,
)


class InventoryViewSet(
    viewsets.ReadOnlyModelViewSet
):
    queryset = (
        Inventory.objects
        .select_related(
            "product",
            "warehouse",
        )
        .all()
    )

    serializer_class = InventorySerializer

    permission_classes = [
        IsOperationalUser,
    ]


class StockMovementViewSet(
    viewsets.ReadOnlyModelViewSet
):
    queryset = (
        StockMovement.objects
        .select_related(
            "product",
            "warehouse",
            "created_by",
        )
        .all()
        .order_by("-movement_date")
    )

    serializer_class = StockMovementSerializer

    permission_classes = [
        IsOperationalUser,
    ]


class StockTransferViewSet(
    viewsets.ModelViewSet
):
    queryset = (
        StockTransfer.objects
        .select_related(
            "product",
            "source_warehouse",
            "destination_warehouse",
            "created_by",
        )
        .all()
        .order_by("-transfer_date")
    )

    serializer_class = StockTransferSerializer

    permission_classes = [
        IsStoreManager,
    ]

    http_method_names = [
        "get",
        "post",
        "head",
        "options",
    ]