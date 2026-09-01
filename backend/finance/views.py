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
    CurrencyExchangeCreateSerializer,
    CurrencyExchangeSerializer,
)


class CurrencyExchangeViewSet(
    viewsets.ModelViewSet
):
    queryset = (
        CurrencyExchange.objects
        .select_related(
            "from_account",
            "to_account",
            "created_by_user",
        )
        .order_by(
            "-exchange_date",
            "-id",
        )
    )

    permission_classes = [
        IsStoreManager,
    ]

    # Financial history is immutable.
    http_method_names = [
        "get",
        "post",
        "head",
        "options",
    ]

    def get_serializer_class(self):
        if self.action == "create":
            return (
                CurrencyExchangeCreateSerializer
            )

        return CurrencyExchangeSerializer


class AccountTransactionViewSet(
    viewsets.ReadOnlyModelViewSet
):
    queryset = (
        AccountTransaction.objects
        .select_related(
            "account"
        )
        .order_by(
            "-transaction_date",
            "-id",
        )
    )

    serializer_class = (
        AccountTransactionSerializer
    )

    permission_classes = [
        IsStoreManager,
    ]
