from decimal import Decimal

from django.contrib.auth import (
    get_user_model,
)
from rest_framework.test import (
    APITestCase,
)

from accounts.models import Role
from inventory.models import (
    Inventory,
    StockMovement,
)
from parties.models import Warehouse

from .models import (
    Brand,
    Category,
    Product,
)


class ProductTests(APITestCase):

    def setUp(self):
        User = get_user_model()

        role, _ = Role.objects.get_or_create(
            code=Role.Code.STORE_MANAGER,
            defaults={
                "name": "مدیر فروشگاه",
            },
        )

        self.user = User.objects.create_user(
            username="product_manager",
            email="product@example.com",
            password="test-password-123",
            role=role,
        )

        self.warehouse_1 = (
            Warehouse.objects.create(
                name="Warehouse 1",
                location="Tehran",
            )
        )

        self.warehouse_2 = (
            Warehouse.objects.create(
                name="Warehouse 2",
                location="Tehran",
            )
        )

        self.client.force_authenticate(
            user=self.user,
        )

    def test_create_product_with_opening_stock(
        self,
    ):
        response = self.client.post(
            "/api/products/",
            {
                "name": "Test Product",
                "sku": "test-sku-001",
                "category_name": "Phones",
                "brand_name": "Test Brand",
                "sales_price_irr": "100000.00",
                "default_cost_cad": "20.00",
                "reorder_level": 5,
                "opening_stocks": [
                    {
                        "warehouse":
                            self.warehouse_1.pk,
                        "quantity": 10,
                    },
                    {
                        "warehouse":
                            self.warehouse_2.pk,
                        "quantity": 4,
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
        )

        product = Product.objects.get(
            sku="TEST-SKU-001",
        )

        self.assertEqual(
            product.default_cost_cad,
            Decimal("20.00"),
        )

        self.assertEqual(
            Category.objects.count(),
            1,
        )

        self.assertEqual(
            Brand.objects.count(),
            1,
        )

        inventory_1 = (
            Inventory.objects.get(
                product=product,
                warehouse=self.warehouse_1,
            )
        )

        inventory_2 = (
            Inventory.objects.get(
                product=product,
                warehouse=self.warehouse_2,
            )
        )

        self.assertEqual(
            inventory_1.qty_on_hand,
            10,
        )

        self.assertEqual(
            inventory_1.qty_available,
            10,
        )

        self.assertEqual(
            inventory_2.qty_on_hand,
            4,
        )

        self.assertEqual(
            StockMovement.objects.filter(
                product=product,
                movement_type=(
                    "OPENING_BALANCE"
                ),
            ).count(),
            2,
        )

    def test_duplicate_sku_is_rejected(
        self,
    ):
        category = Category.objects.create(
            name="Phones",
        )

        brand = Brand.objects.create(
            name="Brand",
        )

        Product.objects.create(
            name="Existing",
            sku="SKU-001",
            category=category,
            brand=brand,
            sales_price_irr=100,
        )

        response = self.client.post(
            "/api/products/",
            {
                "name": "Duplicate",
                "sku": "sku-001",
                "category_name": "Phones",
                "brand_name": "Brand",
                "sales_price_irr": "100",
                "default_cost_cad": "10",
                "reorder_level": 1,
                "opening_stocks": [],
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            400,
        )

        self.assertEqual(
            Product.objects.count(),
            1,
        )