from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CurrencyExchangeViewSet, AccountTransactionViewSet

router = DefaultRouter()
router.register(r'exchanges', CurrencyExchangeViewSet)
router.register(r'transactions', AccountTransactionViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
