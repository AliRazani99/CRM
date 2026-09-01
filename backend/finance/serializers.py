from decimal import Decimal

from django.core.exceptions import (
    ValidationError as DjangoValidationError,
)
from django.utils import timezone
from rest_framework import serializers

from parties.models import (
    FinancialAccount,
)

from .models import (
    AccountTransaction,
    CurrencyExchange,
)
from .services import (
    create_currency_exchange,
)


class CurrencyExchangeSerializer(
    serializers.ModelSerializer
):
    from_account_name = (
        serializers.CharField(
            source="from_account.name",
            read_only=True,
        )
    )

    to_account_name = (
        serializers.CharField(
            source="to_account.name",
            read_only=True,
        )
    )

    class Meta:
        model = CurrencyExchange

        fields = [
            "id",
            "exchange_partner_name",
            "exchange_date",

            "from_account",
            "from_account_name",
            "from_amount",
            "from_currency_code",

            "to_account",
            "to_account_name",
            "to_amount",
            "to_currency_code",

            "exchange_rate",

            "created_by_user",
            "notes",
        ]

        read_only_fields = fields


class CurrencyExchangeCreateSerializer(
    serializers.Serializer
):
    exchange_partner_name = (
        serializers.CharField(
            max_length=255,
        )
    )

    exchange_date = serializers.DateField(
        default=timezone.localdate,
    )

    from_account = (
        serializers.PrimaryKeyRelatedField(
            queryset=(
                FinancialAccount.objects
                .filter(is_active=True)
            ),
        )
    )

    to_account = (
        serializers.PrimaryKeyRelatedField(
            queryset=(
                FinancialAccount.objects
                .filter(is_active=True)
            ),
        )
    )

    from_amount = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )

    to_amount = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )

    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )

    def validate(self, attrs):
        if (
            attrs["from_account"].pk
            == attrs["to_account"].pk
        ):
            raise serializers.ValidationError(
                {
                    "to_account": (
                        "حساب مبدأ و مقصد "
                        "نمی‌توانند یکسان باشند."
                    )
                }
            )

        if (
            attrs[
                "from_account"
            ].currency_code
            ==
            attrs[
                "to_account"
            ].currency_code
        ):
            raise serializers.ValidationError(
                {
                    "to_account": (
                        "تبدیل ارز نیاز به دو "
                        "ارز متفاوت دارد."
                    )
                }
            )

        return attrs

    def create(
        self,
        validated_data,
    ):
        request = self.context[
            "request"
        ]

        try:
            return (
                create_currency_exchange(
                    created_by_user=(
                        request.user
                    ),
                    **validated_data,
                )
            )

        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                exc.messages
            )

    def to_representation(
        self,
        instance,
    ):
        return CurrencyExchangeSerializer(
            instance,
            context=self.context,
        ).data


class AccountTransactionSerializer(
    serializers.ModelSerializer
):
    account_name = serializers.CharField(
        source="account.name",
        read_only=True,
    )

    class Meta:
        model = AccountTransaction

        fields = [
            "id",

            "account",
            "account_name",

            "transaction_date",
            "transaction_type",
            "direction",
            "amount",
            "currency_code",

            "reference_type",
            "reference_id",

            "description",
            "created_at",
        ]

        read_only_fields = fields
