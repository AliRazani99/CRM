from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F

from finance.models import AccountTransaction
from inventory.models import Inventory, StockMovement
from parties.models import FinancialAccount

from .models import (
    Purchase,
    PurchaseItem,
    PurchasePayment,
)


MONEY = Decimal("0.01")


def _money(value):
    return Decimal(value).quantize(
        MONEY,
        rounding=ROUND_HALF_UP,
    )


def _lock_account(
    *,
    account,
    currency_code,
    required_amount,
):
    locked = (
        FinancialAccount.objects
        .select_for_update()
        .get(pk=account.pk)
    )

    if not locked.is_active:
        raise ValidationError(
            "Financial account is inactive."
        )

    if locked.currency_code != currency_code:
        raise ValidationError(
            f"Account currency must be {currency_code}."
        )

    if locked.current_balance < required_amount:
        raise ValidationError(
            f"Insufficient {currency_code} account balance."
        )

    return locked


def _register_purchase_payment(
    *,
    purchase,
    account,
    payment_date,
    amount,
    currency_code,
    payment_type,
    description,
):
    if amount <= 0:
        return None

    payment = PurchasePayment.objects.create(
        purchase=purchase,
        account=account,
        payment_date=payment_date,
        amount=amount,
        currency_code=currency_code,
        payment_type=payment_type,
        notes=description,
    )

    FinancialAccount.objects.filter(
        pk=account.pk,
    ).update(
        current_balance=(
            F("current_balance")
            - amount
        ),
    )

    AccountTransaction.objects.create(
        account=account,
        transaction_date=payment_date,
        transaction_type=payment_type,
        direction="OUT",
        amount=amount,
        currency_code=currency_code,
        reference_type="PROCUREMENT",
        reference_id=purchase.pk,
        description=description,
    )

    return payment


