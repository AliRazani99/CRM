from rest_framework.routers import DefaultRouter

from .views import (
    CustomerViewSet,
    SupplierViewSet,
    WarehouseViewSet,
    FinancialAccountViewSet,
)


router = DefaultRouter()

router.register(
    "customers",
    CustomerViewSet,
    basename="customer",
)

router.register(
    "suppliers",
    SupplierViewSet,
    basename="supplier",
)

router.register(
    "warehouses",
    WarehouseViewSet,
    basename="warehouse",
)

router.register(
    "financial-accounts",
    FinancialAccountViewSet,
    basename="financial-account",
)

urlpatterns = router.urls