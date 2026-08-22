from rest_framework.routers import (
    DefaultRouter,
)

from .views import (
    InventoryViewSet,
    StockMovementViewSet,
    StockTransferViewSet,
)


router = DefaultRouter()

router.register(
    "inventory",
    InventoryViewSet,
    basename="inventory",
)

router.register(
    "stock-movements",
    StockMovementViewSet,
    basename="stock-movement",
)

router.register(
    "stock-transfers",
    StockTransferViewSet,
    basename="stock-transfer",
)


urlpatterns = router.urls