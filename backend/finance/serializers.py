from rest_framework import serializers
from .models import CurrencyExchange, AccountTransaction


class CurrencyExchangeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CurrencyExchange
        fields = '__all__'


class AccountTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountTransaction
        fields = '__all__'
