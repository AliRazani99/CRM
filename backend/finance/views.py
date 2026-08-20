from rest_framework import permissions, viewsets

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
    serializer_class = CurrencyExchangeSerializer
    permission_classes = [
        permissions.IsAuthenticated,
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
    serializer_class = AccountTransactionSerializer
    permission_classes = [
        permissions.IsAuthenticated,
    ]