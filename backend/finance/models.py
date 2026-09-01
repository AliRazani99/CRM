from django.conf import settings
from django.db import models
from django.db.models import F, Q


class CurrencyExchange(models.Model):
    exchange_partner_name = models.CharField(
        max_length=255,
    )

    exchange_date = models.DateField()

    from_account = models.ForeignKey(
        "parties.FinancialAccount",
        on_delete=models.PROTECT,
        related_name="exchanges_from",
    )

    to_account = models.ForeignKey(
        "parties.FinancialAccount",
        on_delete=models.PROTECT,
        related_name="exchanges_to",
    )

    from_amount = models.DecimalField(
        max_digits=20,
        decimal_places=2,
    )

    from_currency_code = models.CharField(
        max_length=3,
    )

    to_amount = models.DecimalField(
        max_digits=20,
        decimal_places=2,
    )

    to_currency_code = models.CharField(
        max_length=3,
    )

    # Stored as:
    # destination currency units per 1 source currency unit.
    #
    # Example:
    # 72,500,000 IRR -> 100 CAD
    # exchange_rate ~= 0.000001379310
    #
    # 12 decimal places are required for realistic IRR -> CAD rates.
    exchange_rate = models.DecimalField(
        max_digits=24,
        decimal_places=12,
    )

    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="currency_exchanges",
    )

    notes = models.TextField(
        blank=True,
        null=True,
    )

    def __str__(self):
        return (
            f"Exchange {self.id}: "
            f"{self.from_amount} {self.from_currency_code} -> "
            f"{self.to_amount} {self.to_currency_code}"
        )

    class Meta:
        db_table = "currency_exchanges"

        constraints = [
            models.CheckConstraint(
                check=Q(from_amount__gt=0),
                name="exchange_from_amount_gt_zero",
            ),
            models.CheckConstraint(
                check=Q(to_amount__gt=0),
                name="exchange_to_amount_gt_zero",
            ),
            models.CheckConstraint(
                check=Q(exchange_rate__gt=0),
                name="exchange_rate_gt_zero",
            ),
            models.CheckConstraint(
                check=~Q(
                    from_account=F(
                        "to_account"
                    )
                ),
                name="exchange_accounts_different",
            ),
        ]


class AccountTransaction(models.Model):
    DIRECTION_CHOICES = [
        ("IN", "Inflow"),
        ("OUT", "Outflow"),
    ]

    # This pair:
    #
    #     reference_type + reference_id
    #
    # acts as an explicit lightweight polymorphic reference.
    #
    # Contract:
    # SALES              -> Sale.id
    # PROCUREMENT        -> Purchase.id
    # CURRENCY_EXCHANGE  -> CurrencyExchange.id
    # FINANCIAL_ACCOUNT  -> FinancialAccount.id
    #
    # We intentionally do not use GenericForeignKey here.
    # The explicit enum is easier to audit and expose through the API.
    REFERENCE_TYPE_CHOICES = [
        ("PROCUREMENT", "Procurement"),
        ("SALES", "Sales"),
        (
            "CURRENCY_EXCHANGE",
            "Currency Exchange",
        ),
        (
            "FINANCIAL_ACCOUNT",
            "Financial Account",
        ),
    ]

    account = models.ForeignKey(
        "parties.FinancialAccount",
        on_delete=models.PROTECT,
        related_name="transactions",
    )

    transaction_date = models.DateField()

    transaction_type = models.CharField(
        max_length=100,
    )

    direction = models.CharField(
        max_length=10,
        choices=DIRECTION_CHOICES,
    )

    amount = models.DecimalField(
        max_digits=20,
        decimal_places=2,
    )

    currency_code = models.CharField(
        max_length=3,
    )

    reference_type = models.CharField(
        max_length=30,
        choices=REFERENCE_TYPE_CHOICES,
        blank=True,
        null=True,
    )

    reference_id = models.PositiveIntegerField(
        blank=True,
        null=True,
    )

    description = models.TextField(
        blank=True,
        null=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return (
            f"{self.transaction_type} "
            f"({self.direction}) "
            f"- {self.amount} "
            f"{self.currency_code}"
        )

    class Meta:
        db_table = "account_transactions"

        constraints = [
            models.CheckConstraint(
                check=Q(amount__gt=0),
                name="account_transaction_amount_gt_zero",
            ),
        ]
