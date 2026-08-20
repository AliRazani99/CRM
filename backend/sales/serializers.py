from rest_framework import serializers

from .models import (
    CustomerReceivable,
    Payment,
    Sale,
    SaleItem,
)
from .services import register_payment


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = "__all__"
        read_only_fields = (
            "line_total_irr",
        )


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = "__all__"
        read_only_fields = (
            "created_at",
        )

    def create(self, validated_data):
        return register_payment(
            **validated_data,
        )


class CustomerReceivableSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = CustomerReceivable
        fields = "__all__"
        read_only_fields = (
            "customer",
            "sale",
            "original_amount",
            "paid_amount",
            "remaining_amount",
            "status",
            "created_at",
        )


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(
        many=True,
        read_only=True,
    )

    payments = PaymentSerializer(
        many=True,
        read_only=True,
    )

    receivable = CustomerReceivableSerializer(
        read_only=True,
    )

    class Meta:
        model = Sale
        fields = "__all__"

        read_only_fields = (
            "total_amount",
            "total_paid",
            "total_debt",
            "settlement_status",
            "created_by_user",
            "created_at",
        )