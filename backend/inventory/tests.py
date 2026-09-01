from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Role
from inventory.models import Inventory, StockMovement, StockTransfer
from parties.models import Customer, Warehouse
from products.models import Brand, Category, Product
from sales.models import Sale, SaleItem


class InventoryFlowTests(APITestCase):
    def setUp(self):
        User = get_user_model()

        store_role, _ = Role.objects.get_or_create(
            code=Role.Code.STORE_MANAGER,
            defaults={"name": "مدیر فروشگاه"},
        )
        sales_role, _ = Role.objects.get_or_create(
            code=Role.Code.SALES_MANAGER,
            defaults={"name": "مدیر فروش"},
        )

        self.store_user = User.objects.create_user(
            username="inventory_store_manager",
            email="inventory_store@example.com",
            password="test-password-123",
            role=store_role,
        )
        self.sales_user = User.objects.create_user(
            username="inventory_sales_manager",
            email="inventory_sales@example.com",
            password="test-password-123",
            role=sales_role,
        )

        self.warehouse_a = Warehouse.objects.create(
            name="Warehouse A",
            location="Tehran",
        )
        self.warehouse_b = Warehouse.objects.create(
            name="Warehouse B",
            location="Karaj",
        )
        self.warehouse_c = Warehouse.objects.create(
            name="Warehouse C",
            location="Shiraz",
        )

        category = Category.objects.create(name="Phones")
        brand = Brand.objects.create(name="Test Brand")

        self.product = Product.objects.create(
            category=category,
            brand=brand,
            name="Test Product",
            sku="INV-TEST-001",
            sales_price_irr=Decimal("1000.00"),
            default_cost_cad=Decimal("100.00"),
            reorder_level=2,
        )

        self.inventory_a = Inventory.objects.create(
            product=self.product,
            warehouse=self.warehouse_a,
            qty_on_hand=10,
            qty_reserved=2,
            avg_cost_cad=Decimal("100.00"),
        )
        self.inventory_b = Inventory.objects.create(
            product=self.product,
            warehouse=self.warehouse_b,
            qty_on_hand=4,
            qty_reserved=0,
            avg_cost_cad=Decimal("200.00"),
        )

        self.customer = Customer.objects.create(
            full_name="Inventory Customer",
            phone="09120000000",
        )

        self.client.force_authenticate(user=self.store_user)

    def test_store_manager_can_create_and_list_warehouse(self):
        response = self.client.post(
            "/api/warehouses/",
            {
                "name": "Warehouse D",
                "location": "Tabriz",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)

        self.assertTrue(
            Warehouse.objects.filter(
                name="Warehouse D",
                location="Tabriz",
            ).exists()
        )

        list_response = self.client.get(
            "/api/warehouses/"
        )

        self.assertEqual(
            list_response.status_code,
            200,
        )

        names = {
            row["name"]
            for row in list_response.data
        }

        self.assertIn(
            "Warehouse A",
            names,
        )
        self.assertIn(
            "Warehouse B",
            names,
        )
        self.assertIn(
            "Warehouse D",
            names,
        )

    def test_inventory_api_returns_per_warehouse_stock(self):
        response = self.client.get(
            "/api/inventory/"
        )

        self.assertEqual(
            response.status_code,
            200,
        )

        row_a = next(
            row
            for row in response.data
            if (
                row["product"]
                == self.product.id
                and row["warehouse"]
                == self.warehouse_a.id
            )
        )

        self.assertEqual(
            row_a["product_name"],
            self.product.name,
        )
        self.assertEqual(
            row_a["warehouse_name"],
            self.warehouse_a.name,
        )
        self.assertEqual(
            row_a["qty_on_hand"],
            10,
        )
        self.assertEqual(
            row_a["qty_reserved"],
            2,
        )
        self.assertEqual(
            row_a["qty_available"],
            8,
        )

    def test_transfer_updates_both_warehouses_and_creates_movements(self):
        response = self.client.post(
            "/api/stock-transfers/",
            {
                "product": self.product.id,
                "source_warehouse": self.warehouse_a.id,
                "destination_warehouse": self.warehouse_b.id,
                "quantity": 3,
                "notes": "Internal transfer",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        self.inventory_a.refresh_from_db()
        self.inventory_b.refresh_from_db()

        self.assertEqual(
            self.inventory_a.qty_on_hand,
            7,
        )
        self.assertEqual(
            self.inventory_a.qty_reserved,
            2,
        )
        self.assertEqual(
            self.inventory_a.qty_available,
            5,
        )

        self.assertEqual(
            self.inventory_b.qty_on_hand,
            7,
        )
        self.assertEqual(
            self.inventory_b.qty_available,
            7,
        )

        transfer = StockTransfer.objects.get(
            pk=response.data["id"]
        )

        outgoing = StockMovement.objects.get(
            movement_type="TRANSFER_OUT",
            reference_type="STOCK_TRANSFER",
            reference_id=transfer.id,
        )

        incoming = StockMovement.objects.get(
            movement_type="TRANSFER_IN",
            reference_type="STOCK_TRANSFER",
            reference_id=transfer.id,
        )

        self.assertEqual(
            outgoing.warehouse,
            self.warehouse_a,
        )
        self.assertEqual(
            outgoing.quantity,
            -3,
        )
        self.assertEqual(
            incoming.warehouse,
            self.warehouse_b,
        )
        self.assertEqual(
            incoming.quantity,
            3,
        )

        total_on_hand = (
            self.inventory_a.qty_on_hand
            + self.inventory_b.qty_on_hand
        )

        self.assertEqual(
            total_on_hand,
            14,
        )

    def test_transfer_recalculates_destination_weighted_cost(self):
        response = self.client.post(
            "/api/stock-transfers/",
            {
                "product": self.product.id,
                "source_warehouse": self.warehouse_a.id,
                "destination_warehouse": self.warehouse_b.id,
                "quantity": 3,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        self.inventory_a.refresh_from_db()
        self.inventory_b.refresh_from_db()

        self.assertEqual(
            self.inventory_a.avg_cost_cad,
            Decimal("100.00"),
        )
        self.assertEqual(
            self.inventory_b.avg_cost_cad,
            Decimal("157.14"),
        )

    def test_transfer_creates_destination_inventory_when_missing(self):
        self.assertFalse(
            Inventory.objects.filter(
                product=self.product,
                warehouse=self.warehouse_c,
            ).exists()
        )

        response = self.client.post(
            "/api/stock-transfers/",
            {
                "product": self.product.id,
                "source_warehouse": self.warehouse_a.id,
                "destination_warehouse": self.warehouse_c.id,
                "quantity": 2,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        destination = Inventory.objects.get(
            product=self.product,
            warehouse=self.warehouse_c,
        )

        self.assertEqual(
            destination.qty_on_hand,
            2,
        )
        self.assertEqual(
            destination.qty_reserved,
            0,
        )
        self.assertEqual(
            destination.qty_available,
            2,
        )
        self.assertEqual(
            destination.avg_cost_cad,
            Decimal("100.00"),
        )

    def test_transfer_rejects_insufficient_available_stock(self):
        response = self.client.post(
            "/api/stock-transfers/",
            {
                "product": self.product.id,
                "source_warehouse": self.warehouse_a.id,
                "destination_warehouse": self.warehouse_b.id,
                "quantity": 9,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

        self.inventory_a.refresh_from_db()
        self.inventory_b.refresh_from_db()

        self.assertEqual(
            self.inventory_a.qty_on_hand,
            10,
        )
        self.assertEqual(
            self.inventory_b.qty_on_hand,
            4,
        )
        self.assertEqual(
            StockTransfer.objects.count(),
            0,
        )

    def test_transfer_rejects_same_source_and_destination(self):
        response = self.client.post(
            "/api/stock-transfers/",
            {
                "product": self.product.id,
                "source_warehouse": self.warehouse_a.id,
                "destination_warehouse": self.warehouse_a.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

        self.assertEqual(
            StockTransfer.objects.count(),
            0,
        )

    def test_sale_decreases_only_selected_warehouse(self):
        response = self.client.post(
            "/api/sales/sales/",
            {
                "customer": self.customer.id,
                "sale_date": "2026-09-01",
                "items": [
                    {
                        "product": self.product.id,
                        "warehouse": self.warehouse_b.id,
                        "quantity": 2,
                        "unit_price_irr": "1000.00",
                    }
                ],
                "paid_amount": "0.00",
                "payment_account": None,
                "payment_method": "CASH",
                "notes": "Warehouse-specific sale",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        self.inventory_a.refresh_from_db()
        self.inventory_b.refresh_from_db()

        self.assertEqual(
            self.inventory_a.qty_on_hand,
            10,
        )
        self.assertEqual(
            self.inventory_b.qty_on_hand,
            2,
        )

        sale = Sale.objects.get(
            pk=response.data["id"]
        )
        item = SaleItem.objects.get(
            sale=sale
        )

        self.assertEqual(
            item.warehouse,
            self.warehouse_b,
        )

        movement = StockMovement.objects.get(
            movement_type="SALE",
            reference_type="SALE",
            reference_id=sale.id,
        )

        self.assertEqual(
            movement.warehouse,
            self.warehouse_b,
        )
        self.assertEqual(
            movement.quantity,
            -2,
        )

    def test_sales_manager_can_read_inventory_but_cannot_transfer(self):
        self.client.force_authenticate(
            user=self.sales_user
        )

        inventory_response = self.client.get(
            "/api/inventory/"
        )

        self.assertEqual(
            inventory_response.status_code,
            200,
        )

        transfer_response = self.client.post(
            "/api/stock-transfers/",
            {
                "product": self.product.id,
                "source_warehouse": self.warehouse_a.id,
                "destination_warehouse": self.warehouse_b.id,
                "quantity": 1,
            },
            format="json",
        )

        self.assertEqual(
            transfer_response.status_code,
            403,
        )