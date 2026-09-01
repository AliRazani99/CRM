from decimal import (
    Decimal,
    ROUND_HALF_UP,
)

from django.core.exceptions import (
    ValidationError,
)
from django.db import transaction
from django.db.models import F

from parties.models import (
    FinancialAccount,
)

from .models import (
    AccountTransaction,
    CurrencyExchange,
)


MONEY = Decimal("0.01")
RATE = Decimal("0.000000000001")


def _money(value):
    return Decimal(value).quantize(
        MONEY,
        rounding=ROUND_HALF_UP,
    )


def _rate(value):
    return Decimal(value).quantize(
        RATE,
        rounding=ROUND_HALF_UP,
    )


@transaction.atomic
def create_currency_exchange(
    *,
    exchange_partner_name,
    exchange_date,
    from_account,
    to_account,
    from_amount,
    to_amount,
    created_by_user,
    notes="",

    # Kept optional for compatibility with
    # older service callers/tests.
    from_currency_code=None,
    to_currency_code=None,
    exchange_rate=None,
):
    partner = (
        exchange_partner_name.strip()
    )

    if not partner:
        raise ValidationError(
            "Exchange partner name is required."
        )

    if (
        from_account.pk
        == to_account.pk
    ):
        raise ValidationError(
            "Source and destination accounts "
            "must be different."
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
            .filter(
                pk__in=account_ids
            )
            .order_by("pk")
        )
    }

    if (
        from_account.pk
        not in locked_accounts
        or to_account.pk
        not in locked_accounts
    ):
        raise ValidationError(
            "Financial account not found."
        )

    from_account = (
        locked_accounts[
            from_account.pk
        ]
    )

    to_account = (
        locked_accounts[
            to_account.pk
        ]
    )

    if (
        not from_account.is_active
        or not to_account.is_active
    ):
        raise ValidationError(
            "Both accounts must be active."
        )

    actual_from_currency = (
        from_account.currency_code
    )

    actual_to_currency = (
        to_account.currency_code
    )

    if (
        actual_from_currency
        == actual_to_currency
    ):
        raise ValidationError(
            "Currency exchange requires "
            "different currencies."
        )

    # If legacy callers still provide currency
    # codes, they must match the accounts.
    if (
        from_currency_code is not None
        and from_currency_code
        != actual_from_currency
    ):
        raise ValidationError(
            "Source currency does not match "
            "source account."
        )

    if (
        to_currency_code is not None
        and to_currency_code
        != actual_to_currency
    ):
        raise ValidationError(
            "Destination currency does not match "
            "destination account."
        )

    from_amount = _money(
        from_amount
    )

    to_amount = _money(
        to_amount
    )

    if (
        from_amount <= 0
        or to_amount <= 0
    ):
        raise ValidationError(
            "Exchange amounts must be "
            "greater than zero."
        )

    if (
        from_account.current_balance
        < from_amount
    ):
        raise ValidationError(
            "Insufficient balance in "
            "source account."
        )

    calculated_rate = _rate(
        to_amount
        / from_amount
    )

    if calculated_rate <= 0:
        raise ValidationError(
            "Exchange rate must be "
            "greater than zero."
        )

    # Legacy explicit rate is validated if sent.
    if exchange_rate is not None:
        exchange_rate = _rate(
            exchange_rate
        )

        if exchange_rate <= 0:
            raise ValidationError(
                "Exchange rate must be "
                "greater than zero."
            )

        expected_to_amount = _money(
            from_amount
            * exchange_rate
        )

        if (
            expected_to_amount
            != to_amount
        ):
            raise ValidationError(
                "to_amount does not match "
                "from_amount × exchange_rate."
            )

        stored_rate = exchange_rate

    else:
        stored_rate = calculated_rate

    exchange = (
        CurrencyExchange.objects.create(
            exchange_partner_name=partner,
            exchange_date=exchange_date,

            from_account=from_account,
            to_account=to_account,

            from_amount=from_amount,
            from_currency_code=(
                actual_from_currency
            ),

            to_amount=to_amount,
            to_currency_code=(
                actual_to_currency
            ),

            exchange_rate=stored_rate,

            created_by_user=(
                created_by_user
            ),

            notes=notes or "",
        )
    )

    FinancialAccount.objects.filter(
        pk=from_account.pk,
    ).update(
        current_balance=(
            F("current_balance")
            - from_amount
        ),
    )

    FinancialAccount.objects.filter(
        pk=to_account.pk,
    ).update(
        current_balance=(
            F("current_balance")
            + to_amount
        ),
    )

    AccountTransaction.objects.create(
        account=from_account,

        transaction_date=(
            exchange_date
        ),

        transaction_type=(
            "CURRENCY_EXCHANGE"
        ),

        direction="OUT",

        amount=from_amount,

        currency_code=(
            actual_from_currency
        ),

        reference_type=(
            "CURRENCY_EXCHANGE"
        ),

        reference_id=exchange.pk,

        description=(
            f"Currency exchange with "
            f"{partner}"
        ),
    )

    AccountTransaction.objects.create(
        account=to_account,

        transaction_date=(
            exchange_date
        ),

        transaction_type=(
            "CURRENCY_EXCHANGE"
        ),

        direction="IN",

        amount=to_amount,

        currency_code=(
            actual_to_currency
        ),

        reference_type=(
            "CURRENCY_EXCHANGE"
        ),

        reference_id=exchange.pk,

        description=(
            f"Currency exchange with "
            f"{partner}"
        ),
    )

    return exchange
