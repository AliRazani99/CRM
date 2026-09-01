from rest_framework import viewsets

from accounts.permissions import (
    IsOperationalUser,
    IsStoreOrPurchaseManager,
    IsStoreOrSalesManager,
    OperationalReadOnlyStoreWrite,
)

from .models import (
    Customer,
    Supplier,
    Warehouse,
    FinancialAccount,
)

from .serializers import (
    CustomerSerializer,
    SupplierSerializer,
    WarehouseSerializer,
    FinancialAccountSerializer,
)


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by(
        "-created_at"
    )
    serializer_class = CustomerSerializer
    permission_classes = [
        IsStoreOrSalesManager,
    ]


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by(
        "-created_at"
    )
    serializer_class = SupplierSerializer
    permission_classes = [
        IsStoreOrPurchaseManager,
    ]

class WarehouseViewSet(
    viewsets.ModelViewSet
):
    queryset = Warehouse.objects.all().order_by(
        "id"
    )

    serializer_class = WarehouseSerializer

    permission_classes = [
        OperationalReadOnlyStoreWrite,
    ]

class FinancialAccountViewSet(
    viewsets.ReadOnlyModelViewSet
):
    queryset = (
        FinancialAccount.objects
        .filter(is_active=True)
        .order_by("id")
    )

    serializer_class = (
        FinancialAccountSerializer
    )

    permission_classes = [
        IsOperationalUser,
    ]