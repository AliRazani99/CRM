from django.db import models
from django.conf import settings


class Sale(models.Model):
    customer = models.ForeignKey(
        'parties.Customer',
        on_delete=models.PROTECT,
        related_name="sales",
    )
    invoice_number = models.CharField(max_length=100, unique=True)
    sale_date = models.DateField()
    total_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0.00,
    )
    total_paid = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0.00,
    )
    total_debt = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0.00,
    )
    settlement_status = models.CharField(
        max_length=50,
        default="PENDING",
    )
    notes = models.TextField(blank=True, null=True)
    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_sales",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Sale {self.invoice_number}"

    class Meta:
        db_table = "sales"

class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey('products.Product', on_delete=models.PROTECT, related_name="sale_items")
    quantity = models.PositiveIntegerField()
    unit_price_irr = models.DecimalField(max_digits=18, decimal_places=2)
    line_total_irr = models.DecimalField(max_digits=18, decimal_places=2)

    def __str__(self):
        return f"{self.sale.invoice_number} - Product {self.product_id}"
    class Meta:
        db_table = "sale_items"


class Payment(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="payments")
    account = models.ForeignKey('parties.FinancialAccount', on_delete=models.PROTECT, related_name="sale_payments")
    payment_date = models.DateField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency_code = models.CharField(max_length=10)
    payment_method = models.CharField(max_length=50)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Payment {self.id} for Sale {self.sale_id} - {self.amount} {self.currency_code}"
    class Meta:
        db_table = "payments"

class CustomerReceivable(models.Model):
    customer = models.ForeignKey('parties.Customer', on_delete=models.PROTECT, related_name="receivables")
    sale = models.OneToOneField(Sale, on_delete=models.CASCADE, related_name="receivable")
    original_amount = models.DecimalField(max_digits=18, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0.00)
    remaining_amount = models.DecimalField(max_digits=18, decimal_places=2)
    status = models.CharField(max_length=50, default="UNPAID")
    due_date = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Receivable for Sale {self.sale.invoice_number} - Remaining: {self.remaining_amount}"
    class Meta:
        db_table = "customer_receivables"
