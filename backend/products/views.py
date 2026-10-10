from rest_framework import viewsets
from decimal import Decimal

from django.db.models import Count, Max, Sum
from rest_framework.decorators import action
from rest_framework.response import Response
from sales.models import SaleItem
from accounts.permissions import (
    OperationalReadOnlyStoreWrite,
    IsStoreOrSalesManager,
)

from .models import (
    Brand,
    Category,
    Product,
)

from .serializers import (
    BrandSerializer,
    CategorySerializer,
    ProductCreateSerializer,
    ProductSerializer,
)


class CategoryViewSet(
    viewsets.ModelViewSet
):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    permission_classes = [
        OperationalReadOnlyStoreWrite,
    ]


class BrandViewSet(
    viewsets.ModelViewSet
):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer

    permission_classes = [
        OperationalReadOnlyStoreWrite,
    ]


class ProductViewSet(
    viewsets.ModelViewSet
):
    
    queryset = (
        Product.objects
        .select_related(
            "category",
            "brand",
        )
        .all()
    )

    serializer_class = ProductSerializer

    permission_classes = [
        OperationalReadOnlyStoreWrite,
    ]
    def get_serializer_class(self):
        if self.action == "create":
            return ProductCreateSerializer

        return ProductSerializer

    @action(
        detail=True,
        methods=["get"],
        permission_classes=[IsStoreOrSalesManager],
    )
    def buyers(self, request, pk=None):
        product = self.get_object()

        rows = (
            SaleItem.objects
            .filter(product=product)
            .values(
                "sale__customer_id",
                "sale__customer__full_name",
                "sale__customer__phone",
            )
            .annotate(
                invoice_count=Count("sale_id", distinct=True),
                total_quantity=Sum("quantity"),
                total_amount_irr=Sum("line_total_irr"),
                last_purchase_date=Max("sale__sale_date"),
            )
            .order_by("-last_purchase_date", "sale__customer_id")
        )

        return Response({
            "buyers": [
                {
                    "customer_id": row["sale__customer_id"],
                    "customer_name": row["sale__customer__full_name"],
                    "phone": row["sale__customer__phone"],
                    "invoice_count": row["invoice_count"],
                    "total_quantity": row["total_quantity"],
                    "total_amount_irr": str(
                        row["total_amount_irr"] or Decimal("0.00")
                    ),
                    "last_purchase_date": row["last_purchase_date"],
                }
                for row in rows
            ],
        })