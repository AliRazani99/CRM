from datetime import date
from decimal import Decimal

from django.contrib.auth import (
    get_user_model,
)
from django.core.exceptions import (
    ValidationError,
)
from django.db import (
    IntegrityError,
    transaction,
)
from rest_framework.test import (
    APITestCase,
)

from accounts.models import Role
from parties.models import (
    FinancialAccount,
)

from .models import (
    AccountTransaction,
    CurrencyExchange,
)
from .services import (
    create_currency_exchange,
)


class FinanceE2ETests(
    APITestCase
):
    def setUp(self):
        User = get_user_model()

        store_role, _ = (
            Role.objects.get_or_create(
                code=(
                    Role.Code.STORE_MANAGER
                ),
                defaults={
                    "name":
                        "مدیر فروشگاه",
                },
            )
        )

        purchase_role, _ = (
            Role.objects.get_or_create(
                code=(
                    Role.Code.PURCHASE_MANAGER
                ),
                defaults={
                    "name":
                        "مدیر خرید",
                },
            )
        )

        self.store_user = (
            User.objects.create_user(
                username=(
                    "finance_store"
                ),
                email=(
                    "finance_store@example.com"
                ),
                password=(
                    "test-password-123"
                ),
                role=store_role,
            )
        )

        self.purchase_user = (
            User.objects.create_user(
                username=(
                    "finance_purchase"
                ),
                email=(
                    "finance_purchase@example.com"
                ),
                password=(
                    "test-password-123"
                ),
                role=purchase_role,
            )
        )

        self.client.force_authenticate(
            user=self.store_user,
        )

    def create_irr_account(
        self,
        *,
        name="IRR Main",
        balance=Decimal(
            "72500000.00"
        ),
    ):
        return (
            FinancialAccount.objects
            .create(
                name=name,
                account_type="BANK",
                currency_code="IRR",
                current_balance=balance,
                is_active=True,
            )
        )

    def create_cad_account(
        self,
        *,
        name="CAD Main",
        balance=Decimal(
            "10.00"
        ),
    ):
        return (
            FinancialAccount.objects
            .create(
                name=name,
                account_type="BANK",
                currency_code="CAD",
                current_balance=balance,
                is_active=True,
            )
        )

    def test_store_manager_creates_account_with_opening_ledger(
        self,
    ):
        response = self.client.post(
            "/api/financial-accounts/",
            {
                "name":
                    "IRR Cash",

                "account_type":
                    "CASH",

                "currency_code":
                    "IRR",

                "opening_balance":
                    "1000000.00",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        account = (
            FinancialAccount.objects
            .get(
                pk=response.data["id"]
            )
        )

        self.assertEqual(
            account.current_balance,
            Decimal(
                "1000000.00"
            ),
        )

        transaction = (
            AccountTransaction.objects
            .get(
                account=account,
                transaction_type=(
                    "OPENING_BALANCE"
                ),
            )
        )

        self.assertEqual(
            transaction.direction,
            "IN",
        )

        self.assertEqual(
            transaction.amount,
            Decimal(
                "1000000.00"
            ),
        )

        self.assertEqual(
            transaction.reference_type,
            "FINANCIAL_ACCOUNT",
        )

        self.assertEqual(
            transaction.reference_id,
            account.id,
        )

    def test_zero_opening_balance_creates_no_ledger_row(
        self,
    ):
        response = self.client.post(
            "/api/financial-accounts/",
            {
                "name":
                    "Empty CAD",

                "account_type":
                    "BANK",

                "currency_code":
                    "CAD",

                "opening_balance":
                    "0.00",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        self.assertEqual(
            AccountTransaction.objects
            .count(),
            0,
        )

    def test_account_balance_and_currency_cannot_be_patched(
        self,
    ):
        account = (
            self.create_irr_account()
        )

        response = self.client.patch(
            (
                "/api/"
                "financial-accounts/"
                f"{account.id}/"
            ),
            {
                "current_balance":
                    "999999.00",

                "currency_code":
                    "CAD",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

        account.refresh_from_db()

        self.assertEqual(
            account.currency_code,
            "IRR",
        )

        self.assertEqual(
            account.current_balance,
            Decimal(
                "72500000.00"
            ),
        )

    def test_operational_user_can_read_but_cannot_write_accounts(
        self,
    ):
        self.create_irr_account()

        self.client.force_authenticate(
            user=self.purchase_user,
        )

        read_response = (
            self.client.get(
                "/api/"
                "financial-accounts/"
            )
        )

        self.assertEqual(
            read_response.status_code,
            200,
        )

        write_response = (
            self.client.post(
                "/api/"
                "financial-accounts/",
                {
                    "name":
                        "Forbidden",

                    "account_type":
                        "BANK",

                    "currency_code":
                        "CAD",

                    "opening_balance":
                        "0.00",
                },
                format="json",
            )
        )

        self.assertEqual(
            write_response.status_code,
            403,
        )

    def test_financial_account_delete_is_disabled(
        self,
    ):
        account = (
            self.create_irr_account()
        )

        response = (
            self.client.delete(
                (
                    "/api/"
                    "financial-accounts/"
                    f"{account.id}/"
                )
            )
        )

        self.assertEqual(
            response.status_code,
            405,
        )

        self.assertTrue(
            FinancialAccount.objects
            .filter(
                pk=account.id
            )
            .exists()
        )

    def test_realistic_irr_to_cad_exchange_updates_balances_and_references(
        self,
    ):
        irr_account = (
            self.create_irr_account()
        )

        cad_account = (
            self.create_cad_account()
        )

        response = self.client.post(
            "/api/finance/exchanges/",
            {
                "exchange_partner_name":
                    "Test Exchange",

                "exchange_date":
                    "2026-09-01",

                "from_account":
                    irr_account.id,

                "to_account":
                    cad_account.id,

                "from_amount":
                    "72500000.00",

                "to_amount":
                    "100.00",

                "notes":
                    "Realistic rate test",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        exchange = (
            CurrencyExchange.objects
            .get(
                pk=response.data["id"]
            )
        )

        irr_account.refresh_from_db()
        cad_account.refresh_from_db()

        self.assertEqual(
            irr_account.current_balance,
            Decimal("0.00"),
        )

        self.assertEqual(
            cad_account.current_balance,
            Decimal("110.00"),
        )

        self.assertGreater(
            exchange.exchange_rate,
            Decimal("0"),
        )

        transactions = (
            AccountTransaction.objects
            .filter(
                reference_type=(
                    "CURRENCY_EXCHANGE"
                ),
                reference_id=(
                    exchange.id
                ),
            )
        )

        self.assertEqual(
            transactions.count(),
            2,
        )

        outgoing = (
            transactions.get(
                direction="OUT"
            )
        )

        incoming = (
            transactions.get(
                direction="IN"
            )
        )

        self.assertEqual(
            outgoing.account,
            irr_account,
        )

        self.assertEqual(
            incoming.account,
            cad_account,
        )

    def test_exchange_with_insufficient_balance_returns_400_and_rolls_back(
        self,
    ):
        irr_account = (
            self.create_irr_account(
                balance=Decimal(
                    "1000.00"
                )
            )
        )

        cad_account = (
            self.create_cad_account()
        )

        response = self.client.post(
            "/api/finance/exchanges/",
            {
                "exchange_partner_name":
                    "Test Exchange",

                "exchange_date":
                    "2026-09-01",

                "from_account":
                    irr_account.id,

                "to_account":
                    cad_account.id,

                "from_amount":
                    "2000.00",

                "to_amount":
                    "10.00",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

        irr_account.refresh_from_db()
        cad_account.refresh_from_db()

        self.assertEqual(
            irr_account.current_balance,
            Decimal(
                "1000.00"
            ),
        )

        self.assertEqual(
            cad_account.current_balance,
            Decimal(
                "10.00"
            ),
        )

        self.assertEqual(
            CurrencyExchange.objects
            .count(),
            0,
        )

        self.assertEqual(
            AccountTransaction.objects
            .count(),
            0,
        )

    def test_exchange_same_account_is_rejected(
        self,
    ):
        account = (
            self.create_irr_account()
        )

        response = self.client.post(
            "/api/finance/exchanges/",
            {
                "exchange_partner_name":
                    "Invalid",

                "exchange_date":
                    "2026-09-01",

                "from_account":
                    account.id,

                "to_account":
                    account.id,

                "from_amount":
                    "100.00",

                "to_amount":
                    "1.00",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

    def test_exchange_same_currency_is_rejected(
        self,
    ):
        source = (
            self.create_irr_account(
                name="IRR A"
            )
        )

        destination = (
            self.create_irr_account(
                name="IRR B",
                balance=Decimal(
                    "0.00"
                ),
            )
        )

        response = self.client.post(
            "/api/finance/exchanges/",
            {
                "exchange_partner_name":
                    "Invalid",

                "exchange_date":
                    "2026-09-01",

                "from_account":
                    source.id,

                "to_account":
                    destination.id,

                "from_amount":
                    "100.00",

                "to_amount":
                    "100.00",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

    def test_currency_exchange_history_is_immutable(
        self,
    ):
        irr_account = (
            self.create_irr_account()
        )

        cad_account = (
            self.create_cad_account()
        )

        create_response = (
            self.client.post(
                "/api/finance/exchanges/",
                {
                    "exchange_partner_name":
                        "Test Exchange",

                    "exchange_date":
                        "2026-09-01",

                    "from_account":
                        irr_account.id,

                    "to_account":
                        cad_account.id,

                    "from_amount":
                        "725000.00",

                    "to_amount":
                        "1.00",
                },
                format="json",
            )
        )

        self.assertEqual(
            create_response.status_code,
            201,
            create_response.data,
        )

        exchange_id = (
            create_response.data["id"]
        )

        patch_response = (
            self.client.patch(
                (
                    "/api/finance/"
                    "exchanges/"
                    f"{exchange_id}/"
                ),
                {
                    "to_amount":
                        "999.00"
                },
                format="json",
            )
        )

        delete_response = (
            self.client.delete(
                (
                    "/api/finance/"
                    "exchanges/"
                    f"{exchange_id}/"
                )
            )
        )

        self.assertEqual(
            patch_response.status_code,
            405,
        )

        self.assertEqual(
            delete_response.status_code,
            405,
        )

    def test_transaction_endpoint_is_read_only(
        self,
    ):
        account = (
            self.create_irr_account()
        )

        (
            AccountTransaction.objects
            .create(
            account=account,

            transaction_date=(
                "2026-09-01"
            ),

            transaction_type=(
                "TEST"
            ),

            direction="IN",

            amount=Decimal(
                "100.00"
            ),

            currency_code="IRR",
            )
        )

        get_response = (
            self.client.get(
                "/api/finance/"
                "transactions/"
            )
        )

        self.assertEqual(
            get_response.status_code,
            200,
        )

        self.assertEqual(
            get_response.data[0][
                "account_name"
            ],
            account.name,
        )

        post_response = (
            self.client.post(
                "/api/finance/"
                "transactions/",
                {
                    "amount":
                        "100.00"
                },
                format="json",
            )
        )

        self.assertEqual(
            post_response.status_code,
            405,
        )

    def test_zero_account_transaction_is_blocked_by_database(
        self,
    ):
        account = (
            self.create_irr_account()
        )

        with self.assertRaises(
            IntegrityError
        ):
            with transaction.atomic():
                AccountTransaction.objects.create(
                    account=account,
                    transaction_date=(
                        "2026-09-01"
                    ),
                    transaction_type=(
                        "INVALID_ZERO"
                    ),
                    direction="IN",
                    amount=Decimal(
                        "0.00"
                    ),
                    currency_code="IRR",
                )

    def test_legacy_explicit_currency_mismatch_is_rejected(
        self,
    ):
        irr_account = (
            self.create_irr_account()
        )

        cad_account = (
            self.create_cad_account()
        )

        with self.assertRaises(
            ValidationError
        ):
            create_currency_exchange(
                exchange_partner_name=(
                    "Legacy Test"
                ),
                exchange_date=date(
                    2026,
                    9,
                    1,
                ),
                from_account=(
                    irr_account
                ),
                to_account=(
                    cad_account
                ),
                from_amount=Decimal(
                    "725000.00"
                ),
                to_amount=Decimal(
                    "1.00"
                ),
                from_currency_code=(
                    "USD"
                ),
                to_currency_code=(
                    "CAD"
                ),
                created_by_user=(
                    self.store_user
                ),
            )

        self.assertEqual(
            CurrencyExchange.objects
            .count(),
            0,
        )

    def test_legacy_explicit_rate_mismatch_is_rejected(
        self,
    ):
        irr_account = (
            self.create_irr_account()
        )

        cad_account = (
            self.create_cad_account()
        )

        with self.assertRaises(
            ValidationError
        ):
            create_currency_exchange(
                exchange_partner_name=(
                    "Legacy Test"
                ),
                exchange_date=date(
                    2026,
                    9,
                    1,
                ),
                from_account=(
                    irr_account
                ),
                to_account=(
                    cad_account
                ),
                from_amount=Decimal(
                    "500000.00"
                ),
                to_amount=Decimal(
                    "10.00"
                ),
                from_currency_code=(
                    "IRR"
                ),
                to_currency_code=(
                    "CAD"
                ),
                exchange_rate=Decimal(
                    "0.000010000000"
                ),
                created_by_user=(
                    self.store_user
                ),
            )

        self.assertEqual(
            CurrencyExchange.objects
            .count(),
            0,
        )
