from rest_framework import serializers

from .models import Customer


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