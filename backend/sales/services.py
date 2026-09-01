from decimal import Decimal
from uuid import uuid4
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F, Sum

from finance.models import AccountTransaction
from parties.models import FinancialAccount

from .models import (
    CustomerReceivable,
    Payment,
    Sale,
    SaleItem,
)
from inventory.models import Inventory, StockMovement

@transaction.atomic
def recalculate_sale(sale_id):
    sale = (
        Sale.objects
        .select_for_update()
        .get(pk=sale_id)
    )

    total_amount = (
        sale.items.aggregate(total=Sum("line_total_irr"))["total"]
        or Decimal("0.00")
    )

    # فعلاً Sales بر مبنای IRR است.
    total_paid = (
        sale.payments.aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )

    if total_paid > total_amount:
        raise ValidationError(
            "Total payments cannot exceed sale total."
        )

    total_debt = total_amount - total_paid

    if total_paid == 0:
        settlement_status = Sale.SettlementStatus.PENDING
        receivable_status = (
            CustomerReceivable.ReceivableStatus.UNPAID
        )
    elif total_debt > 0:
        settlement_status = Sale.SettlementStatus.PARTIAL
        receivable_status = (
            CustomerReceivable.ReceivableStatus.PARTIAL
        )
    else:
        settlement_status = Sale.SettlementStatus.PAID
        receivable_status = (
            CustomerReceivable.ReceivableStatus.PAID
        )

    Sale.objects.filter(pk=sale.pk).update(
        total_amount=total_amount,
        total_paid=total_paid,
        total_debt=total_debt,
        settlement_status=settlement_status,
    )

    CustomerReceivable.objects.update_or_create(
        sale=sale,
        defaults={
            "customer": sale.customer,
            "original_amount": total_amount,
            "paid_amount": total_paid,
            "remaining_amount": total_debt,
            "status": receivable_status,
        },
    )

    sale.refresh_from_db()

    return sale


@transaction.atomic
def register_payment(
    *,
    sale,
    account,
    payment_date,
    amount,
    currency_code,
    payment_method,
    notes="",
):
    sale = (
        Sale.objects
        .select_for_update()
        .get(pk=sale.pk)
    )

    account = (
        FinancialAccount.objects
        .select_for_update()
        .get(pk=account.pk)
    )

    if not account.is_active:
        raise ValidationError(
            "Financial account is inactive."
        )

    if currency_code != account.currency_code:
        raise ValidationError(
            "Payment currency must match account currency."
        )

    # چون تمام SaleItemها و totalهای Sale به IRR هستند،
    # تا وقتی نرخ تبدیل روی Payment نداریم،
    # پرداخت فروش هم باید IRR باشد.
    if currency_code != "IRR":
        raise ValidationError(
            "Sales payments must currently be in IRR."
        )

    if amount <= 0:
        raise ValidationError(
            "Payment amount must be greater than zero."
        )

    recalculate_sale(sale.pk)
    sale.refresh_from_db()

    if amount > sale.total_debt:
        raise ValidationError(
            "Payment cannot exceed remaining debt."
        )

    payment = Payment.objects.create(
        sale=sale,
        account=account,
        payment_date=payment_date,
        amount=amount,
        currency_code=currency_code,
        payment_method=payment_method,
        notes=notes,
    )

    FinancialAccount.objects.filter(
        pk=account.pk,
    ).update(
        current_balance=F("current_balance") + amount,
    )

    AccountTransaction.objects.create(
        account=account,
        transaction_date=payment_date,
        transaction_type="SALE_PAYMENT",
        direction="IN",
        amount=amount,
        currency_code=currency_code,
        reference_type="SALES",
        reference_id=sale.id,
        description=(
            f"Payment for sale {sale.invoice_number}"
        ),
    )

    recalculate_sale(sale.pk)

    return payment

