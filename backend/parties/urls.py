from rest_framework.routers import DefaultRouter

from .views import (
    CustomerViewSet,
    SupplierViewSet,
    WarehouseViewSet,
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

urlpatterns = router.urls