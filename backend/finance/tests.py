from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework.test import APITestCase

from parties.models import FinancialAccount

from .models import (
    AccountTransaction,
    CurrencyExchange,
)
from .services import create_currency_exchange


class FinanceTests(APITestCase):
    def setUp(self):
        User = get_user_model()

        self.user = User.objects.create_user(
            username="finance_tester",
            email="finance_tester@example.com",
            password="test-password-123",
        )

        self.irr_account = FinancialAccount.objects.create(
            name="IRR Main Account",
            account_type="BANK",
            currency_code="IRR",
            current_balance=Decimal("1000000.00"),
            is_active=True,
        )

        self.cad_account = FinancialAccount.objects.create(
            name="CAD Main Account",
            account_type="BANK",
            currency_code="CAD",
            current_balance=Decimal("100.00"),
            is_active=True,
        )

    def test_currency_exchange_updates_balances_and_ledger(self):
        exchange = create_currency_exchange(
            exchange_partner_name="Test Exchange",
            exchange_date=date(2026, 8, 20),
            from_account=self.irr_account,
            to_account=self.cad_account,
            from_amount=Decimal("500000.00"),
            from_currency_code="IRR",
            to_amount=Decimal("10.00"),
            to_currency_code="CAD",
            exchange_rate=Decimal("0.000020"),
            created_by_user=self.user,
            notes="Test exchange",
        )

        self.irr_account.refresh_from_db()
        self.cad_account.refresh_from_db()

        self.assertEqual(
            self.irr_account.current_balance,
            Decimal("500000.00"),
        )

        self.assertEqual(
            self.cad_account.current_balance,
            Decimal("110.00"),
        )

        transactions = AccountTransaction.objects.filter(
            reference_type="CURRENCY_EXCHANGE",
            reference_id=exchange.pk,
        )

        self.assertEqual(
            transactions.count(),
            2,
        )

        outgoing = transactions.get(
            direction="OUT",
        )

        incoming = transactions.get(
            direction="IN",
        )

        self.assertEqual(
            outgoing.account,
            self.irr_account,
        )

        self.assertEqual(
            outgoing.amount,
            Decimal("500000.00"),
        )

        self.assertEqual(
            outgoing.currency_code,
            "IRR",
        )

        self.assertEqual(
            incoming.account,
            self.cad_account,
        )

        self.assertEqual(
            incoming.amount,
            Decimal("10.00"),
        )

        self.assertEqual(
            incoming.currency_code,
            "CAD",
        )

    def test_exchange_between_same_account_is_rejected(self):
        with self.assertRaises(ValidationError):
            create_currency_exchange(
                exchange_partner_name="Test Exchange",
                exchange_date=date(2026, 8, 20),
                from_account=self.irr_account,
                to_account=self.irr_account,
                from_amount=Decimal("100.00"),
                from_currency_code="IRR",
                to_amount=Decimal("100.00"),
                to_currency_code="IRR",
                exchange_rate=Decimal("1.000000"),
                created_by_user=self.user,
            )

        self.assertEqual(
            CurrencyExchange.objects.count(),
            0,
        )

    def test_exchange_with_insufficient_balance_is_rejected(self):
        with self.assertRaises(ValidationError):
            create_currency_exchange(
                exchange_partner_name="Test Exchange",
                exchange_date=date(2026, 8, 20),
                from_account=self.irr_account,
                to_account=self.cad_account,
                from_amount=Decimal("2000000.00"),
                from_currency_code="IRR",
                to_amount=Decimal("40.00"),
                to_currency_code="CAD",
                exchange_rate=Decimal("0.000020"),
                created_by_user=self.user,
            )

        self.irr_account.refresh_from_db()
        self.cad_account.refresh_from_db()

        self.assertEqual(
            self.irr_account.current_balance,
            Decimal("1000000.00"),
        )

        self.assertEqual(
            self.cad_account.current_balance,
            Decimal("100.00"),
        )

        self.assertEqual(
            CurrencyExchange.objects.count(),
            0,
        )

        self.assertEqual(
            AccountTransaction.objects.count(),
            0,
        )

    def test_exchange_currency_must_match_account_currency(self):
        with self.assertRaises(ValidationError):
            create_currency_exchange(
                exchange_partner_name="Test Exchange",
                exchange_date=date(2026, 8, 20),
                from_account=self.irr_account,
                to_account=self.cad_account,
                from_amount=Decimal("500000.00"),
                from_currency_code="USD",
                to_amount=Decimal("10.00"),
                to_currency_code="CAD",
                exchange_rate=Decimal("0.000020"),
                created_by_user=self.user,
            )

        self.assertEqual(
            CurrencyExchange.objects.count(),
            0,
        )

    def test_exchange_amount_must_match_rate(self):
        with self.assertRaises(ValidationError):
            create_currency_exchange(
                exchange_partner_name="Test Exchange",
                exchange_date=date(2026, 8, 20),
                from_account=self.irr_account,
                to_account=self.cad_account,
                from_amount=Decimal("500000.00"),
                from_currency_code="IRR",
                to_amount=Decimal("11.00"),
                to_currency_code="CAD",
                exchange_rate=Decimal("0.000020"),
                created_by_user=self.user,
            )

        self.assertEqual(
            CurrencyExchange.objects.count(),
            0,
        )

    def test_zero_account_transaction_is_blocked_by_database(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AccountTransaction.objects.create(
                    account=self.irr_account,
                    transaction_date=date(2026, 8, 20),
                    transaction_type="TEST",
                    direction="IN",
                    amount=Decimal("0.00"),
                    currency_code="IRR",
                )

    def test_account_transaction_endpoint_is_read_only(self):
        self.client.force_authenticate(
            user=self.user,
        )

        response = self.client.post(
            "/api/finance/transactions/",
            {
                "amount": "100.00",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            405,
        )