from rest_framework import serializers

from .models import (
    AccountTransaction,
    CurrencyExchange,
)
from .services import create_currency_exchange


class CurrencyExchangeSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = CurrencyExchange
        fields = "__all__"
        read_only_fields = (
            "created_by_user",
        )

    def create(self, validated_data):
        request = self.context["request"]

        return create_currency_exchange(
            created_by_user=request.user,
            **validated_data,
        )


class AccountTransactionSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = AccountTransaction
        fields = "__all__"
        read_only_fields = (
            "account",
            "transaction_date",
            "transaction_type",
            "direction",
            "amount",
            "currency_code",
            "reference_type",
            "reference_id",
            "description",
            "created_at",
        )