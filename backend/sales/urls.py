from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SaleViewSet, SaleItemViewSet, PaymentViewSet, CustomerReceivableViewSet

router = DefaultRouter()
router.register(r'sales', SaleViewSet)
router.register(r'sale-items', SaleItemViewSet)
router.register(r'payments', PaymentViewSet)
router.register(r'receivables', CustomerReceivableViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
