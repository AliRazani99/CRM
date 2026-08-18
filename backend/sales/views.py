from rest_framework import viewsets
from .models import Sale, SaleItem, Payment, CustomerReceivable
from .serializers import SaleSerializer, SaleItemSerializer, PaymentSerializer, CustomerReceivableSerializer


class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.all()
    serializer_class = SaleSerializer


class SaleItemViewSet(viewsets.ModelViewSet):
    queryset = SaleItem.objects.all()
    serializer_class = SaleItemSerializer


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer


class CustomerReceivableViewSet(viewsets.ModelViewSet):
    queryset = CustomerReceivable.objects.all()
    serializer_class = CustomerReceivableSerializer
