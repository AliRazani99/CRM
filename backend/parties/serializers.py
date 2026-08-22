from rest_framework import serializers

from .models import (
    Customer,
    Supplier,
    Warehouse,
)


class CustomerSerializer(serializers.ModelSerializer):
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

class SupplierSerializer(serializers.ModelSerializer):
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