from rest_framework import viewsets

from accounts.permissions import (
    IsStoreOrPurchaseManager,
    IsStoreOrSalesManager,
    OperationalReadOnlyStoreWrite,
)

from .models import (
    Customer,
    Supplier,
    Warehouse,
)
from .serializers import (
    CustomerSerializer,
    SupplierSerializer,
    WarehouseSerializer,
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