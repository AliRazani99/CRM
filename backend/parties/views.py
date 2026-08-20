from rest_framework import viewsets

from .models import Customer, Supplier
from .serializers import CustomerSerializer, SupplierSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("-created_at")
    serializer_class = CustomerSerializer

class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by("-created_at")
    serializer_class = SupplierSerializer