from rest_framework import serializers
from .models import Sale, SaleItem, Payment, CustomerReceivable


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = '__all__'


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = '__all__'


class CustomerReceivableSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerReceivable
        fields = '__all__'


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    receivable = CustomerReceivableSerializer(read_only=True)

    class Meta:
        model = Sale
        fields = '__all__'
