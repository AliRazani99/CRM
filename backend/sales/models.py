from django.db import models
from django.conf import settings
from django.db.models import F, Q

class Sale(models.Model):
    class SettlementStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PARTIAL = "PARTIAL", "Partially Paid"
        PAID = "PAID", "Paid"

    customer = models.ForeignKey(
        "parties.Customer",
        on_delete=models.PROTECT,
        related_name="sales",
    )

    invoice_number = models.CharField(
        max_length=100,
        unique=True,
    )

    sale_date = models.DateField()

    total_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
    )

    total_paid = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
    )

    total_debt = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
    )

    settlement_status = models.CharField(
        max_length=20,
        choices=SettlementStatus.choices,
        default=SettlementStatus.PENDING,
    )

    notes = models.TextField(
        blank=True,
        null=True,
    )

    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_sales",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return f"Sale {self.invoice_number}"

    class Meta:
        db_table = "sales"

        constraints = [
            models.CheckConstraint(
                check=Q(total_amount__gte=0),
                name="sale_total_amount_gte_zero",
            ),
            models.CheckConstraint(
                check=Q(total_paid__gte=0),
                name="sale_total_paid_gte_zero",
            ),
            models.CheckConstraint(
                check=Q(total_debt__gte=0),
                name="sale_total_debt_gte_zero",
            ),
            models.CheckConstraint(
                check=Q(total_paid__lte=F("total_amount")),
                name="sale_paid_lte_total",
            ),
        ]

class SaleItem(models.Model):
    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="items",
    )

    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="sale_items",
    )

    quantity = models.PositiveIntegerField()

    unit_price_irr = models.DecimalField(
        max_digits=18,
        decimal_places=2,
    )

    line_total_irr = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
    )

    def save(self, *args, **kwargs):
        self.line_total_irr = self.unit_price_irr * self.quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.sale.invoice_number} "
            f"- Product {self.product_id}"
        )

    class Meta:
        db_table = "sale_items"

        constraints = [
            models.CheckConstraint(
                check=Q(quantity__gt=0),
                name="sale_item_quantity_gt_zero",
            ),
            models.CheckConstraint(
                check=Q(unit_price_irr__gte=0),
                name="sale_item_price_gte_zero",
            ),
            models.CheckConstraint(
                check=Q(line_total_irr__gte=0),
                name="sale_item_total_gte_zero",
            ),
        ]


class Payment(models.Model):
    sale = models.ForeignKey(
        Sale,
        on_delete=models.PROTECT,
        related_name="payments",
    )

    account = models.ForeignKey(
        "parties.FinancialAccount",
        on_delete=models.PROTECT,
        related_name="sale_payments",
    )

    payment_date = models.DateField()

    amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
    )

    currency_code = models.CharField(
        max_length=3,
    )

    payment_method = models.CharField(
        max_length=50,
    )

    notes = models.TextField(
        blank=True,
        null=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return (
            f"Payment {self.id} for Sale {self.sale_id} "
            f"- {self.amount} {self.currency_code}"
        )

    class Meta:
        db_table = "payments"

        constraints = [
            models.CheckConstraint(
                check=Q(amount__gt=0),
                name="payment_amount_gt_zero",
            ),
        ]

class CustomerReceivable(models.Model):
    class ReceivableStatus(models.TextChoices):
        UNPAID = "UNPAID", "Unpaid"
        PARTIAL = "PARTIAL", "Partially Paid"
        PAID = "PAID", "Paid"

    customer = models.ForeignKey(
        "parties.Customer",
        on_delete=models.PROTECT,
        related_name="receivables",
    )

    sale = models.OneToOneField(
        Sale,
        on_delete=models.CASCADE,
        related_name="receivable",
    )

    original_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
    )

    paid_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
    )

    remaining_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
    )

    status = models.CharField(
        max_length=20,
        choices=ReceivableStatus.choices,
        default=ReceivableStatus.UNPAID,
    )

    due_date = models.DateField(
        blank=True,
        null=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return (
            f"Receivable for Sale {self.sale.invoice_number} "
            f"- Remaining: {self.remaining_amount}"
        )

    class Meta:
        db_table = "customer_receivables"

        constraints = [
            models.CheckConstraint(
                check=Q(original_amount__gte=0),
                name="receivable_original_gte_zero",
            ),
            models.CheckConstraint(
                check=Q(paid_amount__gte=0),
                name="receivable_paid_gte_zero",
            ),
            models.CheckConstraint(
                check=Q(remaining_amount__gte=0),
                name="receivable_remaining_gte_zero",
            ),
            models.CheckConstraint(
                check=Q(paid_amount__lte=F("original_amount")),
                name="receivable_paid_lte_original",
            ),
        ]
