from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F

from parties.models import FinancialAccount

from .models import AccountTransaction, CurrencyExchange


@transaction.atomic
def create_currency_exchange(
    *,
    exchange_partner_name,
    exchange_date,
    from_account,
    to_account,
    from_amount,
    from_currency_code,
    to_amount,
    to_currency_code,
    exchange_rate,
    created_by_user,
    notes="",
):
    if from_account.pk == to_account.pk:
        raise ValidationError(
            "Source and destination accounts must be different."
        )

    account_ids = sorted([
        from_account.pk,
        to_account.pk,
    ])

    locked_accounts = {
        account.pk: account
        for account in (
            FinancialAccount.objects
            .select_for_update()
            .filter(pk__in=account_ids)
            .order_by("pk")
        )
    }

    from_account = locked_accounts[from_account.pk]
    to_account = locked_accounts[to_account.pk]

    if not from_account.is_active or not to_account.is_active:
        raise ValidationError(
            "Both accounts must be active."
        )

    if from_account.currency_code != from_currency_code:
        raise ValidationError(
            "Source currency does not match source account."
        )

    if to_account.currency_code != to_currency_code:
        raise ValidationError(
            "Destination currency does not match destination account."
        )

    if from_currency_code == to_currency_code:
        raise ValidationError(
            "Currency exchange requires different currencies."
        )

    if from_amount <= 0 or to_amount <= 0:
        raise ValidationError(
            "Exchange amounts must be greater than zero."
        )

    if exchange_rate <= 0:
        raise ValidationError(
            "Exchange rate must be greater than zero."
        )

    expected_to_amount = (
        from_amount * exchange_rate
    ).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    if to_amount != expected_to_amount:
        raise ValidationError(
            "to_amount does not match from_amount × exchange_rate."
        )

    if from_account.current_balance < from_amount:
        raise ValidationError(
            "Insufficient balance in source account."
        )

    exchange = CurrencyExchange.objects.create(
        exchange_partner_name=exchange_partner_name,
        exchange_date=exchange_date,
        from_account=from_account,
        to_account=to_account,
        from_amount=from_amount,
        from_currency_code=from_currency_code,
        to_amount=to_amount,
        to_currency_code=to_currency_code,
        exchange_rate=exchange_rate,
        created_by_user=created_by_user,
        notes=notes,
    )

    FinancialAccount.objects.filter(
        pk=from_account.pk,
    ).update(
        current_balance=F("current_balance") - from_amount,
    )

    FinancialAccount.objects.filter(
        pk=to_account.pk,
    ).update(
        current_balance=F("current_balance") + to_amount,
    )

    AccountTransaction.objects.create(
        account=from_account,
        transaction_date=exchange_date,
        transaction_type="CURRENCY_EXCHANGE",
        direction="OUT",
        amount=from_amount,
        currency_code=from_currency_code,
        reference_type="CURRENCY_EXCHANGE",
        reference_id=exchange.id,
        description="Currency exchange source transaction",
    )

    AccountTransaction.objects.create(
        account=to_account,
        transaction_date=exchange_date,
        transaction_type="CURRENCY_EXCHANGE",
        direction="IN",
        amount=to_amount,
        currency_code=to_currency_code,
        reference_type="CURRENCY_EXCHANGE",
        reference_id=exchange.id,
        description="Currency exchange destination transaction",
    )

    return exchange