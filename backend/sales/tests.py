from datetime import date
from decimal import Decimal
from accounts.models import Role
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework.test import APITestCase

from finance.models import AccountTransaction
from parties.models import Customer, FinancialAccount
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
        recalculate_sale(self.sale.pk)

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
        payment = register_payment(
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

        transaction_row = AccountTransaction.objects.get(
            reference_type="SALES",
            reference_id=payment.pk,
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
        with self.assertRaises(ValidationError):
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

        with self.assertRaises(ValidationError):
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
        with self.assertRaises(IntegrityError):
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