@transaction.atomic
def decrease_inventory_for_sale(
    sale_item,
    user,
    cad_rate_irr_per_cad=None,
):
    inventory = (
        Inventory.objects
        .select_for_update()
        .get(
            product=sale_item.product,
            warehouse=sale_item.warehouse,
        )
    )

    if (
        inventory.qty_available
        < sale_item.quantity
    ):
        raise ValidationError(
            "Not enough stock in warehouse."
        )

    unit_cost_cad_snapshot = (
        inventory.avg_cost_cad
    )

    line_cogs_cad = (
        unit_cost_cad_snapshot
        * sale_item.quantity
    )

    line_cogs_irr = None

    if cad_rate_irr_per_cad is not None:
        line_cogs_irr = (
            line_cogs_cad
            * Decimal(
                cad_rate_irr_per_cad
            )
        )

    sale_item.unit_cost_cad_snapshot = (
        unit_cost_cad_snapshot
    )

    sale_item.line_cogs_cad = (
        line_cogs_cad
    )

    sale_item.line_cogs_irr = (
        line_cogs_irr
    )

    sale_item.save(
        update_fields=[
            "unit_cost_cad_snapshot",
            "line_cogs_cad",
            "line_cogs_irr",
        ]
    )

    inventory.qty_on_hand -= (
        sale_item.quantity
    )

    inventory.save(
        update_fields=[
            "qty_on_hand",
        ]
    )

    StockMovement.objects.create(
        product=sale_item.product,
        warehouse=sale_item.warehouse,
        movement_type="SALE",
        quantity=-sale_item.quantity,
        reference_type="SALE",
        reference_id=sale_item.sale.id,
        created_by=user,
    )

@transaction.atomic
def create_sale_with_items_and_payment(
    *,
    customer,
    sale_date,
    items,
    created_by,
    cad_rate_irr_per_cad=None,
    paid_amount=Decimal("0.00"),
    payment_account=None,
    payment_method="CASH",
    notes="",
):
    if not items:
        raise ValidationError(
            "Sale must contain at least one item."
        )
    if cad_rate_irr_per_cad is not None:
        cad_rate_irr_per_cad = Decimal(
            cad_rate_irr_per_cad
        )

    if cad_rate_irr_per_cad <= 0:
        raise ValidationError(
            "CAD rate must be greater than zero."
        )
    if paid_amount < 0:
        raise ValidationError(
            "Paid amount cannot be negative."
        )

    if paid_amount > 0 and payment_account is None:
        raise ValidationError(
            "Payment account is required."
        )

    temporary_invoice_number = (
        f"TMP-{uuid4().hex}"
    )

    sale = Sale.objects.create(
        customer=customer,
        invoice_number=temporary_invoice_number,
        sale_date=sale_date,

        cad_rate_irr_per_cad=(
            cad_rate_irr_per_cad
        ),

        notes=notes,
        created_by_user=created_by,
    )

    sale.invoice_number = (
        f"INV-{sale.pk:06d}"
    )

    sale.save(
        update_fields=[
            "invoice_number",
        ]
    )

    for item_data in items:
        item = SaleItem.objects.create(
            sale=sale,
            product=item_data["product"],
            warehouse=item_data["warehouse"],
            quantity=item_data["quantity"],
            unit_price_irr=(
                item_data["unit_price_irr"]
            ),
        )

        decrease_inventory_for_sale(
            item,
            created_by,
            cad_rate_irr_per_cad,
        )

    recalculate_sale(
        sale.pk
    )

    sale.refresh_from_db()

    if paid_amount > sale.total_amount:
        raise ValidationError(
            "Payment cannot exceed sale total."
        )

    if paid_amount > 0:
        register_payment(
            sale=sale,
            account=payment_account,
            payment_date=sale_date,
            amount=paid_amount,
            currency_code="IRR",
            payment_method=payment_method,
            notes=(
                f"Initial payment for "
                f"{sale.invoice_number}"
            ),
        )

    sale.refresh_from_db()

    return sale

@transaction.atomic
def settle_customer_debt(
    *,
    customer,
    account,
    payment_date,
    amount,
    payment_method="CASH",
    notes="",
):
    amount = Decimal(amount)

    if amount <= 0:
        raise ValidationError(
            "Payment must be greater than zero."
        )

    if not account.is_active:
        raise ValidationError(
            "Financial account is inactive."
        )

    if account.currency_code != "IRR":
        raise ValidationError(
            "Customer settlement account must be IRR."
        )

    outstanding_sales = list(
        Sale.objects
        .select_for_update()
        .filter(
            customer=customer,
            total_debt__gt=0,
        )
        .order_by(
            "sale_date",
            "id",
        )
    )

    total_debt = sum(
        (
            sale.total_debt
            for sale in outstanding_sales
        ),
        Decimal("0.00"),
    )

    if amount > total_debt:
        raise ValidationError(
            "Payment cannot exceed customer debt."
        )

    remaining = amount
    created_payments = []

    for sale in outstanding_sales:
        if remaining <= 0:
            break

        allocation = min(
            remaining,
            sale.total_debt,
        )

        payment = register_payment(
            sale=sale,
            account=account,
            payment_date=payment_date,
            amount=allocation,
            currency_code="IRR",
            payment_method=payment_method,
            notes=notes,
        )

        created_payments.append(
            payment
        )

        remaining -= allocation

    return created_payments