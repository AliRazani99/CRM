from decimal import Decimal

from django.core.exceptions import (
    ValidationError,
)
from django.db import transaction
from django.utils import timezone

from finance.models import (
    AccountTransaction,
)

from .models import FinancialAccount


ALLOWED_ACCOUNT_TYPES = {
    "BANK",
    "CASH",
}

ALLOWED_CURRENCIES = {
    "IRR",
    "CAD",
}


@transaction.atomic
def create_financial_account(
    *,
    name,
    account_type,
    currency_code,
    opening_balance=Decimal("0.00"),
    is_active=True,
):
    name = name.strip()
    account_type = (
        account_type.strip().upper()
    )
    currency_code = (
        currency_code.strip().upper()
    )
    opening_balance = Decimal(
        opening_balance
    )

    if not name:
        raise ValidationError(
            "Account name is required."
        )

    if (
        account_type
        not in ALLOWED_ACCOUNT_TYPES
    ):
        raise ValidationError(
            "Unsupported account type."
        )

    if (
        currency_code
        not in ALLOWED_CURRENCIES
    ):
        raise ValidationError(
            "Unsupported account currency."
        )

    if opening_balance < 0:
        raise ValidationError(
            "Opening balance cannot be negative."
        )

    account = (
        FinancialAccount.objects.create(
            name=name,
            account_type=account_type,
            currency_code=currency_code,
            current_balance=opening_balance,
            is_active=is_active,
        )
    )

    if opening_balance > 0:
        AccountTransaction.objects.create(
            account=account,
            transaction_date=(
                timezone.localdate()
            ),
            transaction_type=(
                "OPENING_BALANCE"
            ),
            direction="IN",
            amount=opening_balance,
            currency_code=currency_code,
            reference_type=(
                "FINANCIAL_ACCOUNT"
            ),
            reference_id=account.pk,
            description=(
                f"Opening balance for "
                f"{account.name}"
            ),
        )

    return account
