from django.db import transaction
from rest_framework import viewsets

from accounts.permissions import (
    IsStoreOrSalesManager,
)

from .models import (
    CustomerReceivable,
    Payment,
    Sale,
    SaleItem,
)
from .serializers import (
    CustomerReceivableSerializer,
    PaymentSerializer,
    SaleItemSerializer,
    SaleSerializer,
)
from .services import (
    recalculate_sale,
    decrease_inventory_for_sale,
)
class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.all()
    serializer_class = SaleSerializer
    permission_classes = [
        IsStoreOrSalesManager,
    ]

    def perform_create(self, serializer):
        serializer.save(
            created_by_user=self.request.user,
        )


class SaleItemViewSet(viewsets.ModelViewSet):
    queryset = SaleItem.objects.all()
    serializer_class = SaleItemSerializer
    permission_classes = [
        IsStoreOrSalesManager,
    ]

    @transaction.atomic
    def perform_create(self, serializer):

        print("SALE ITEM VIEWSET CREATE CALLED")

        item = serializer.save()

        decrease_inventory_for_sale(
            item,
            self.request.user,
        )

        recalculate_sale(
            item.sale_id
        )

    @transaction.atomic
    def perform_update(self, serializer):
        item = serializer.save()
        recalculate_sale(item.sale_id)

    @transaction.atomic
    def perform_destroy(self, instance):
        sale_id = instance.sale_id
        instance.delete()
        recalculate_sale(sale_id)


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [
        IsStoreOrSalesManager,
    ]

    # پرداخت مالی بعد از ثبت نباید PATCH/DELETE شود.
    http_method_names = [
        "get",
        "post",
        "head",
        "options",
    ]


class CustomerReceivableViewSet(
    viewsets.ReadOnlyModelViewSet
):
    queryset = CustomerReceivable.objects.all()
    serializer_class = CustomerReceivableSerializer
    permission_classes = [
        IsStoreOrSalesManager,
    ]

