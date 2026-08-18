from rest_framework import viewsets
from .models import CurrencyExchange, AccountTransaction
from .serializers import CurrencyExchangeSerializer, AccountTransactionSerializer


class CurrencyExchangeViewSet(viewsets.ModelViewSet):
    queryset = CurrencyExchange.objects.all()
    serializer_class = CurrencyExchangeSerializer


class AccountTransactionViewSet(viewsets.ModelViewSet):
    queryset = AccountTransaction.objects.all()
    serializer_class = AccountTransactionSerializer
