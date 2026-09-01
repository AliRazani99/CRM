from django.db import transaction
from rest_framework import viewsets
from django.core.exceptions import (
    ValidationError as DjangoValidationError,
)

from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status

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
    CustomerSettlementSerializer,
    PaymentSerializer,
    SaleCreateSerializer,
    SaleItemSerializer,
    SaleSerializer,
)

from .services import (
    decrease_inventory_for_sale,
    recalculate_sale,
    settle_customer_debt,
)

class SaleViewSet(
    viewsets.ModelViewSet
):
    queryset = (
        Sale.objects
        .select_related(
            "customer",
            "created_by_user",
        )
        .prefetch_related(
            "items",
            "payments",
        )
        .order_by("-id")
    )

    permission_classes = [
        IsStoreOrSalesManager,
    ]

    def get_serializer_class(self):
        if self.action == "create":
            return SaleCreateSerializer

        return SaleSerializer

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
    @action(
        detail=False,
        methods=["post"],
        url_path="settle-customer",
    )
    def settle_customer(
        self,
        request,
    ):
        serializer = (
            CustomerSettlementSerializer(
                data=request.data,
                context={
                    "request": request,
                },
            )
        )

        serializer.is_valid(
            raise_exception=True
        )

        try:
            payments = settle_customer_debt(
                **serializer.validated_data
            )

        except DjangoValidationError as exc:
            from rest_framework.exceptions import (
                ValidationError,
            )

            raise ValidationError(
                exc.messages
            )

        return Response(
            {
                "ok": True,
                "payments": (
                    PaymentSerializer(
                        payments,
                        many=True,
                    ).data
                ),
            },
            status=status.HTTP_201_CREATED,
        )

class CustomerReceivableViewSet(
    viewsets.ReadOnlyModelViewSet
):
    queryset = CustomerReceivable.objects.all()
    serializer_class = CustomerReceivableSerializer
    permission_classes = [
        IsStoreOrSalesManager,
    ]

