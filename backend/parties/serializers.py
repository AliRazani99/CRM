from decimal import Decimal

from django.core.exceptions import (
    ValidationError as DjangoValidationError,
)
from rest_framework import serializers

from .models import (
    Customer,
    FinancialAccount,
    Supplier,
    Warehouse,
)
from .services import (
    create_financial_account,
)


class CustomerSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Customer

        fields = [
            "id",
            "full_name",
            "phone",
            "instagram_handle",
            "postal_code",
            "address",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "created_at",
        ]


class SupplierSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Supplier

        fields = [
            "id",
            "name",
            "country",
            "phone",
            "email",
            "is_active",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "created_at",
        ]


class WarehouseSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Warehouse

        fields = [
            "id",
            "name",
            "location",
            "created_at",
        ]

        read_only_fields = [
            "id",
            "created_at",
        ]


class FinancialAccountSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = FinancialAccount

        fields = [
            "id",
            "name",
            "account_type",
            "currency_code",
            "current_balance",
            "is_active",
            "created_at",
        ]

        read_only_fields = fields


class FinancialAccountCreateSerializer(
    serializers.Serializer
):
    ACCOUNT_TYPES = [
        ("BANK", "Bank"),
        ("CASH", "Cash"),
    ]

    CURRENCIES = [
        ("IRR", "IRR"),
        ("CAD", "CAD"),
    ]

    name = serializers.CharField(
        max_length=255,
    )

    account_type = serializers.ChoiceField(
        choices=ACCOUNT_TYPES,
    )

    currency_code = serializers.ChoiceField(
        choices=CURRENCIES,
    )

    opening_balance = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )

    is_active = serializers.BooleanField(
        default=True,
    )

    def create(
        self,
        validated_data,
    ):
        try:
            return (
                create_financial_account(
                    **validated_data
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
        return FinancialAccountSerializer(
            instance,
            context=self.context,
        ).data


class FinancialAccountUpdateSerializer(
    serializers.ModelSerializer
):
    ACCOUNT_TYPES = [
        ("BANK", "Bank"),
        ("CASH", "Cash"),
    ]

    account_type = serializers.ChoiceField(
        choices=ACCOUNT_TYPES,
        required=False,
    )

    class Meta:
        model = FinancialAccount

        fields = [
            "name",
            "account_type",
            "is_active",
        ]

        extra_kwargs = {
            "name": {
                "required": False,
            },
            "is_active": {
                "required": False,
            },
        }

    def validate(self, attrs):
        immutable_fields = {
            "currency_code",
            "current_balance",
            "opening_balance",
        }

        supplied_fields = set(
            self.initial_data.keys()
        )

        invalid_fields = (
            immutable_fields
            & supplied_fields
        )

        if invalid_fields:
            raise serializers.ValidationError(
                {
                    field: (
                        "این فیلد پس از ساخت حساب "
                        "قابل تغییر مستقیم نیست."
                    )
                    for field in invalid_fields
                }
            )

        return attrs

    def to_representation(
        self,
        instance,
    ):
        return FinancialAccountSerializer(
            instance,
            context=self.context,
        ).data
