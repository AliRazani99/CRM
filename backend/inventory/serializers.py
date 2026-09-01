from rest_framework import serializers
from .services import transfer_stock
from .models import (
    Inventory,
    StockMovement,
    StockTransfer,
)


class InventorySerializer(
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

    warehouse_name = serializers.CharField(
        source="warehouse.name",
        read_only=True,
    )

    class Meta:
        model = Inventory

        fields = [
            "id",

            "product",
            "product_name",
            "product_sku",

            "warehouse",
            "warehouse_name",

            "qty_on_hand",
            "qty_reserved",
            "qty_available",
            "avg_cost_cad",

            "updated_at",
        ]

        read_only_fields = [
            "id",
            "qty_available",
            "updated_at",
        ]


class StockMovementSerializer(
    serializers.ModelSerializer
):
    product_name = serializers.CharField(
        source="product.name",
        read_only=True,
    )

    warehouse_name = serializers.CharField(
        source="warehouse.name",
        read_only=True,
    )

    class Meta:
        model = StockMovement

        fields = "__all__"

        read_only_fields = [
            "created_by",
        ]


class StockTransferSerializer(
    serializers.ModelSerializer
):
    product_name = serializers.CharField(
        source="product.name",
        read_only=True,
    )

    source_warehouse_name = serializers.CharField(
        source="source_warehouse.name",
        read_only=True,
    )

    destination_warehouse_name = serializers.CharField(
        source="destination_warehouse.name",
        read_only=True,
    )

    class Meta:
        model = StockTransfer

        fields = "__all__"

        read_only_fields = [
            "created_by",
            "transfer_date",
        ]
    def create(self, validated_data):
        request = self.context["request"]

        return transfer_stock(
            created_by=request.user,
            **validated_data,
        )