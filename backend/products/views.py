from rest_framework import viewsets

from accounts.permissions import (
    OperationalReadOnlyStoreWrite,
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