@transaction.atomic
def create_purchase_with_receipt(
    *,
    supplier,
    warehouse,
    purchase_date,
    items,
    irr_per_cad,
    purchase_account,
    created_by,
    cost_account=None,
    shipping_cost_irr=Decimal("0.00"),
    customs_cost_irr=Decimal("0.00"),
    other_costs_irr=Decimal("0.00"),
    tax_irr=Decimal("0.00"),
    overall_discount_irr=Decimal("0.00"),
    notes="",
):
    if not items:
        raise ValidationError(
            "Purchase must contain at least one item."
        )

    irr_per_cad = Decimal(irr_per_cad)

    if irr_per_cad <= 0:
        raise ValidationError(
            "IRR per CAD rate must be greater than zero."
        )

    shipping_cost_irr = Decimal(shipping_cost_irr)
    customs_cost_irr = Decimal(customs_cost_irr)
    other_costs_irr = Decimal(other_costs_irr)
    tax_irr = Decimal(tax_irr)
    overall_discount_irr = Decimal(
        overall_discount_irr
    )

    if any(
        value < 0
        for value in (
            shipping_cost_irr,
            customs_cost_irr,
            other_costs_irr,
            tax_irr,
            overall_discount_irr,
        )
    ):
        raise ValidationError(
            "Purchase costs cannot be negative."
        )

    gross_extra_irr = (
        shipping_cost_irr
        + customs_cost_irr
        + other_costs_irr
        + tax_irr
    )

    if overall_discount_irr > gross_extra_irr:
        raise ValidationError(
            "Overall discount cannot exceed "
            "landing costs in the current flow."
        )

    net_extra_irr = (
        gross_extra_irr
        - overall_discount_irr
    )

    normalized_items = []
    subtotal_cad = Decimal("0.00")

    for item_data in items:
        quantity = int(
            item_data["quantity"]
        )
        unit_cost_cad = Decimal(
            item_data["unit_cost_cad"]
        )

        if quantity <= 0:
            raise ValidationError(
                "Purchase quantity must be greater than zero."
            )

        if unit_cost_cad < 0:
            raise ValidationError(
                "Unit cost cannot be negative."
            )

        line_total_cad = _money(
            unit_cost_cad * quantity
        )

        normalized_items.append({
            "product": item_data["product"],
            "quantity": quantity,
            "unit_cost_cad": unit_cost_cad,
            "line_total_cad": line_total_cad,
        })

        subtotal_cad += line_total_cad

    subtotal_cad = _money(
        subtotal_cad
    )

    if subtotal_cad <= 0:
        raise ValidationError(
            "Purchase subtotal must be greater than zero."
        )

    cad_account = _lock_account(
        account=purchase_account,
        currency_code="CAD",
        required_amount=subtotal_cad,
    )

    irr_account = None

    if net_extra_irr > 0:
        if cost_account is None:
            raise ValidationError(
                "IRR cost account is required "
                "when landing costs are greater than zero."
            )

        irr_account = _lock_account(
            account=cost_account,
            currency_code="IRR",
            required_amount=net_extra_irr,
        )

    purchase = Purchase.objects.create(
        purchase_number=(
            f"TMP-{uuid4().hex}"
        ),
        supplier=supplier,
        warehouse=warehouse,
        purchase_date=purchase_date,
        purchase_currency="CAD",
        exchange_rate_to_cad=Decimal("1.00000000"),
        irr_per_cad=irr_per_cad,
        shipping_cost_irr=shipping_cost_irr,
        customs_cost_irr=customs_cost_irr,
        other_costs_irr=other_costs_irr,
        tax_irr=tax_irr,
        overall_discount_irr=overall_discount_irr,
        paid_amount=subtotal_cad,
        paying_account=cad_account,
        notes=notes,
        created_by=created_by,
    )

    purchase.purchase_number = (
        f"PUR-{purchase.pk:06d}"
    )
    purchase.save(
        update_fields=[
            "purchase_number",
        ]
    )

    extra_cad = (
        net_extra_irr
        / irr_per_cad
    )

    for item_data in normalized_items:
        allocation_share = (
            item_data["line_total_cad"]
            / subtotal_cad
        )

        allocated_extra_cad = (
            extra_cad
            * allocation_share
        )

        landed_line_cad = (
            item_data["line_total_cad"]
            + allocated_extra_cad
        )

        landed_unit_cad = _money(
            landed_line_cad
            / item_data["quantity"]
        )

        purchase_item = (
            PurchaseItem.objects.create(
                purchase=purchase,
                product=item_data["product"],
                quantity=item_data["quantity"],
                unit_cost=_money(
                    item_data["unit_cost_cad"]
                ),
                row_discount=Decimal("0.00"),
                landed_cost_per_unit=(
                    landed_unit_cad
                ),
                line_total=(
                    item_data["line_total_cad"]
                ),
            )
        )

        inventory = (
            Inventory.objects
            .select_for_update()
            .filter(
                product=purchase_item.product,
                warehouse=warehouse,
            )
            .first()
        )

        if inventory is None:
            inventory = Inventory.objects.create(
                product=purchase_item.product,
                warehouse=warehouse,
                qty_on_hand=0,
                qty_reserved=0,
                avg_cost_cad=Decimal("0.00"),
            )

        old_qty = Decimal(
            inventory.qty_on_hand
        )
        incoming_qty = Decimal(
            purchase_item.quantity
        )
        new_qty = (
            old_qty
            + incoming_qty
        )

        new_avg_cost = _money(
            (
                (
                    old_qty
                    * inventory.avg_cost_cad
                )
                + (
                    incoming_qty
                    * landed_unit_cad
                )
            )
            / new_qty
        )

        inventory.qty_on_hand += (
            purchase_item.quantity
        )
        inventory.avg_cost_cad = (
            new_avg_cost
        )
        inventory.save(
            update_fields=[
                "qty_on_hand",
                "avg_cost_cad",
            ]
        )

        StockMovement.objects.create(
            product=purchase_item.product,
            warehouse=warehouse,
            movement_type="PURCHASE_RECEIPT",
            quantity=purchase_item.quantity,
            reference_type="PURCHASE",
            reference_id=purchase.pk,
            created_by=created_by,
            notes=(
                f"Receipt for "
                f"{purchase.purchase_number}"
            ),
        )

    _register_purchase_payment(
        purchase=purchase,
        account=cad_account,
        payment_date=purchase_date,
        amount=subtotal_cad,
        currency_code="CAD",
        payment_type="PURCHASE_PAYMENT",
        description=(
            f"Supplier payment for "
            f"{purchase.purchase_number}"
        ),
    )

    if net_extra_irr > 0:
        _register_purchase_payment(
            purchase=purchase,
            account=irr_account,
            payment_date=purchase_date,
            amount=_money(net_extra_irr),
            currency_code="IRR",
            payment_type="PURCHASE_LANDING_COST",
            description=(
                f"Landing costs for "
                f"{purchase.purchase_number}"
            ),
        )

    purchase.refresh_from_db()

    return purchase
