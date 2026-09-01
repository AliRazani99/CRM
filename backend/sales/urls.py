from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CustomerReceivableViewSet,
    PaymentViewSet,
    SaleItemViewSet,
    SaleViewSet,
)


router = DefaultRouter()

router.register(
    r"sales",
    SaleViewSet,
    basename="sale",
)

router.register(
    r"sale-items",
    SaleItemViewSet,
)

router.register(
    r"payments",
    PaymentViewSet,
)

router.register(
    r"receivables",
    CustomerReceivableViewSet,
)


urlpatterns = [
    path("", include(router.urls)),
]