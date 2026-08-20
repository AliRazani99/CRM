from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Purchase(models.Model):
    purchase_number = models.CharField(
        max_length=50,
    )

    supplier = models.ForeignKey(
        "parties.Supplier",
        on_delete=models.PROTECT,
        related_name="purchases",
    )

    warehouse = models.ForeignKey(
        "parties.Warehouse",
        on_delete=models.PROTECT,
        related_name="purchases",
    )

    purchase_date = models.DateField(
        default=timezone.localdate,
    )

    purchase_currency = models.CharField(
        max_length=3,
    )

    exchange_rate_to_cad = models.DecimalField(
        max_digits=20,
        decimal_places=8,
    )

    shipping_cost_irr = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
    )

    customs_cost_irr = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
    )

    other_costs_irr = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
    )

    tax_irr = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
    )

    overall_discount_irr = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
    )

    paid_amount = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
    )

    paying_account = models.ForeignKey(
        "parties.FinancialAccount",
        on_delete=models.PROTECT,
        related_name="paid_purchases",
        null=True,
        blank=True,
    )

    notes = models.TextField(
        blank=True,
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="purchases_created",
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return self.purchase_number

    class Meta:
        db_table = "purchases"

        constraints = [
            models.CheckConstraint(
                check=Q(exchange_rate_to_cad__gt=0),
                name="purchase_exchange_rate_gt_zero",
            ),

            models.CheckConstraint(
                check=Q(shipping_cost_irr__gte=0),
                name="purchase_shipping_cost_gte_zero",
            ),

            models.CheckConstraint(
                check=Q(customs_cost_irr__gte=0),
                name="purchase_customs_cost_gte_zero",
            ),

            models.CheckConstraint(
                check=Q(other_costs_irr__gte=0),
                name="purchase_other_costs_gte_zero",
            ),

            models.CheckConstraint(
                check=Q(tax_irr__gte=0),
                name="purchase_tax_gte_zero",
            ),

            models.CheckConstraint(
                check=Q(overall_discount_irr__gte=0),
                name="purchase_discount_gte_zero",
            ),

            models.CheckConstraint(
                check=Q(paid_amount__gte=0),
                name="purchase_paid_amount_gte_zero",
            ),
        ]


class PurchaseItem(models.Model):
    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.CASCADE,
        related_name="items",
    )

    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="purchase_items",
    )

    quantity = models.PositiveIntegerField()

    unit_cost = models.DecimalField(
        max_digits=20,
        decimal_places=2,
    )

    row_discount = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
    )

    landed_cost_per_unit = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
    )

    line_total = models.DecimalField(
        max_digits=20,
        decimal_places=2,
    )

    def __str__(self):
        return (
            f"{self.purchase.purchase_number} - "
            f"{self.product} × {self.quantity}"
        )

    class Meta:
        db_table = "purchase_items"

        constraints = [
            models.CheckConstraint(
                check=Q(quantity__gt=0),
                name="purchase_item_quantity_gt_zero",
            ),

            models.CheckConstraint(
                check=Q(unit_cost__gte=0),
                name="purchase_item_unit_cost_gte_zero",
            ),

            models.CheckConstraint(
                check=Q(row_discount__gte=0),
                name="purchase_item_discount_gte_zero",
            ),

            models.CheckConstraint(
                check=Q(landed_cost_per_unit__gte=0),
                name="purchase_item_landed_cost_gte_zero",
            ),

            models.CheckConstraint(
                check=Q(line_total__gte=0),
                name="purchase_item_line_total_gte_zero",
            ),
        ]
class PurchasePayment(models.Model):
    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.PROTECT,
        related_name="payments",
    )

    account = models.ForeignKey(
        "parties.FinancialAccount",
        on_delete=models.PROTECT,
        related_name="purchase_payments",
    )

    payment_date = models.DateField(
        default=timezone.localdate,
    )

    amount = models.DecimalField(
        max_digits=20,
        decimal_places=2,
    )

    currency_code = models.CharField(
        max_length=3,
    )

    payment_type = models.CharField(
        max_length=50,
    )

    notes = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return (
            f"{self.purchase.purchase_number} - "
            f"{self.amount} {self.currency_code}"
        )

    class Meta:
        db_table = "purchase_payments"

        constraints = [
            models.CheckConstraint(
                check=Q(amount__gt=0),
                name="purchase_payment_amount_gt_zero",
            ),
        ]