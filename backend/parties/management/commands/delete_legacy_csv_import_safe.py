"""Conservatively remove *only* imported historical sales, never master data.

Install as backend/parties/management/commands/delete_legacy_csv_import.py
Always back up the DB first. Default command is a dry-run; use --apply to delete.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from finance.models import AccountTransaction
from inventory.models import StockMovement
from sales.models import Payment, Sale, SaleItem


class Command(BaseCommand):
    help = "Safely remove legacy CSV historical invoices only (never customers/products)."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Perform deletion after checking related real payments")
        parser.add_argument("--include-master-data", action="store_true", help="Deprecated: intentionally not supported")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["include_master_data"]:
            raise CommandError(
                "Refusing master-data cleanup: the old option could delete CRM "
                "leads without orders and products used by current inventory."
            )

        sales = Sale.objects.select_for_update().filter(notes__contains="[LEGACY_CSV_IMPORT]")
        ids = list(sales.values_list("id", flat=True))
        if not ids:
            self.stdout.write(self.style.WARNING("No imported historical invoices found."))
            return

        additional_payments = Payment.objects.filter(sale_id__in=ids).exclude(payment_method="LEGACY_IMPORT")
        if additional_payments.exists():
            raise CommandError(
                "Historical invoices have real/new payments. Refusing to delete: "
                "you must reconcile and reverse these transactions separately."
            )

        ledger = AccountTransaction.objects.filter(
            reference_id__in=ids, reference_type__in=("SALES", "SALE")
        )
        if ledger.exists():
            raise CommandError("Ledger records reference historical sales. Refusing unsafe deletion.")

        movements = StockMovement.objects.filter(
            Q(reference_type__iexact="SALE") | Q(reference_type__iexact="SALES"),
            reference_id__in=ids,
        )
        if movements.exists():
            raise CommandError("Stock movements reference historical sales. Refusing unsafe deletion.")

        self.stdout.write(f"Historical invoices: {len(ids)}")
        self.stdout.write(f"Historical sale items: {SaleItem.objects.filter(sale_id__in=ids).count()}")
        self.stdout.write(f"Historical imported payments: {Payment.objects.filter(sale_id__in=ids).count()}")
        self.stdout.write("Customers/products/warehouses/stock/accounts: will NOT be deleted or adjusted.")
        if not options["apply"]:
            self.stdout.write(self.style.WARNING("DRY-RUN ONLY. Use --apply to delete after database backup."))
            return

        # The only payments now linked to these sales have legacy import marker.
        Payment.objects.filter(sale_id__in=ids, payment_method="LEGACY_IMPORT").delete()
        SaleItem.objects.filter(sale_id__in=ids).delete()
        deleted, _ = sales.delete()
        self.stdout.write(self.style.SUCCESS(f"Removed legacy sales and cascaded receivables. Deleted object count: {deleted}."))
