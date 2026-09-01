from rest_framework import serializers
from decimal import Decimal
from .models import (
    CustomerReceivable,
    Payment,
    Sale,
    SaleItem,
)
from .services import (
    create_sale_with_items_and_payment,
    register_payment,
)
from django.core.exceptions import (
    ValidationError as DjangoValidationError,
)
from django.utils import timezone

from inventory.models import Inventory
from parties.models import (
    Customer,
    FinancialAccount,
    Warehouse,
)
from products.models import Product

class SaleItemSerializer(serializers.ModelSerializer):

    class Meta:
        model = SaleItem
        fields = "__all__"
        read_only_fields = (
            "line_total_irr",
        )

    def validate(self, data):

        if not data.get("warehouse"):
            raise serializers.ValidationError(
                "Warehouse is required for sale item."
            )

        return data


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

class SaleCreateItemSerializer(
    serializers.Serializer
):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(),
    )

    warehouse = (
        serializers.PrimaryKeyRelatedField(
            queryset=Warehouse.objects.all(),
        )
    )

    quantity = serializers.IntegerField(
        min_value=1,
    )

    unit_price_irr = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        min_value=0,
    )


class SaleCreateSerializer(
    serializers.Serializer
):
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
    )

    sale_date = serializers.DateField(
        default=timezone.localdate,
    )
    cad_rate_irr_per_cad = (
        serializers.DecimalField(
            max_digits=20,
            decimal_places=2,
            min_value=Decimal("0.01"),
            required=False,
            allow_null=True,
            default=None,
        )
    )
    items = SaleCreateItemSerializer(
        many=True,
    )

    paid_amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        min_value=0,
        default=0,
    )

    payment_account = (
        serializers.PrimaryKeyRelatedField(
            queryset=FinancialAccount.objects.filter(
                is_active=True,
                currency_code="IRR",
            ),
            required=False,
            allow_null=True,
        )
    )

    payment_method = serializers.CharField(
        max_length=50,
        default="CASH",
    )

    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )

    def validate(self, attrs):
        items = attrs.get(
            "items",
            []
        )

        if not items:
            raise serializers.ValidationError(
                {
                    "items":
                        "حداقل یک قلم کالا الزامی است."
                }
            )

        paid_amount = attrs.get(
            "paid_amount",
            0,
        )

        payment_account = attrs.get(
            "payment_account"
        )

        if (
            paid_amount > 0
            and payment_account is None
        ):
            raise serializers.ValidationError(
                {
                    "payment_account":
                        "برای پرداخت، حساب مالی الزامی است."
                }
            )

        # جمع مقدار موردنیاز برای هر
        # product/warehouse
        requested = {}

        for item in items:
            key = (
                item["product"].pk,
                item["warehouse"].pk,
            )

            requested[key] = (
                requested.get(key, 0)
                + item["quantity"]
            )

        for (
            product_id,
            warehouse_id,
        ), quantity in requested.items():

            inventory = (
                Inventory.objects
                .filter(
                    product_id=product_id,
                    warehouse_id=warehouse_id,
                )
                .first()
            )

            if inventory is None:
                raise serializers.ValidationError(
                    {
                        "items":
                            "برای یکی از کالاها "
                            "در انبار انتخابی موجودی "
                            "تعریف نشده است."
                    }
                )

            if (
                inventory.qty_available
                < quantity
            ):
                raise serializers.ValidationError(
                    {
                        "items":
                            "موجودی یکی از کالاها "
                            "در انبار انتخابی کافی نیست."
                    }
                )

        return attrs

    def create(self, validated_data):
        request = self.context[
            "request"
        ]

        try:
            return (
                create_sale_with_items_and_payment(
                    created_by=request.user,
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
        return SaleSerializer(
            instance,
            context=self.context,
        ).data

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

class CustomerSettlementSerializer(
    serializers.Serializer
):
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
    )

    account = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(
            is_active=True,
            currency_code="IRR",
        ),
    )

    payment_date = serializers.DateField(
        default=timezone.localdate,
    )

    amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )

    payment_method = serializers.CharField(
        max_length=50,
        default="CASH",
    )

    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )