from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F, Sum

from finance.models import AccountTransaction
from parties.models import FinancialAccount

from .models import CustomerReceivable, Payment, Sale


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
        reference_id=payment.id,
        description=(
            f"Payment for sale {sale.invoice_number}"
        ),
    )

    recalculate_sale(sale.pk)

    return payment