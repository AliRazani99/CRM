from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import Role
from finance.models import AccountTransaction
from inventory.models import Inventory, StockMovement
from parties.models import (
    FinancialAccount,
    Supplier,
    Warehouse,
)
from products.models import (
    Brand,
    Category,
    Product,
)

from .models import (
    Purchase,
    PurchaseItem,
    PurchasePayment,
)


class ProcurementFlowTests(APITestCase):

    def setUp(self):
        User = get_user_model()

        purchase_role, _ = (
            Role.objects.get_or_create(
                code=Role.Code.PURCHASE_MANAGER,
                defaults={
                    "name": "مدیر خرید",
                },
            )
        )

        sales_role, _ = (
            Role.objects.get_or_create(
                code=Role.Code.SALES_MANAGER,
                defaults={
                    "name": "مدیر فروش",
                },
            )
        )

        self.purchase_user = (
            User.objects.create_user(
                username="purchase_manager",
                email="purchase@example.com",
                password="test-password-123",
                role=purchase_role,
            )
        )

        self.sales_user = (
            User.objects.create_user(
                username="sales_manager_proc_test",
                email="sales-proc@example.com",
                password="test-password-123",
                role=sales_role,
            )
        )

        self.supplier = Supplier.objects.create(
            name="Test Supplier",
            country="Canada",
            is_active=True,
        )

        self.warehouse_a = (
            Warehouse.objects.create(
                name="Warehouse A",
                location="Tehran",
            )
        )

        self.warehouse_b = (
            Warehouse.objects.create(
                name="Warehouse B",
                location="Karaj",
            )
        )

        category = Category.objects.create(
            name="Phones",
        )

        brand = Brand.objects.create(
            name="Test Brand",
        )

        self.product = Product.objects.create(
            category=category,
            brand=brand,
            name="Test Product",
            sku="PROC-TEST-001",
            sales_price_irr=Decimal(
                "500000.00"
            ),
            default_cost_cad=Decimal(
                "30.00"
            ),
            reorder_level=2,
        )

        self.inventory_a = (
            Inventory.objects.create(
                product=self.product,
                warehouse=self.warehouse_a,
                qty_on_hand=8,
                qty_reserved=0,
                avg_cost_cad=Decimal(
                    "25.00"
                ),
            )
        )

        self.inventory_b = (
            Inventory.objects.create(
                product=self.product,
                warehouse=self.warehouse_b,
                qty_on_hand=5,
                qty_reserved=0,
                avg_cost_cad=Decimal(
                    "30.00"
                ),
            )
        )

        self.cad_account = (
            FinancialAccount.objects.create(
                name="CAD Bank",
                account_type="BANK",
                currency_code="CAD",
                current_balance=Decimal(
                    "1000.00"
                ),
                is_active=True,
            )
        )

        self.irr_account = (
            FinancialAccount.objects.create(
                name="IRR Cash",
                account_type="CASH",
                currency_code="IRR",
                current_balance=Decimal(
                    "500000.00"
                ),
                is_active=True,
            )
        )

        self.client.force_authenticate(
            user=self.purchase_user,
        )

    def purchase_payload(
        self,
        *,
        warehouse=None,
        quantity=5,
        unit_cost="10.00",
        shipping_irr="100000.00",
        discount_irr="0.00",
        cad_account=None,
        irr_account=None,
    ):
        warehouse = (
            warehouse
            or self.warehouse_b
        )

        cad_account = (
            cad_account
            or self.cad_account
        )

        if irr_account is None:
            irr_account = (
                self.irr_account
            )

        return {
            "supplier":
                self.supplier.id,

            "warehouse":
                warehouse.id,

            "purchase_date":
                "2026-09-01",

            "items": [
                {
                    "product":
                        self.product.id,
                    "quantity":
                        quantity,
                    "unit_cost_cad":
                        unit_cost,
                }
            ],

            "irr_per_cad":
                "10000.00",

            "shipping_cost_irr":
                shipping_irr,

            "customs_cost_irr":
                "0.00",

            "other_costs_irr":
                "0.00",

            "tax_irr":
                "0.00",

            "overall_discount_irr":
                discount_irr,

            "purchase_account":
                cad_account.id,

            "cost_account":
                (
                    irr_account.id
                    if Decimal(
                        shipping_irr
                    ) > Decimal(
                        discount_irr
                    )
                    else None
                ),

            "notes":
                "Procurement E2E test",
        }

    def test_create_purchase_receives_stock_and_updates_finance(
        self,
    ):
        response = self.client.post(
            "/api/procurement/purchases/",
            self.purchase_payload(),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        purchase = Purchase.objects.get(
            pk=response.data["id"],
        )

        self.assertTrue(
            purchase.purchase_number.startswith(
                "PUR-"
            )
        )

        self.assertEqual(
            purchase.supplier,
            self.supplier,
        )

        self.assertEqual(
            purchase.warehouse,
            self.warehouse_b,
        )

        self.assertEqual(
            purchase.irr_per_cad,
            Decimal("10000.00"),
        )

        item = PurchaseItem.objects.get(
            purchase=purchase,
        )

        # Base:
        # 5 × 10 CAD = 50 CAD
        #
        # Landing:
        # 100000 IRR / 10000 = 10 CAD
        #
        # Total landed = 60 CAD
        # Per unit = 12 CAD
        self.assertEqual(
            item.line_total,
            Decimal("50.00"),
        )

        self.assertEqual(
            item.landed_cost_per_unit,
            Decimal("12.00"),
        )

        self.inventory_b.refresh_from_db()

        self.assertEqual(
            self.inventory_b.qty_on_hand,
            10,
        )

        self.assertEqual(
            self.inventory_b.qty_available,
            10,
        )

        # Previous:
        # 5 × 30 = 150
        #
        # Incoming:
        # 5 × 12 = 60
        #
        # New average:
        # 210 / 10 = 21
        self.assertEqual(
            self.inventory_b.avg_cost_cad,
            Decimal("21.00"),
        )

        movement = StockMovement.objects.get(
            movement_type="PURCHASE_RECEIPT",
            reference_type="PURCHASE",
            reference_id=purchase.id,
        )

        self.assertEqual(
            movement.warehouse,
            self.warehouse_b,
        )

        self.assertEqual(
            movement.quantity,
            5,
        )

        self.cad_account.refresh_from_db()
        self.irr_account.refresh_from_db()

        self.assertEqual(
            self.cad_account.current_balance,
            Decimal("950.00"),
        )

        self.assertEqual(
            self.irr_account.current_balance,
            Decimal("400000.00"),
        )

        self.assertEqual(
            PurchasePayment.objects.filter(
                purchase=purchase,
            ).count(),
            2,
        )

        self.assertEqual(
            AccountTransaction.objects.filter(
                reference_type="PROCUREMENT",
                reference_id=purchase.id,
                direction="OUT",
            ).count(),
            2,
        )

    def test_receipt_changes_only_selected_warehouse(
        self,
    ):
        response = self.client.post(
            "/api/procurement/purchases/",
            self.purchase_payload(
                warehouse=self.warehouse_b,
            ),
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
            8,
        )

        self.assertEqual(
            self.inventory_b.qty_on_hand,
            10,
        )

    def test_receipt_creates_inventory_when_missing(
        self,
    ):
        warehouse_c = (
            Warehouse.objects.create(
                name="Warehouse C",
                location="Shiraz",
            )
        )

        self.assertFalse(
            Inventory.objects.filter(
                product=self.product,
                warehouse=warehouse_c,
            ).exists()
        )

        response = self.client.post(
            "/api/procurement/purchases/",
            self.purchase_payload(
                warehouse=warehouse_c,
                quantity=2,
                unit_cost="15.00",
                shipping_irr="0.00",
                irr_account=None,
            ),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        inventory = Inventory.objects.get(
            product=self.product,
            warehouse=warehouse_c,
        )

        self.assertEqual(
            inventory.qty_on_hand,
            2,
        )

        self.assertEqual(
            inventory.qty_available,
            2,
        )

        self.assertEqual(
            inventory.avg_cost_cad,
            Decimal("15.00"),
        )

    def test_insufficient_cad_balance_rolls_back_everything(
        self,
    ):
        poor_cad = (
            FinancialAccount.objects.create(
                name="Poor CAD",
                account_type="BANK",
                currency_code="CAD",
                current_balance=Decimal(
                    "20.00"
                ),
                is_active=True,
            )
        )

        response = self.client.post(
            "/api/procurement/purchases/",
            self.purchase_payload(
                cad_account=poor_cad,
            ),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

        self.inventory_b.refresh_from_db()
        poor_cad.refresh_from_db()
        self.irr_account.refresh_from_db()

        self.assertEqual(
            self.inventory_b.qty_on_hand,
            5,
        )

        self.assertEqual(
            poor_cad.current_balance,
            Decimal("20.00"),
        )

        self.assertEqual(
            self.irr_account.current_balance,
            Decimal("500000.00"),
        )

        self.assertEqual(
            Purchase.objects.count(),
            0,
        )

        self.assertEqual(
            StockMovement.objects.count(),
            0,
        )

        self.assertEqual(
            AccountTransaction.objects.count(),
            0,
        )

    def test_insufficient_irr_balance_rolls_back_everything(
        self,
    ):
        poor_irr = (
            FinancialAccount.objects.create(
                name="Poor IRR",
                account_type="CASH",
                currency_code="IRR",
                current_balance=Decimal(
                    "100.00"
                ),
                is_active=True,
            )
        )

        response = self.client.post(
            "/api/procurement/purchases/",
            self.purchase_payload(
                irr_account=poor_irr,
            ),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

        self.inventory_b.refresh_from_db()
        self.cad_account.refresh_from_db()
        poor_irr.refresh_from_db()

        self.assertEqual(
            self.inventory_b.qty_on_hand,
            5,
        )

        self.assertEqual(
            self.cad_account.current_balance,
            Decimal("1000.00"),
        )

        self.assertEqual(
            poor_irr.current_balance,
            Decimal("100.00"),
        )

        self.assertEqual(
            Purchase.objects.count(),
            0,
        )

    def test_discount_cannot_exceed_landing_costs(
        self,
    ):
        response = self.client.post(
            "/api/procurement/purchases/",
            self.purchase_payload(
                shipping_irr="100.00",
                discount_irr="200.00",
            ),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

        self.assertEqual(
            Purchase.objects.count(),
            0,
        )

    def test_purchase_list_returns_nested_receipt_data(
        self,
    ):
        create_response = self.client.post(
            "/api/procurement/purchases/",
            self.purchase_payload(),
            format="json",
        )

        self.assertEqual(
            create_response.status_code,
            201,
            create_response.data,
        )

        response = self.client.get(
            "/api/procurement/purchases/",
        )

        self.assertEqual(
            response.status_code,
            200,
        )

        self.assertEqual(
            len(response.data),
            1,
        )

        purchase = response.data[0]

        self.assertEqual(
            purchase["supplier_name"],
            self.supplier.name,
        )

        self.assertEqual(
            purchase["warehouse_name"],
            self.warehouse_b.name,
        )

        self.assertEqual(
            len(purchase["items"]),
            1,
        )

        self.assertEqual(
            len(purchase["payments"]),
            2,
        )

    def test_sales_manager_cannot_create_purchase(
        self,
    ):
        self.client.force_authenticate(
            user=self.sales_user,
        )

        response = self.client.post(
            "/api/procurement/purchases/",
            self.purchase_payload(),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            403,
        )
