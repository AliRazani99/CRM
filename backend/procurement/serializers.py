from decimal import Decimal

from django.core.exceptions import (
    ValidationError as DjangoValidationError,
)
from django.utils import timezone
from rest_framework import serializers

from parties.models import (
    FinancialAccount,
    Supplier,
    Warehouse,
)
from products.models import Product

from .models import (
    Purchase,
    PurchaseItem,
    PurchasePayment,
)
from .services import (
    create_purchase_with_receipt,
)


class PurchaseItemSerializer(
    serializers.ModelSerializer
):
    product_name = serializers.CharField(
        source="product.name",
        read_only=True,
    )

    product_sku = serializers.CharField(
        source="product.sku",
        read_only=True,
    )

    class Meta:
        model = PurchaseItem

        fields = [
            "id",
            "product",
            "product_name",
            "product_sku",
            "quantity",
            "unit_cost",
            "row_discount",
            "landed_cost_per_unit",
            "line_total",
        ]

        read_only_fields = fields


class PurchasePaymentSerializer(
    serializers.ModelSerializer
):
    account_name = serializers.CharField(
        source="account.name",
        read_only=True,
    )

    class Meta:
        model = PurchasePayment

        fields = [
            "id",
            "account",
            "account_name",
            "payment_date",
            "amount",
            "currency_code",
            "payment_type",
            "notes",
            "created_at",
        ]

        read_only_fields = fields


class PurchaseSerializer(
    serializers.ModelSerializer
):
    supplier_name = serializers.CharField(
        source="supplier.name",
        read_only=True,
    )

    warehouse_name = serializers.CharField(
        source="warehouse.name",
        read_only=True,
    )

    items = PurchaseItemSerializer(
        many=True,
        read_only=True,
    )

    payments = PurchasePaymentSerializer(
        many=True,
        read_only=True,
    )

    subtotal_cad = serializers.SerializerMethodField()
    extra_costs_irr = serializers.SerializerMethodField()
    extra_costs_cad = serializers.SerializerMethodField()
    total_landed_cad = serializers.SerializerMethodField()

    class Meta:
        model = Purchase

        fields = [
            "id",
            "purchase_number",

            "supplier",
            "supplier_name",

            "warehouse",
            "warehouse_name",

            "purchase_date",
            "purchase_currency",
            "exchange_rate_to_cad",
            "irr_per_cad",

            "shipping_cost_irr",
            "customs_cost_irr",
            "other_costs_irr",
            "tax_irr",
            "overall_discount_irr",

            "subtotal_cad",
            "extra_costs_irr",
            "extra_costs_cad",
            "total_landed_cad",

            "paid_amount",
            "paying_account",

            "notes",
            "created_by",
            "created_at",

            "items",
            "payments",
        ]

        read_only_fields = fields

    def get_subtotal_cad(self, obj):
        return sum(
            (
                item.line_total
                for item in obj.items.all()
            ),
            Decimal("0.00"),
        )

    def get_extra_costs_irr(self, obj):
        return (
            obj.shipping_cost_irr
            + obj.customs_cost_irr
            + obj.other_costs_irr
            + obj.tax_irr
            - obj.overall_discount_irr
        )

    def get_extra_costs_cad(self, obj):
        return (
            self.get_extra_costs_irr(obj)
            / obj.irr_per_cad
        )

    def get_total_landed_cad(self, obj):
        return (
            self.get_subtotal_cad(obj)
            + self.get_extra_costs_cad(obj)
        )


class PurchaseCreateItemSerializer(
    serializers.Serializer
):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(),
    )

    quantity = serializers.IntegerField(
        min_value=1,
    )

    unit_cost_cad = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )


class PurchaseCreateSerializer(
    serializers.Serializer
):
    supplier = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.filter(
            is_active=True,
        ),
    )

    warehouse = serializers.PrimaryKeyRelatedField(
        queryset=Warehouse.objects.all(),
    )

    purchase_date = serializers.DateField(
        default=timezone.localdate,
    )

    items = PurchaseCreateItemSerializer(
        many=True,
    )

    irr_per_cad = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )

    shipping_cost_irr = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )

    customs_cost_irr = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )

    other_costs_irr = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )

    tax_irr = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )

    overall_discount_irr = serializers.DecimalField(
        max_digits=20,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )

    purchase_account = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(
            is_active=True,
            currency_code="CAD",
        ),
    )

    cost_account = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(
            is_active=True,
            currency_code="IRR",
        ),
        required=False,
        allow_null=True,
    )

    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )

    def validate(self, attrs):
        items = attrs.get("items", [])

        if not items:
            raise serializers.ValidationError(
                {
                    "items":
                        "حداقل یک قلم کالا الزامی است."
                }
            )

        gross_extra = (
            attrs.get(
                "shipping_cost_irr",
                Decimal("0.00"),
            )
            + attrs.get(
                "customs_cost_irr",
                Decimal("0.00"),
            )
            + attrs.get(
                "other_costs_irr",
                Decimal("0.00"),
            )
            + attrs.get(
                "tax_irr",
                Decimal("0.00"),
            )
        )

        discount = attrs.get(
            "overall_discount_irr",
            Decimal("0.00"),
        )

        if discount > gross_extra:
            raise serializers.ValidationError(
                {
                    "overall_discount_irr":
                        "تخفیف نمی‌تواند از مجموع "
                        "هزینه‌های جانبی بیشتر باشد."
                }
            )

        net_extra = (
            gross_extra
            - discount
        )

        if (
            net_extra > 0
            and attrs.get(
                "cost_account"
            ) is None
        ):
            raise serializers.ValidationError(
                {
                    "cost_account":
                        "برای هزینه‌های جانبی، "
                        "حساب ریالی الزامی است."
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
                create_purchase_with_receipt(
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
        return PurchaseSerializer(
            instance,
            context=self.context,
        ).data
