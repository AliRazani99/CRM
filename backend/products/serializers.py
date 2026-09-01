from rest_framework import serializers

from .models import (
    Brand,
    Category,
    Product,
)
from parties.models import Warehouse

from .services import (
    create_product_with_opening_stock,
)

class CategorySerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Category
        fields = [
            "id",
            "name",
        ]


class BrandSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Brand
        fields = [
            "id",
            "name",
        ]


class ProductSerializer(
    serializers.ModelSerializer
):
    category_name = serializers.CharField(
        source="category.name",
        read_only=True,
    )

    brand_name = serializers.CharField(
        source="brand.name",
        read_only=True,
    )

    class Meta:
        model = Product

        fields = [
            "id",
            "name",
            "sku",

            "category",
            "category_name",

            "brand",
            "brand_name",

            "sales_price_irr",
            "default_cost_cad",
            "reorder_level",
            "is_active",

            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
        ]

class OpeningStockSerializer(
    serializers.Serializer
):
    warehouse = (
        serializers.PrimaryKeyRelatedField(
            queryset=Warehouse.objects.all(),
        )
    )

    quantity = serializers.IntegerField(
        min_value=0,
    )


class ProductCreateSerializer(
    serializers.Serializer
):
    name = serializers.CharField(
        max_length=255,
    )

    sku = serializers.CharField(
        max_length=100,
    )

    category_name = serializers.CharField(
        max_length=150,
    )

    brand_name = serializers.CharField(
        max_length=150,
    )

    sales_price_irr = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        min_value=0,
    )

    default_cost_cad = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        min_value=0,
        default=0,
    )

    reorder_level = serializers.IntegerField(
        min_value=0,
        default=0,
    )

    opening_stocks = OpeningStockSerializer(
        many=True,
        required=False,
        default=list,
    )

    def validate_sku(self, value):
        normalized = value.strip().upper()

        if Product.objects.filter(
            sku__iexact=normalized
        ).exists():
            raise serializers.ValidationError(
                "این SKU قبلاً ثبت شده است."
            )

        return normalized

    def validate_opening_stocks(
        self,
        value,
    ):
        warehouse_ids = [
            item["warehouse"].pk
            for item in value
        ]

        if (
            len(warehouse_ids)
            != len(set(warehouse_ids))
        ):
            raise serializers.ValidationError(
                "هر انبار فقط یک بار قابل انتخاب است."
            )

        return value

    def create(self, validated_data):
        request = self.context["request"]

        return create_product_with_opening_stock(
            created_by=request.user,
            **validated_data,
        )

    def to_representation(self, instance):
        return ProductSerializer(
            instance,
            context=self.context,
        ).data