from django.core.management.base import (
    BaseCommand,
)

from django.db import transaction

from sales.models import (
    Sale,
    SaleItem,
    Payment,
)

from parties.models import Customer
from products.models import Product
from inventory.models import Inventory


class Command(BaseCommand):

    help = (
        "Delete data imported by legacy CSV importer."
    )


    def add_arguments(
        self,
        parser,
    ):
        parser.add_argument(
            "--include-master-data",
            action="store_true",
            help=(
                "Also delete legacy customers "
                "and products."
            ),
        )


    @transaction.atomic
    def handle(
        self,
        *args,
        **options,
    ):

        include_master_data = options[
            "include_master_data"
        ]


        self.stdout.write(
            "Searching legacy sales..."
        )


        legacy_sales = Sale.objects.filter(
            notes__contains=
                "[LEGACY_CSV_IMPORT]"
        )


        sale_count = legacy_sales.count()


        if sale_count == 0:

            self.stdout.write(
                self.style.WARNING(
                    "No legacy sales found."
                )
            )

            return



        sale_ids = list(
            legacy_sales.values_list(
                "id",
                flat=True,
            )
        )


        payments_deleted, _ = (
            Payment.objects.filter(
                sale_id__in=sale_ids,
                payment_method=
                    "LEGACY_IMPORT",
            )
            .delete()
        )


        items_deleted, _ = (
            SaleItem.objects.filter(
                sale_id__in=sale_ids,
            )
            .delete()
        )


        sales_deleted, _ = (
            Sale.objects.filter(
                id__in=sale_ids,
            )
            .delete()
        )


        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted sales: {sales_deleted}"
            )
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted sale items: {items_deleted}"
            )
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted payments: {payments_deleted}"
            )
        )


        if include_master_data:

            self.stdout.write(
                "Deleting legacy master data..."
            )


            legacy_customers = Customer.objects.filter(
                full_name__isnull=False,
            ).filter(
                sales__isnull=True
            )


            customer_deleted, _ = (
                legacy_customers.delete()
            )


            legacy_products = Product.objects.filter(
                category__name=
                    "Legacy Import"
            )


            product_deleted, _ = (
                legacy_products.delete()
            )


            self.stdout.write(
                self.style.SUCCESS(
                    f"Deleted customers: {customer_deleted}"
                )
            )


            self.stdout.write(
                self.style.SUCCESS(
                    f"Deleted products: {product_deleted}"
                )
            )


        self.stdout.write(
            self.style.SUCCESS(
                "Legacy CSV cleanup completed."
            )
        )