from django.db.models import Sum
def test_customer_end_to_end_flow(self):
    """
    Customer full lifecycle test:

    1- Create customer
    2- Create sale
    3- Verify debt
    4- Register partial payment
    5- Verify remaining debt
    6- Register full payment
    7- Verify customer is settled
    """

    from decimal import Decimal
    from datetime import date

    from parties.models import FinancialAccount
    from .models import (
        Sale,
        SaleItem,
        CustomerReceivable,
        Payment,
    )

    from .services import (
        recalculate_sale,
        register_payment,
    )


    # ---------------------------------
    # 1) Create Customer
    # ---------------------------------

    customer = Customer.objects.create(
        full_name="Test Customer",
        phone="09120000000",
        instagram_handle="test_customer",
        postal_code="1234567890",
        address="Test Address",
    )


    self.assertEqual(
        customer.full_name,
        "Test Customer",
    )


    # ---------------------------------
    # 2) Create Financial Account
    # ---------------------------------

    account = FinancialAccount.objects.create(
        name="Test Cash Account",
        account_type="CASH",
        currency_code="IRR",
        current_balance=Decimal("0.00"),
        is_active=True,
    )


    # ---------------------------------
    # 3) Create Sale
    # ---------------------------------

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


    # ---------------------------------
    # 4) Check Initial Debt
    # ---------------------------------

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


    receivable = (
        CustomerReceivable.objects.get(
            sale=sale
        )
    )


    self.assertEqual(
        receivable.remaining_amount,
        Decimal("300.00"),
    )


    # ---------------------------------
    # 5) Partial Payment
    # ---------------------------------

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


    # ---------------------------------
    # 6) Full Payment
    # ---------------------------------

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


    # ---------------------------------
    # 7) Verify Customer Receivable
    # ---------------------------------

    receivable.refresh_from_db()


    self.assertEqual(
        receivable.remaining_amount,
        Decimal("0.00"),
    )


    self.assertEqual(
        receivable.status,
        CustomerReceivable.ReceivableStatus.PAID,
    )


    # ---------------------------------
    # 8) Verify Payments
    # ---------------------------------

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


    # ---------------------------------
    # 9) Verify Financial Account
    # ---------------------------------

    account.refresh_from_db()


    self.assertEqual(
        account.current_balance,
        Decimal("300.00"),
    )