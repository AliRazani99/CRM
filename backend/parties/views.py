from rest_framework import viewsets

from accounts.permissions import (
    IsStoreOrPurchaseManager,
    IsStoreOrSalesManager,
    OperationalReadOnlyStoreWrite,
)

from .models import (
    Customer,
    FinancialAccount,
    Supplier,
    Warehouse,
)

from .serializers import (
    CustomerSerializer,
    FinancialAccountCreateSerializer,
    FinancialAccountSerializer,
    FinancialAccountUpdateSerializer,
    SupplierSerializer,
    WarehouseSerializer,
)


class CustomerViewSet(
    viewsets.ModelViewSet
):
    queryset = (
        Customer.objects
        .all()
        .order_by(
            "-created_at"
        )
    )

    serializer_class = (
        CustomerSerializer
    )

    permission_classes = [
        IsStoreOrSalesManager,
    ]


class SupplierViewSet(
    viewsets.ModelViewSet
):
    queryset = (
        Supplier.objects
        .all()
        .order_by(
            "-created_at"
        )
    )

    serializer_class = (
        SupplierSerializer
    )

    permission_classes = [
        IsStoreOrPurchaseManager,
    ]


class WarehouseViewSet(
    viewsets.ModelViewSet
):
    queryset = (
        Warehouse.objects
        .all()
        .order_by("id")
    )

    serializer_class = (
        WarehouseSerializer
    )

    permission_classes = [
        OperationalReadOnlyStoreWrite,
    ]


class FinancialAccountViewSet(
    viewsets.ModelViewSet
):
    # Inactive accounts remain visible for audit.
    # Frontend selection lists can filter them out.
    queryset = (
        FinancialAccount.objects
        .all()
        .order_by("id")
    )

    permission_classes = [
        OperationalReadOnlyStoreWrite,
    ]

    # Never DELETE financial accounts.
    # Never PUT full account state.
    http_method_names = [
        "get",
        "post",
        "patch",
        "head",
        "options",
    ]

    def get_serializer_class(self):
        if self.action == "create":
            return (
                FinancialAccountCreateSerializer
            )

        if self.action == "partial_update":
            return (
                FinancialAccountUpdateSerializer
            )

        return FinancialAccountSerializer
