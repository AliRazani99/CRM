from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from rest_framework.test import APITestCase

from accounts.models import Role
from finance.models import AccountTransaction
from inventory.models import Inventory, StockMovement
from parties.models import Customer, FinancialAccount, Warehouse
from products.models import Brand, Category, Product

from .models import (
    CustomerReceivable,
    Payment,
    Sale,
    SaleItem,
)
from .services import (
    recalculate_sale,
    register_payment,
)


class SalesTests(APITestCase):
    def setUp(self):
        User = get_user_model()

        sales_role, _ = Role.objects.get_or_create(
            code=Role.Code.SALES_MANAGER,
            defaults={
                "name": "مدیر فروش",
                "description": "مدیریت فروش و مشتریان",
            },
        )

        self.user = User.objects.create_user(
            username="sales_tester",
            email="sales_tester@example.com",
            password="test-password-123",
            role=sales_role,
        )

        self.customer = Customer.objects.create(
            full_name="Test Customer",
        )

        self.category = Category.objects.create(
            name="Test Category",
        )

        self.brand = Brand.objects.create(
            name="Test Brand",
        )

        self.product = Product.objects.create(
            category=self.category,
            brand=self.brand,
            name="Test Product",
            sku="TEST-SKU-001",
            sales_price_irr=Decimal("100.00"),
            default_cost_cad=Decimal("10.00"),
        )

        self.account = FinancialAccount.objects.create(
            name="IRR Cash",
            account_type="CASH",
            currency_code="IRR",
            current_balance=Decimal("1000.00"),
            is_active=True,
        )

        self.sale = Sale.objects.create(
            customer=self.customer,
            invoice_number="INV-TEST-001",
            sale_date=date(2026, 8, 20),
            created_by_user=self.user,
        )

        self.item = SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=2,
            unit_price_irr=Decimal("100.00"),
        )

    def test_sale_item_calculates_line_total(self):
        self.item.refresh_from_db()

        self.assertEqual(
            self.item.line_total_irr,
            Decimal("200.00"),
        )

    def test_recalculate_sale_updates_totals_and_receivable(self):
        recalculate_sale(
            self.sale.pk
        )

        self.sale.refresh_from_db()

        self.assertEqual(
            self.sale.total_amount,
            Decimal("200.00"),
        )

        self.assertEqual(
            self.sale.total_paid,
            Decimal("0.00"),
        )

        self.assertEqual(
            self.sale.total_debt,
            Decimal("200.00"),
        )

        self.assertEqual(
            self.sale.settlement_status,
            Sale.SettlementStatus.PENDING,
        )

        receivable = CustomerReceivable.objects.get(
            sale=self.sale,
        )

        self.assertEqual(
            receivable.original_amount,
            Decimal("200.00"),
        )

        self.assertEqual(
            receivable.paid_amount,
            Decimal("0.00"),
        )

        self.assertEqual(
            receivable.remaining_amount,
            Decimal("200.00"),
        )

        self.assertEqual(
            receivable.status,
            CustomerReceivable.ReceivableStatus.UNPAID,
        )

    def test_register_payment_updates_account_ledger_and_sale(self):
        register_payment(
            sale=self.sale,
            account=self.account,
            payment_date=date(2026, 8, 20),
            amount=Decimal("50.00"),
            currency_code="IRR",
            payment_method="CASH",
            notes="Test payment",
        )

        self.account.refresh_from_db()
        self.sale.refresh_from_db()

        self.assertEqual(
            self.account.current_balance,
            Decimal("1050.00"),
        )

        self.assertEqual(
            self.sale.total_amount,
            Decimal("200.00"),
        )

        self.assertEqual(
            self.sale.total_paid,
            Decimal("50.00"),
        )

        self.assertEqual(
            self.sale.total_debt,
            Decimal("150.00"),
        )

        self.assertEqual(
            self.sale.settlement_status,
            Sale.SettlementStatus.PARTIAL,
        )

        receivable = CustomerReceivable.objects.get(
            sale=self.sale,
        )

        self.assertEqual(
            receivable.remaining_amount,
            Decimal("150.00"),
        )

        self.assertEqual(
            receivable.status,
            CustomerReceivable.ReceivableStatus.PARTIAL,
        )

        # Polymorphic ledger contract:
        # SALES -> Sale.id
        transaction_row = AccountTransaction.objects.get(
            reference_type="SALES",
            reference_id=self.sale.pk,
        )

        self.assertEqual(
            transaction_row.account,
            self.account,
        )

        self.assertEqual(
            transaction_row.direction,
            "IN",
        )

        self.assertEqual(
            transaction_row.amount,
            Decimal("50.00"),
        )

        self.assertEqual(
            transaction_row.currency_code,
            "IRR",
        )

    def test_full_payment_marks_sale_as_paid(self):
        register_payment(
            sale=self.sale,
            account=self.account,
            payment_date=date(2026, 8, 20),
            amount=Decimal("200.00"),
            currency_code="IRR",
            payment_method="CASH",
        )

        self.sale.refresh_from_db()

        self.assertEqual(
            self.sale.total_paid,
            Decimal("200.00"),
        )

        self.assertEqual(
            self.sale.total_debt,
            Decimal("0.00"),
        )

        self.assertEqual(
            self.sale.settlement_status,
            Sale.SettlementStatus.PAID,
        )

        receivable = CustomerReceivable.objects.get(
            sale=self.sale,
        )

        self.assertEqual(
            receivable.remaining_amount,
            Decimal("0.00"),
        )

        self.assertEqual(
            receivable.status,
            CustomerReceivable.ReceivableStatus.PAID,
        )

    def test_payment_cannot_exceed_remaining_debt(self):
        with self.assertRaises(
            ValidationError
        ):
            register_payment(
                sale=self.sale,
                account=self.account,
                payment_date=date(2026, 8, 20),
                amount=Decimal("250.00"),
                currency_code="IRR",
                payment_method="CASH",
            )

        self.account.refresh_from_db()

        self.assertEqual(
            self.account.current_balance,
            Decimal("1000.00"),
        )

        self.assertEqual(
            Payment.objects.count(),
            0,
        )

        self.assertEqual(
            AccountTransaction.objects.count(),
            0,
        )

    def test_non_irr_sales_payment_is_rejected(self):
        cad_account = FinancialAccount.objects.create(
            name="CAD Cash",
            account_type="CASH",
            currency_code="CAD",
            current_balance=Decimal("100.00"),
            is_active=True,
        )

        with self.assertRaises(
            ValidationError
        ):
            register_payment(
                sale=self.sale,
                account=cad_account,
                payment_date=date(2026, 8, 20),
                amount=Decimal("10.00"),
                currency_code="CAD",
                payment_method="CASH",
            )

        self.assertEqual(
            Payment.objects.count(),
            0,
        )

    def test_zero_payment_is_blocked_by_database(self):
        with self.assertRaises(
            IntegrityError
        ):
            with transaction.atomic():
                Payment.objects.create(
                    sale=self.sale,
                    account=self.account,
                    payment_date=date(2026, 8, 20),
                    amount=Decimal("0.00"),
                    currency_code="IRR",
                    payment_method="CASH",
                )

    def test_receivable_endpoint_is_read_only(self):
        self.client.force_authenticate(
            user=self.user,
        )

        response = self.client.post(
            "/api/sales/receivables/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            405,
        )

    def test_payment_cannot_be_modified_after_creation(self):
        payment = register_payment(
            sale=self.sale,
            account=self.account,
            payment_date=date(2026, 8, 20),
            amount=Decimal("50.00"),
            currency_code="IRR",
            payment_method="CASH",
        )

        self.client.force_authenticate(
            user=self.user,
        )

        response = self.client.patch(
            f"/api/sales/payments/{payment.pk}/",
            {
                "amount": "25.00",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            405,
        )

    def test_customer_end_to_end_flow(self):
        """
        Customer service-level lifecycle:

        1. Create customer
        2. Create sale
        3. Calculate initial debt
        4. Register partial payment
        5. Register final payment
        6. Verify receivable
        7. Verify financial account
        """

        customer = Customer.objects.create(
            full_name="Test Customer",
            phone="09120000000",
            instagram_handle="test_customer",
            postal_code="1234567890",
            address="Test Address",
        )

        account = FinancialAccount.objects.create(
            name="Test Cash Account",
            account_type="CASH",
            currency_code="IRR",
            current_balance=Decimal("0.00"),
            is_active=True,
        )

        sale = Sale.objects.create(
            customer=customer,
            invoice_number="TEST-CUSTOMER-001",
            sale_date=date.today(),
            created_by_user=self.user,
        )

        SaleItem.objects.create(
            sale=sale,
            product=self.product,
            quantity=3,
            unit_price_irr=Decimal("100.00"),
        )

        recalculate_sale(
            sale.pk
        )

        sale.refresh_from_db()

        self.assertEqual(
            sale.total_amount,
            Decimal("300.00"),
        )

        self.assertEqual(
            sale.total_paid,
            Decimal("0.00"),
        )

        self.assertEqual(
            sale.total_debt,
            Decimal("300.00"),
        )

        self.assertEqual(
            sale.settlement_status,
            Sale.SettlementStatus.PENDING,
        )

        receivable = CustomerReceivable.objects.get(
            sale=sale
        )

        self.assertEqual(
            receivable.remaining_amount,
            Decimal("300.00"),
        )

        register_payment(
            sale=sale,
            account=account,
            payment_date=date.today(),
            amount=Decimal("100.00"),
            currency_code="IRR",
            payment_method="CASH",
            notes="Partial payment",
        )

        sale.refresh_from_db()

        self.assertEqual(
            sale.total_paid,
            Decimal("100.00"),
        )

        self.assertEqual(
            sale.total_debt,
            Decimal("200.00"),
        )

        self.assertEqual(
            sale.settlement_status,
            Sale.SettlementStatus.PARTIAL,
        )

        register_payment(
            sale=sale,
            account=account,
            payment_date=date.today(),
            amount=Decimal("200.00"),
            currency_code="IRR",
            payment_method="CASH",
            notes="Final payment",
        )

        sale.refresh_from_db()
        receivable.refresh_from_db()
        account.refresh_from_db()

        self.assertEqual(
            sale.total_paid,
            Decimal("300.00"),
        )

        self.assertEqual(
            sale.total_debt,
            Decimal("0.00"),
        )

        self.assertEqual(
            sale.settlement_status,
            Sale.SettlementStatus.PAID,
        )

        self.assertEqual(
            receivable.remaining_amount,
            Decimal("0.00"),
        )

        self.assertEqual(
            receivable.status,
            CustomerReceivable.ReceivableStatus.PAID,
        )

        payments = Payment.objects.filter(
            sale=sale
        )

        self.assertEqual(
            payments.count(),
            2,
        )

        self.assertEqual(
            payments.aggregate(
                total=Sum("amount")
            )["total"],
            Decimal("300.00"),
        )

        self.assertEqual(
            account.current_balance,
            Decimal("300.00"),
        )

        # Both payment ledger rows must point
        # to the Sale, not to Payment IDs.
        sale_transactions = AccountTransaction.objects.filter(
            reference_type="SALES",
            reference_id=sale.pk,
        )

        self.assertEqual(
            sale_transactions.count(),
            2,
        )

    def test_customer_full_api_end_to_end_flow(self):
        """
        Full API flow used by Frontend:

        1. Create customer
        2. Create inventory
        3. Create sale
        4. Verify COGS snapshot
        5. Verify inventory movement
        6. Verify payment / receivable
        7. Read API data
        8. Settle remaining debt
        9. Verify final account and ledger
        """

        self.client.force_authenticate(
            user=self.user,
        )

        # ---------------------------------
        # 1) Create customer through API
        # ---------------------------------

        customer_response = self.client.post(
            "/api/customers/",
            {
                "full_name": "Test Customer",
                "phone": "09120000000",
                "instagram_handle": "test_customer",
                "postal_code": "1234567890",
                "address": "Test Address",
            },
            format="json",
        )

        self.assertEqual(
            customer_response.status_code,
            201,
            customer_response.data,
        )

        customer_id = customer_response.data[
            "id"
        ]

        customer = Customer.objects.get(
            pk=customer_id
        )

        self.assertEqual(
            customer.full_name,
            "Test Customer",
        )

        self.assertEqual(
            customer.phone,
            "09120000000",
        )

        # ---------------------------------
        # 2) Create warehouse inventory
        # ---------------------------------

        warehouse = Warehouse.objects.create(
            name="Test Warehouse",
            location="Test Location",
        )

        inventory = Inventory.objects.create(
            product=self.product,
            warehouse=warehouse,
            qty_on_hand=10,
            qty_reserved=0,
            avg_cost_cad=Decimal("10.00"),
        )

        inventory.refresh_from_db()

        self.assertEqual(
            inventory.qty_on_hand,
            10,
        )

        self.assertEqual(
            inventory.qty_available,
            10,
        )

        # ---------------------------------
        # 3) Create sale through API
        # ---------------------------------
        #
        # Revenue:
        # 3 × 100 IRR = 300 IRR
        #
        # Historical COGS:
        # 3 × 10 CAD × 10 IRR/CAD
        # = 300 IRR
        #
        # Initial payment:
        # 100 IRR
        #
        # Debt:
        # 200 IRR
        #

        sale_response = self.client.post(
            "/api/sales/sales/",
            {
                "customer": customer_id,
                "sale_date": "2026-09-01",
                "cad_rate_irr_per_cad": "10.00",
                "items": [
                    {
                        "product": self.product.id,
                        "warehouse": warehouse.id,
                        "quantity": 3,
                        "unit_price_irr": "100.00",
                    }
                ],
                "paid_amount": "100.00",
                "payment_account": self.account.id,
                "payment_method": "CASH",
                "notes": "API end-to-end test",
            },
            format="json",
        )

        self.assertEqual(
            sale_response.status_code,
            201,
            sale_response.data,
        )

        sale_id = sale_response.data[
            "id"
        ]

        sale = Sale.objects.get(
            pk=sale_id
        )

        # ---------------------------------
        # 4) Verify sale + COGS snapshot
        # ---------------------------------

        self.assertEqual(
            sale.customer_id,
            customer_id,
        )

        self.assertEqual(
            sale.cad_rate_irr_per_cad,
            Decimal("10.00"),
        )

        self.assertEqual(
            sale.total_amount,
            Decimal("300.00"),
        )

        self.assertEqual(
            sale.total_paid,
            Decimal("100.00"),
        )

        self.assertEqual(
            sale.total_debt,
            Decimal("200.00"),
        )

        self.assertEqual(
            sale.settlement_status,
            Sale.SettlementStatus.PARTIAL,
        )

        self.assertTrue(
            sale.invoice_number.startswith(
                "INV-"
            )
        )

        sale_items = SaleItem.objects.filter(
            sale=sale
        )

        self.assertEqual(
            sale_items.count(),
            1,
        )

        sale_item = sale_items.first()

        self.assertEqual(
            sale_item.product,
            self.product,
        )

        self.assertEqual(
            sale_item.warehouse,
            warehouse,
        )

        self.assertEqual(
            sale_item.quantity,
            3,
        )

        self.assertEqual(
            sale_item.line_total_irr,
            Decimal("300.00"),
        )

        self.assertEqual(
            sale_item.unit_cost_cad_snapshot,
            Decimal("10.00"),
        )

        self.assertEqual(
            sale_item.line_cogs_cad,
            Decimal("30.00"),
        )

        self.assertEqual(
            sale_item.line_cogs_irr,
            Decimal("300.00"),
        )

        # ---------------------------------
        # 5) Verify inventory decrease
        # ---------------------------------

        inventory.refresh_from_db()

        self.assertEqual(
            inventory.qty_on_hand,
            7,
        )

        self.assertEqual(
            inventory.qty_available,
            7,
        )

        movement = StockMovement.objects.get(
            reference_type="SALE",
            reference_id=sale.id,
        )

        self.assertEqual(
            movement.quantity,
            -3,
        )

        self.assertEqual(
            movement.product,
            self.product,
        )

        self.assertEqual(
            movement.warehouse,
            warehouse,
        )

        # ---------------------------------
        # 6) Verify initial payment
        # ---------------------------------

        payments = Payment.objects.filter(
            sale=sale
        )

        self.assertEqual(
            payments.count(),
            1,
        )

        initial_payment = payments.first()

        self.assertEqual(
            initial_payment.amount,
            Decimal("100.00"),
        )

        # ---------------------------------
        # 7) Verify receivable
        # ---------------------------------

        receivable = CustomerReceivable.objects.get(
            sale=sale
        )

        self.assertEqual(
            receivable.customer_id,
            customer_id,
        )

        self.assertEqual(
            receivable.original_amount,
            Decimal("300.00"),
        )

        self.assertEqual(
            receivable.paid_amount,
            Decimal("100.00"),
        )

        self.assertEqual(
            receivable.remaining_amount,
            Decimal("200.00"),
        )

        self.assertEqual(
            receivable.status,
            CustomerReceivable.ReceivableStatus.PARTIAL,
        )

        # ---------------------------------
        # 8) Verify API data used by Frontend
        # ---------------------------------

        customers_response = self.client.get(
            "/api/customers/"
        )

        self.assertEqual(
            customers_response.status_code,
            200,
        )

        sales_response = self.client.get(
            "/api/sales/sales/"
        )

        self.assertEqual(
            sales_response.status_code,
            200,
        )

        api_customer = next(
            row
            for row in customers_response.data
            if row["id"] == customer_id
        )

        self.assertEqual(
            api_customer["full_name"],
            "Test Customer",
        )

        customer_sales = [
            row
            for row in sales_response.data
            if row["customer"] == customer_id
        ]

        self.assertEqual(
            len(customer_sales),
            1,
        )

        total_purchases = sum(
            Decimal(
                row["total_amount"]
            )
            for row in customer_sales
        )

        total_paid = sum(
            Decimal(
                row["total_paid"]
            )
            for row in customer_sales
        )

        total_debt = sum(
            Decimal(
                row["total_debt"]
            )
            for row in customer_sales
        )

        self.assertEqual(
            total_purchases,
            Decimal("300.00"),
        )

        self.assertEqual(
            total_paid,
            Decimal("100.00"),
        )

        self.assertEqual(
            total_debt,
            Decimal("200.00"),
        )

        # Nested API output must expose
        # the historical cost snapshot.
        api_sale = customer_sales[0]
        api_item = api_sale["items"][0]

        self.assertEqual(
            Decimal(
                api_sale[
                    "cad_rate_irr_per_cad"
                ]
            ),
            Decimal("10.00"),
        )

        self.assertEqual(
            Decimal(
                api_item[
                    "unit_cost_cad_snapshot"
                ]
            ),
            Decimal("10.00"),
        )

        self.assertEqual(
            Decimal(
                api_item[
                    "line_cogs_cad"
                ]
            ),
            Decimal("30.00"),
        )

        self.assertEqual(
            Decimal(
                api_item[
                    "line_cogs_irr"
                ]
            ),
            Decimal("300.00"),
        )

        # ---------------------------------
        # 9) Settle remaining customer debt
        # ---------------------------------

        settlement_response = self.client.post(
            "/api/sales/payments/settle-customer/",
            {
                "customer": customer_id,
                "account": self.account.id,
                "payment_date": "2026-09-01",
                "amount": "200.00",
                "payment_method": "CASH",
                "notes": "Final customer settlement",
            },
            format="json",
        )

        self.assertEqual(
            settlement_response.status_code,
            201,
            settlement_response.data,
        )

        sale.refresh_from_db()
        receivable.refresh_from_db()
        self.account.refresh_from_db()

        self.assertEqual(
            sale.total_amount,
            Decimal("300.00"),
        )

        self.assertEqual(
            sale.total_paid,
            Decimal("300.00"),
        )

        self.assertEqual(
            sale.total_debt,
            Decimal("0.00"),
        )

        self.assertEqual(
            sale.settlement_status,
            Sale.SettlementStatus.PAID,
        )

        self.assertEqual(
            receivable.paid_amount,
            Decimal("300.00"),
        )

        self.assertEqual(
            receivable.remaining_amount,
            Decimal("0.00"),
        )

        self.assertEqual(
            receivable.status,
            CustomerReceivable.ReceivableStatus.PAID,
        )

        payments = Payment.objects.filter(
            sale=sale
        )

        self.assertEqual(
            payments.count(),
            2,
        )

        self.assertEqual(
            payments.aggregate(
                total=Sum("amount")
            )["total"],
            Decimal("300.00"),
        )

        # setUp balance = 1000
        # initial payment = 100
        # final settlement = 200
        # expected = 1300
        self.assertEqual(
            self.account.current_balance,
            Decimal("1300.00"),
        )

        # Both financial transactions must
        # point to the business document:
        # SALES -> Sale.id
        transactions = (
            AccountTransaction.objects
            .filter(
                reference_type="SALES",
                reference_id=sale.id,
            )
            .order_by("id")
        )

        self.assertEqual(
            transactions.count(),
            2,
        )

        self.assertEqual(
            transactions.aggregate(
                total=Sum("amount")
            )["total"],
            Decimal("300.00"),
        )

        # ---------------------------------
        # 10) Final Frontend refresh
        # ---------------------------------

        final_sales_response = self.client.get(
            "/api/sales/sales/"
        )

        self.assertEqual(
            final_sales_response.status_code,
            200,
        )

        final_customer_sales = [
            row
            for row in final_sales_response.data
            if row["customer"] == customer_id
        ]

        final_total_purchases = sum(
            Decimal(
                row["total_amount"]
            )
            for row in final_customer_sales
        )

        final_total_paid = sum(
            Decimal(
                row["total_paid"]
            )
            for row in final_customer_sales
        )

        final_total_debt = sum(
            Decimal(
                row["total_debt"]
            )
            for row in final_customer_sales
        )

        self.assertEqual(
            final_total_purchases,
            Decimal("300.00"),
        )

        self.assertEqual(
            final_total_paid,
            Decimal("300.00"),
        )

        self.assertEqual(
            final_total_debt,
            Decimal("0.00"),
        )

    def test_sale_snapshots_inventory_cost(self):
        warehouse = Warehouse.objects.create(
            name="COGS Warehouse",
        )

        Inventory.objects.create(
            product=self.product,
            warehouse=warehouse,
            qty_on_hand=10,
            qty_reserved=0,
            avg_cost_cad=Decimal("25.00"),
        )

        self.client.force_authenticate(
            user=self.user,
        )

        response = self.client.post(
            "/api/sales/sales/",
            {
                "customer": self.customer.id,
                "sale_date": "2026-09-01",
                "cad_rate_irr_per_cad": "700000.00",
                "items": [
                    {
                        "product": self.product.id,
                        "warehouse": warehouse.id,
                        "quantity": 2,
                        "unit_price_irr": "30000000.00",
                    }
                ],
                "paid_amount": "0.00",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        sale = Sale.objects.get(
            pk=response.data["id"]
        )

        item = SaleItem.objects.get(
            sale=sale,
        )

        self.assertEqual(
            sale.cad_rate_irr_per_cad,
            Decimal("700000.00"),
        )

        self.assertEqual(
            item.unit_cost_cad_snapshot,
            Decimal("25.00"),
        )

        self.assertEqual(
            item.line_cogs_cad,
            Decimal("50.00"),
        )

        self.assertEqual(
            item.line_cogs_irr,
            Decimal("35000000.00"),
        )

    def test_historical_cogs_does_not_change_when_inventory_cost_changes(
        self,
    ):
        warehouse = Warehouse.objects.create(
            name="Historical COGS Warehouse",
        )

        inventory = Inventory.objects.create(
            product=self.product,
            warehouse=warehouse,
            qty_on_hand=10,
            qty_reserved=0,
            avg_cost_cad=Decimal("20.00"),
        )

        self.client.force_authenticate(
            user=self.user,
        )

        response = self.client.post(
            "/api/sales/sales/",
            {
                "customer": self.customer.id,
                "sale_date": "2026-09-01",
                "cad_rate_irr_per_cad": "700000.00",
                "items": [
                    {
                        "product": self.product.id,
                        "warehouse": warehouse.id,
                        "quantity": 2,
                        "unit_price_irr": "30000000.00",
                    }
                ],
                "paid_amount": "0.00",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        item = SaleItem.objects.get(
            sale_id=response.data["id"],
        )

        original_unit_cost = (
            item.unit_cost_cad_snapshot
        )
        original_cogs_cad = (
            item.line_cogs_cad
        )
        original_cogs_irr = (
            item.line_cogs_irr
        )

        self.assertEqual(
            original_unit_cost,
            Decimal("20.00"),
        )

        self.assertEqual(
            original_cogs_cad,
            Decimal("40.00"),
        )

        self.assertEqual(
            original_cogs_irr,
            Decimal("28000000.00"),
        )

        # Simulate a later purchase / cost change.
        inventory.refresh_from_db()

        self.assertEqual(
            inventory.qty_on_hand,
            8,
        )

        self.assertEqual(
            inventory.qty_available,
            8,
        )

        # Simulate a later purchase / cost change.
        inventory.avg_cost_cad = Decimal(
            "100.00"
        )

        inventory.save(
            update_fields=[
                "avg_cost_cad",
            ]
        )

        item.refresh_from_db()

        # Historical sale values must remain
        # immutable after inventory cost changes.
        self.assertEqual(
            item.unit_cost_cad_snapshot,
            original_unit_cost,
        )

        self.assertEqual(
            item.line_cogs_cad,
            original_cogs_cad,
        )

        self.assertEqual(
            item.line_cogs_irr,
            original_cogs_irr,
        )