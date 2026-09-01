from rest_framework import viewsets

from accounts.permissions import (
    IsStoreManager,
)

from .models import (
    AccountTransaction,
    CurrencyExchange,
)
from .serializers import (
    AccountTransactionSerializer,
    CurrencyExchangeSerializer,
)


class CurrencyExchangeViewSet(
    viewsets.ModelViewSet
):
    queryset = CurrencyExchange.objects.all()
    serializer_class = (
        CurrencyExchangeSerializer
    )
    permission_classes = [
        IsStoreManager,
    ]

    http_method_names = [
        "get",
        "post",
        "head",
        "options",
    ]


class AccountTransactionViewSet(
    viewsets.ReadOnlyModelViewSet
):
    queryset = AccountTransaction.objects.all()
    serializer_class = (
        AccountTransactionSerializer
    )
    permission_classes = [
        IsStoreManager,
    ]