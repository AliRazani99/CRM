import csv
import hashlib
import re
import unicodedata
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from difflib import SequenceMatcher

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import Role
from inventory.models import Inventory
from parties.models import Customer, FinancialAccount, Warehouse
from products.models import Product
from products.services import create_product_with_opening_stock
from sales.models import Payment, Sale, SaleItem
from sales.services import recalculate_sale


MONEY = Decimal("0.01")
ZERO = Decimal("0.00")
TEN = Decimal("10")

PERSIAN_DIGITS = str.maketrans(
    "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩",
    "01234567890123456789",
)

ARABIC_TO_PERSIAN = str.maketrans({
    "ي": "ی",
    "ى": "ی",
    "ك": "ک",
})

INVISIBLE_CHARS_RE = re.compile(
    r"[\u200b\u200c\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]"
)


def text(value):
    if value is None:
        return ""
    return str(value).strip()


def clean_name(value):
    value = unicodedata.normalize(
        "NFKC",
        text(value),
    )
    value = value.translate(
        ARABIC_TO_PERSIAN
    )
    value = INVISIBLE_CHARS_RE.sub(
        "",
        value,
    )
    value = re.sub(
        r"\s+",
        " ",
        value,
    ).strip()

    # A few source cells contain literal quote characters around names.
    value = value.strip(
        ' \t\r\n"\'“”‘’«»'
    )
    value = re.sub(
        r"\s+",
        " ",
        value,
    ).strip()

    return value


def normalized_name(value):
    return clean_name(
        value
    ).casefold()


def split_product_names(value):
    raw = unicodedata.normalize(
        "NFKC",
        text(value),
    )
    raw = INVISIBLE_CHARS_RE.sub(
        "",
        raw,
    )

    parts = re.split(
        r"\s*[,،;\n\r]+\s*",
        raw,
    )

    result = []

    for part in parts:
        cleaned = clean_name(
            part
        )

        if cleaned:
            result.append(
                cleaned
            )

    return result


def similarity(left, right):
    left = normalized_name(
        left
    )
    right = normalized_name(
        right
    )

    if not left or not right:
        return 0.0

    if left == right:
        return 1.0

    ratio = SequenceMatcher(
        None,
        left,
        right,
    ).ratio()

    # Reward a strong containment relationship for names that differ
    # only by a small prefix/suffix.
    shorter = min(
        len(left),
        len(right),
    )

    if (
        shorter >= 6
        and (
            left in right
            or right in left
        )
    ):
        ratio = max(
            ratio,
            0.94,
        )

    return ratio


def best_normalized_match(
    source,
    candidates,
    threshold=0.86,
):
    source_key = normalized_name(
        source
    )

    if not source_key:
        return None

    if source_key in candidates:
        return source_key

    scored = sorted(
        (
            (
                similarity(
                    source_key,
                    candidate,
                ),
                candidate,
            )
            for candidate in candidates
        ),
        reverse=True,
    )

    if not scored:
        return None

    best_score, best_key = scored[0]
    second_score = (
        scored[1][0]
        if len(scored) > 1
        else 0.0
    )

    # For very strong matches we accept even if another candidate is close.
    # Otherwise require some separation from the runner-up.
    if best_score >= 0.94:
        return best_key

    if (
        best_score >= threshold
        and (
            best_score
            - second_score
        ) >= 0.04
    ):
        return best_key

    return None


def number_text(value):
    value = (
        text(value)
        .translate(PERSIAN_DIGITS)
        .replace(",", "")
        .replace("٬", "")
        .replace("،", "")
        .replace("تومان", "")
        .replace("ریال", "")
        .replace("$", "")
        .strip()
    )

    # Legacy export prefixes Toman values with "T", e.g. "T 15950".
    value = re.sub(
        r"^[Tt]\s*",
        "",
        value,
    ).strip()

    if (
        value.startswith("(")
        and value.endswith(")")
    ):
        value = (
            f"-{value[1:-1]}"
        )

    return value


def decimal_value(
    value,
    default=ZERO,
):
    raw = number_text(
        value
    )

    if not raw:
        return Decimal(
            default
        )

    try:
        return Decimal(
            raw
        )
    except (
        InvalidOperation,
        ValueError,
    ) as exc:
        raise CommandError(
            f"Cannot parse numeric value {value!r}"
        ) from exc


def int_value(
    value,
    default=0,
):
    return int(
        decimal_value(
            value,
            Decimal(default),
        )
    )


def money_to_irr(
    value,
    unit,
):
    amount = decimal_value(
        value
    )

    if unit == "toman":
        amount *= TEN

    return amount.quantize(
        MONEY,
        rounding=ROUND_HALF_UP,
    )


def parse_date(value):
    raw = text(
        value
    ).translate(
        PERSIAN_DIGITS
    )

    if not raw:
        return date.today()

    try:
        return datetime.fromisoformat(
            raw.replace(
                "Z",
                "+00:00",
            )
        ).date()
    except ValueError:
        pass

    for fmt in (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%d-%m-%Y",
    ):
        try:
            parsed = datetime.strptime(
                raw,
                fmt,
            ).date()

            if (
                parsed.year
                >= 1900
            ):
                return parsed
        except ValueError:
            continue

    jalali = None

    if (
        "/" in raw
        or "-" in raw
    ):
        separator = (
            "/"
            if "/" in raw
            else "-"
        )
        parts = raw.split(
            separator
        )

        if (
            len(parts) == 3
            and parts[0].isdigit()
            and int(parts[0]) < 1700
        ):
            jalali = tuple(
                int(part)
                for part in parts
            )

    if jalali:
        try:
            import jdatetime
        except ImportError as exc:
            raise CommandError(
                f"Jalali date {raw!r} found. "
                "Install jdatetime with: pip install jdatetime"
            ) from exc

        return jdatetime.date(
            *jalali
        ).togregorian()

    raise CommandError(
        f"Cannot parse date {value!r}"
    )


def read_rows(path):
    try:
        handle = open(
            path,
            "r",
            encoding="utf-8-sig",
            newline="",
        )
    except FileNotFoundError as exc:
        raise CommandError(
            f"File not found: {path}"
        ) from exc

    with handle:
        reader = csv.DictReader(
            handle
        )

        if not reader.fieldnames:
            raise CommandError(
                f"CSV has no headers: {path}"
            )

        rows = [
            dict(row)
            for row in reader
            if any(
                text(value)
                for value
                in row.values()
            )
        ]

        return (
            list(
                reader.fieldnames
            ),
            rows,
        )


def generated_sku(
    product_name,
):
    digest = hashlib.sha1(
        normalized_name(
            product_name
        ).encode(
            "utf-8"
        )
    ).hexdigest()[
        :12
    ].upper()

    return (
        f"LEGACY-{digest}"
    )


class Command(BaseCommand):
    help = (
        "Import legacy Customers, Products and customer purchase-history CSVs. "
        "The Purchases CSV is treated as SALES history, not Procurement. "
        "Ambiguous composite rows, blank Customer master rows, "
        "and purchase-history rows with blank Product are skipped."
    )

    def add_arguments(
        self,
        parser,
    ):
        parser.add_argument(
            "--customers",
            default=(
                "seed_data/"
                "Customers-Grid view.csv"
            ),
        )
        parser.add_argument(
            "--products",
            default=(
                "seed_data/"
                "Products-Grid view.csv"
            ),
        )
        parser.add_argument(
            "--purchases",
            default=(
                "seed_data/"
                "Purchases-Grid view.csv"
            ),
        )
        parser.add_argument(
            "--money-unit",
            choices=(
                "toman",
                "irr",
            ),
            default="toman",
            help=(
                "Unit used by Selling Price, Invoice Amount, "
                "Paid Amount and Amount Remaining."
            ),
        )
        parser.add_argument(
            "--warehouse",
            default="انبار اصلی",
            help=(
                "Warehouse used for the CURRENT Stock snapshot "
                "from Products CSV."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
        )

    def handle(
        self,
        *args,
        **options,
    ):
        self.money_unit = (
            options[
                "money_unit"
            ]
        )

        (
            customer_headers,
            customer_rows,
        ) = read_rows(
            options[
                "customers"
            ]
        )

        (
            product_headers,
            product_rows,
        ) = read_rows(
            options[
                "products"
            ]
        )

        (
            purchase_headers,
            purchase_rows,
        ) = read_rows(
            options[
                "purchases"
            ]
        )

        self._validate_headers(
            customer_headers,
            product_headers,
            purchase_headers,
        )

        self._print_preflight(
            customer_rows,
            product_rows,
            purchase_rows,
        )

        if options[
            "dry_run"
        ]:
            self.stdout.write(
                self.style.SUCCESS(
                    "Dry-run completed. "
                    "No database rows were changed."
                )
            )
            return

        with transaction.atomic():
            user = (
                self._ensure_import_user()
            )

            warehouse, _ = (
                Warehouse.objects
                .get_or_create(
                    name=options[
                        "warehouse"
                    ],
                    defaults={
                        "location": "",
                    },
                )
            )

            clearing_account = (
                self._ensure_legacy_clearing_account()
            )

            customer_map = (
                self._import_customers(
                    customer_rows
                )
            )

            product_map = (
                self._import_products(
                    product_rows,
                    warehouse,
                    user,
                )
            )

            sale_stats = (
                self._import_legacy_sales(
                    purchase_rows,
                    customer_map,
                    product_map,
                    clearing_account,
                    user,
                )
            )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "Legacy import completed."
            )
        )
        self.stdout.write(
            f"Customers in map: "
            f"{len(customer_map)}"
        )
        self.stdout.write(
            f"Products in map: "
            f"{len(product_map)}"
        )
        self.stdout.write(
            f"Sales created: "
            f"{sale_stats['created']}"
        )
        self.stdout.write(
            f"Sales skipped (already imported): "
            f"{sale_stats['skipped']}"
        )
        self.stdout.write(
            f"Sales skipped (ambiguous quantity): "
            f"{sale_stats['skipped_ambiguous']}"
        )
        self.stdout.write(
            f"Sales skipped (blank Product): "
            f"{sale_stats['skipped_blank_product']}"
        )
        self.stdout.write(
            f"Placeholder products created: "
            f"{sale_stats['placeholder_products']}"
        )
        self.stdout.write(
            f"Composite product rows: "
            f"{sale_stats['composite_rows']}"
        )
        self.stdout.write(
            f"Composite quantity mismatches: "
            f"{sale_stats['composite_quantity_mismatches']}"
        )
        self.stdout.write(
            f"Source debt mismatches: "
            f"{sale_stats['debt_mismatches']}"
        )
        self.stdout.write("")
        self.stdout.write(
            "Refresh the frontend. "
            "Historical rows appear under "
            "Sales / Customers / Dashboard."
        )

    def _validate_headers(
        self,
        customer_headers,
        product_headers,
        purchase_headers,
    ):
        customer_required = {
            "Customer Name",
            "Phone",
        }
        product_required = {
            "Product Name",
            "Stock",
            "Selling Price",
        }
        purchase_required = {
            "Purchase ID",
            "Customer",
            "Product",
            "Quantity",
            "Invoice Amount",
            "Paid Amount",
            "Amount Remaining",
            "Purchase Date",
        }

        missing_customers = (
            customer_required
            - set(
                customer_headers
            )
        )
        missing_products = (
            product_required
            - set(
                product_headers
            )
        )
        missing_purchases = (
            purchase_required
            - set(
                purchase_headers
            )
        )

        if (
            missing_customers
            or missing_products
            or missing_purchases
        ):
            raise CommandError(
                "Unexpected CSV schema.\n"
                f"Missing customer columns: "
                f"{sorted(missing_customers)}\n"
                f"Missing product columns: "
                f"{sorted(missing_products)}\n"
                f"Missing purchase-history columns: "
                f"{sorted(missing_purchases)}"
            )

    def _print_preflight(
        self,
        customers,
        products,
        purchases,
    ):
        purchase_ids = [
            text(
                row.get(
                    "Purchase ID"
                )
            )
            for row in purchases
            if text(
                row.get(
                    "Purchase ID"
                )
            )
        ]

        duplicates = [
            purchase_id
            for (
                purchase_id,
                count,
            ) in Counter(
                purchase_ids
            ).items()
            if count > 1
        ]

        stages = sorted({
            text(
                row.get(
                    "Stage"
                )
            )
            for row in purchases
            if text(
                row.get(
                    "Stage"
                )
            )
        })

        blank_customer_rows = sum(
            1
            for row in customers
            if not clean_name(
                row.get(
                    "Customer Name"
                )
            )
        )

        customer_names = {
            normalized_name(
                row.get(
                    "Customer Name"
                )
            )
            for row in customers
            if clean_name(
                row.get(
                    "Customer Name"
                )
            )
        }

        product_names = {
            normalized_name(
                row.get(
                    "Product Name"
                )
            )
            for row in products
            if clean_name(
                row.get(
                    "Product Name"
                )
            )
        }

        unmatched_customers = set()
        unresolved_components = set()
        fuzzy_product_matches = []
        composite_rows = 0
        composite_quantity_mismatches = 0
        blank_purchase_product_rows = 0
        total_components = 0

        for row in purchases:
            customer_source = (
                clean_name(
                    row.get(
                        "Customer"
                    )
                )
            )

            if customer_source:
                customer_match = (
                    best_normalized_match(
                        customer_source,
                        customer_names,
                        threshold=0.91,
                    )
                )

                if customer_match is None:
                    unmatched_customers.add(
                        customer_source
                    )

            components = (
                split_product_names(
                    row.get(
                        "Product"
                    )
                )
            )

            if not components:
                blank_purchase_product_rows += 1
                continue

            total_components += len(
                components
            )

            if len(
                components
            ) > 1:
                composite_rows += 1

                source_qty = int_value(
                    row.get(
                        "Quantity"
                    ),
                    0,
                )

                if (
                    source_qty > 0
                    and source_qty
                    != len(
                        components
                    )
                ):
                    composite_quantity_mismatches += 1

            for component in components:
                exact_key = (
                    normalized_name(
                        component
                    )
                )

                if exact_key in product_names:
                    continue

                matched_key = (
                    best_normalized_match(
                        component,
                        product_names,
                        threshold=0.86,
                    )
                )

                if matched_key is None:
                    unresolved_components.add(
                        component
                    )
                else:
                    fuzzy_product_matches.append(
                        (
                            component,
                            matched_key,
                        )
                    )

        self.stdout.write(
            f"Customers: "
            f"{len(customers)}"
        )
        self.stdout.write(
            f"Blank Customer master rows that WILL be skipped: "
            f"{blank_customer_rows}"
        )
        self.stdout.write(
            f"Products: "
            f"{len(products)}"
        )
        self.stdout.write(
            f"Customer purchase-history rows: "
            f"{len(purchases)}"
        )
        self.stdout.write(
            f"Money unit: "
            f"{self.money_unit}"
        )
        self.stdout.write(
            f"Distinct Stage values: "
            f"{stages}"
        )
        self.stdout.write(
            f"Duplicate Purchase IDs: "
            f"{len(duplicates)}"
        )
        self.stdout.write(
            f"Composite Product rows: "
            f"{composite_rows}"
        )
        self.stdout.write(
            f"Product components after split: "
            f"{total_components}"
        )
        self.stdout.write(
            f"Composite rows where Quantity != component count: "
            f"{composite_quantity_mismatches}"
        )
        self.stdout.write(
            f"Purchase-history rows with blank Product that WILL be skipped: "
            f"{blank_purchase_product_rows}"
        )
        self.stdout.write(
            f"Rows that WILL be imported: "
            f"{len(purchases) - composite_quantity_mismatches - blank_purchase_product_rows}"
        )
        self.stdout.write(
            f"Rows that WILL be skipped as ambiguous: "
            f"{composite_quantity_mismatches}"
        )
        self.stdout.write(
            f"Rows that WILL be skipped for blank Product: "
            f"{blank_purchase_product_rows}"
        )
        self.stdout.write(
            f"Customer names unresolved after normalization/fuzzy match: "
            f"{len(unmatched_customers)}"
        )
        self.stdout.write(
            f"Product components unresolved after split/fuzzy match: "
            f"{len(unresolved_components)}"
        )
        self.stdout.write(
            f"Product components resolved by fuzzy match: "
            f"{len(fuzzy_product_matches)}"
        )

        if duplicates:
            self.stdout.write(
                self.style.WARNING(
                    "First duplicate Purchase IDs: "
                    + ", ".join(
                        duplicates[:10]
                    )
                )
            )

        if unmatched_customers:
            self.stdout.write(
                self.style.WARNING(
                    "First unresolved customers: "
                    + " | ".join(
                        sorted(
                            unmatched_customers
                        )[:10]
                    )
                )
            )

        if unresolved_components:
            self.stdout.write(
                self.style.WARNING(
                    "First unresolved product components "
                    "(import will create zero-stock placeholders): "
                    + " | ".join(
                        sorted(
                            unresolved_components
                        )[:15]
                    )
                )
            )

        if fuzzy_product_matches:
            sample = (
                fuzzy_product_matches[
                    :10
                ]
            )

            self.stdout.write(
                self.style.NOTICE(
                    "First fuzzy product mappings: "
                    + " | ".join(
                        f"{source!r} -> {target!r}"
                        for (
                            source,
                            target,
                        ) in sample
                    )
                )
            )

    def _ensure_import_user(
        self,
    ):
        role, _ = (
            Role.objects
            .get_or_create(
                code=(
                    Role.Code.STORE_MANAGER
                ),
                defaults={
                    "name": (
                        "Store Manager"
                    ),
                    "description": (
                        "Store manager role"
                    ),
                },
            )
        )

        User = get_user_model()

        user = (
            User.objects
            .filter(
                username=(
                    "legacy_importer"
                )
            )
            .first()
        )

        if user is None:
            user = User(
                username=(
                    "legacy_importer"
                ),
                email=(
                    "legacy_importer"
                    "@local.invalid"
                ),
                full_name=(
                    "Legacy CSV Importer"
                ),
                role=role,
            )
            user.set_unusable_password()
            user.save()

        return user

    def _ensure_legacy_clearing_account(
        self,
    ):
        account = (
            FinancialAccount.objects
            .filter(
                name=(
                    "Legacy Sales Clearing"
                ),
                currency_code="IRR",
            )
            .first()
        )

        if account is None:
            account = (
                FinancialAccount.objects
                .create(
                    name=(
                        "Legacy Sales Clearing"
                    ),
                    account_type="BANK",
                    currency_code="IRR",
                    current_balance=ZERO,
                    is_active=False,
                )
            )

        return account

    def _import_customers(
        self,
        rows,
    ):
        result = {}

        existing_customers = list(
            Customer.objects.all()
        )

        for (
            row_number,
            row,
        ) in enumerate(
            rows,
            start=2,
        ):
            name = clean_name(
                row.get(
                    "Customer Name"
                )
            )

            if not name:
                self.stdout.write(
                    self.style.WARNING(
                        f"SKIP blank customer master row "
                        f"{row_number}"
                    )
                )
                continue

            phone = text(
                row.get(
                    "Phone"
                )
            )

            customer = None

            if phone:
                customer = (
                    Customer.objects
                    .filter(
                        phone=phone
                    )
                    .first()
                )

            if customer is None:
                key = normalized_name(
                    name
                )

                for candidate in existing_customers:
                    if (
                        normalized_name(
                            candidate.full_name
                        )
                        == key
                    ):
                        customer = candidate
                        break

            if customer is None:
                customer = (
                    Customer.objects
                    .create(
                        full_name=name,
                        phone=phone,
                        instagram_handle=text(
                            row.get(
                                "Instagram ID"
                            )
                        ),
                        address=text(
                            row.get(
                                "Address"
                            )
                        ),
                    )
                )

                existing_customers.append(
                    customer
                )
            else:
                customer.full_name = (
                    name
                )
                customer.phone = phone
                customer.instagram_handle = (
                    text(
                        row.get(
                            "Instagram ID"
                        )
                    )
                )
                customer.address = text(
                    row.get(
                        "Address"
                    )
                )
                customer.save(
                    update_fields=[
                        "full_name",
                        "phone",
                        "instagram_handle",
                        "address",
                    ]
                )

            result[
                normalized_name(
                    name
                )
            ] = customer

        return result

    def _import_products(
        self,
        rows,
        warehouse,
        user,
    ):
        result = {}

        existing_products = list(
            Product.objects.all()
        )

        for (
            row_number,
            row,
        ) in enumerate(
            rows,
            start=2,
        ):
            name = clean_name(
                row.get(
                    "Product Name"
                )
            )

            if not name:
                raise CommandError(
                    f"Products row "
                    f"{row_number}: "
                    "Product Name is empty."
                )

            target_stock = max(
                int_value(
                    row.get(
                        "Stock"
                    ),
                    0,
                ),
                0,
            )

            sales_price_irr = (
                money_to_irr(
                    row.get(
                        "Selling Price"
                    ),
                    self.money_unit,
                )
            )

            sku = generated_sku(
                name
            )

            product = (
                Product.objects
                .filter(
                    sku=sku
                )
                .first()
            )

            if product is None:
                key = normalized_name(
                    name
                )

                for candidate in existing_products:
                    if (
                        normalized_name(
                            candidate.name
                        )
                        == key
                    ):
                        product = candidate
                        break

            if product is None:
                product = (
                    create_product_with_opening_stock(
                        name=name,
                        sku=sku,
                        category_name=(
                            "Legacy Import"
                        ),
                        brand_name=(
                            "Legacy Import"
                        ),
                        sales_price_irr=(
                            sales_price_irr
                        ),
                        default_cost_cad=ZERO,
                        reorder_level=0,
                        opening_stocks=[
                            {
                                "warehouse":
                                    warehouse,
                                "quantity":
                                    target_stock,
                            }
                        ],
                        created_by=user,
                    )
                )

                existing_products.append(
                    product
                )
            else:
                product.name = name
                product.sales_price_irr = (
                    sales_price_irr
                )
                product.save(
                    update_fields=[
                        "name",
                        "sales_price_irr",
                    ]
                )

                # The CSV Stock column is a CURRENT snapshot.
                # On the first import into this dedicated warehouse,
                # create that snapshot. On re-runs, do not overwrite
                # newer ERP inventory activity.
                Inventory.objects.get_or_create(
                    product=product,
                    warehouse=warehouse,
                    defaults={
                        "qty_on_hand":
                            target_stock,
                        "qty_reserved": 0,
                        "avg_cost_cad":
                            product.default_cost_cad,
                    },
                )

            result[
                normalized_name(
                    name
                )
            ] = product

        return result

    def _resolve_customer(
        self,
        source_name,
        customer_map,
    ):
        cleaned = clean_name(
            source_name
        )
        key = normalized_name(
            cleaned
        )

        if key in customer_map:
            return customer_map[
                key
            ]

        matched_key = (
            best_normalized_match(
                cleaned,
                set(
                    customer_map.keys()
                ),
                threshold=0.91,
            )
        )

        if (
            matched_key is not None
            and matched_key
            in customer_map
        ):
            return customer_map[
                matched_key
            ]

        customer = (
            Customer.objects
            .create(
                full_name=(
                    cleaned
                    or "Legacy Customer"
                )
            )
        )

        customer_map[
            key
        ] = customer

        return customer

    def _create_placeholder_product(
        self,
        name,
        product_map,
    ):
        name = (
            clean_name(
                name
            )
            or "Legacy Unknown Product"
        )
        sku = generated_sku(
            f"placeholder:{name}"
        )

        product = (
            Product.objects
            .filter(
                sku=sku
            )
            .first()
        )

        if product is None:
            # Reuse the normal Product creation service without opening stock.
            # The placeholder exists only so all historical SaleItems can be
            # represented without inventing current inventory.
            product = (
                create_product_with_opening_stock(
                    name=name,
                    sku=sku,
                    category_name=(
                        "Legacy Unmatched"
                    ),
                    brand_name=(
                        "Legacy Import"
                    ),
                    sales_price_irr=ZERO,
                    default_cost_cad=ZERO,
                    reorder_level=0,
                    opening_stocks=[],
                    created_by=(
                        self.import_user
                    ),
                )
            )

        product_map[
            normalized_name(
                name
            )
        ] = product

        return product

    def _resolve_product_component(
        self,
        source_name,
        product_map,
    ):
        cleaned = clean_name(
            source_name
        )
        key = normalized_name(
            cleaned
        )

        if key in product_map:
            return (
                product_map[
                    key
                ],
                False,
            )

        matched_key = (
            best_normalized_match(
                cleaned,
                set(
                    product_map.keys()
                ),
                threshold=0.86,
            )
        )

        if (
            matched_key is not None
            and matched_key
            in product_map
        ):
            return (
                product_map[
                    matched_key
                ],
                False,
            )

        product = (
            self._create_placeholder_product(
                cleaned,
                product_map,
            )
        )

        return (
            product,
            True,
        )

    def _invoice_number(
        self,
        row,
        row_number,
        seen_ids,
    ):
        source_id = text(
            row.get(
                "Purchase ID"
            )
        )

        if not source_id:
            return (
                f"LEGACY-ROW-"
                f"{row_number:06d}"
            )

        count = seen_ids[
            source_id
        ]

        seen_ids[
            source_id
        ] += 1

        base = (
            f"LEGACY-{source_id}"
        )[:100]

        if count == 0:
            return base

        suffix = (
            f"-{count + 1}"
        )

        return (
            base[
                : 100
                - len(
                    suffix
                )
            ]
            + suffix
        )

    def _allocate_invoice_amount(
        self,
        invoice_amount,
        line_specs,
    ):
        # There is no historical per-item amount in the source export.
        # For composite Product cells, allocate the invoice total using the
        # imported product selling prices as relative weights. If all weights
        # are zero, fall back to equal weights. The last line receives the
        # rounding remainder so the exact invoice total is preserved.
        weights = []

        for spec in line_specs:
            product = spec[
                "product"
            ]
            qty = spec[
                "quantity"
            ]

            weight = (
                Decimal(qty)
                * (
                    product.sales_price_irr
                    or ZERO
                )
            )

            weights.append(
                max(
                    weight,
                    ZERO,
                )
            )

        total_weight = sum(
            weights,
            ZERO,
        )

        if total_weight <= 0:
            weights = [
                Decimal("1")
                for _ in line_specs
            ]
            total_weight = Decimal(
                len(
                    line_specs
                )
            )

        allocations = []
        remaining = invoice_amount

        for index, weight in enumerate(
            weights
        ):
            if (
                index
                == len(
                    weights
                ) - 1
            ):
                allocation = remaining
            else:
                allocation = (
                    invoice_amount
                    * weight
                    / total_weight
                ).quantize(
                    MONEY,
                    rounding=(
                        ROUND_HALF_UP
                    ),
                )

                allocation = min(
                    allocation,
                    remaining,
                )

            allocations.append(
                allocation
            )
            remaining -= allocation

        return allocations

    def _import_legacy_sales(
        self,
        rows,
        customer_map,
        product_map,
        clearing_account,
        user,
    ):
        self.import_user = user

        stats = {
            "created": 0,
            "skipped": 0,
            "skipped_ambiguous": 0,
            "skipped_blank_product": 0,
            "debt_mismatches": 0,
            "placeholder_products": 0,
            "composite_rows": 0,
            "composite_quantity_mismatches": 0,
        }

        seen_ids = Counter()

        for (
            row_number,
            row,
        ) in enumerate(
            rows,
            start=2,
        ):
            invoice_number = (
                self._invoice_number(
                    row,
                    row_number,
                    seen_ids,
                )
            )

            if (
                Sale.objects
                .filter(
                    invoice_number=(
                        invoice_number
                    )
                )
                .exists()
            ):
                stats[
                    "skipped"
                ] += 1
                continue

            customer = (
                self._resolve_customer(
                    row.get(
                        "Customer"
                    ),
                    customer_map,
                )
            )

            product_components = (
                split_product_names(
                    row.get(
                        "Product"
                    )
                )
            )

            if not product_components:
                stats[
                    "skipped_blank_product"
                ] += 1

                self.stdout.write(
                    self.style.WARNING(
                        f"SKIP blank Product row {row_number} | "
                        f"Purchase ID={text(row.get('Purchase ID'))} | "
                        f"Customer={clean_name(row.get('Customer'))} | "
                        f"Invoice Amount={text(row.get('Invoice Amount'))}"
                    )
                )

                continue

            source_quantity = (
                int_value(
                    row.get(
                        "Quantity"
                    ),
                    0,
                )
            )

            if (
                len(
                    product_components
                ) == 1
            ):
                if source_quantity <= 0:
                    raise CommandError(
                        f"Purchases row "
                        f"{row_number}: "
                        "Quantity must be > 0."
                    )

                item_quantities = [
                    source_quantity
                ]
            else:
                stats[
                    "composite_rows"
                ] += 1

                if (
                    source_quantity <= 0
                    or source_quantity
                    != len(
                        product_components
                    )
                ):
                    stats[
                        "composite_quantity_mismatches"
                    ] += 1
                    stats[
                        "skipped_ambiguous"
                    ] += 1

                    self.stdout.write(
                        self.style.WARNING(
                            f"SKIP ambiguous row {row_number} | "
                            f"Purchase ID={text(row.get('Purchase ID'))} | "
                            f"Quantity={source_quantity} | "
                            f"components={len(product_components)} | "
                            f"Product={text(row.get('Product'))}"
                        )
                    )

                    continue

                # For composite rows where Quantity exactly equals the number
                # of listed products, each listed component is one unit.
                item_quantities = [
                    1
                    for _ in product_components
                ]

            line_specs = []

            for (
                component,
                item_quantity,
            ) in zip(
                product_components,
                item_quantities,
            ):
                (
                    product,
                    created_placeholder,
                ) = (
                    self._resolve_product_component(
                        component,
                        product_map,
                    )
                )

                if created_placeholder:
                    stats[
                        "placeholder_products"
                    ] += 1

                line_specs.append({
                    "source_name":
                        component,
                    "product":
                        product,
                    "quantity":
                        item_quantity,
                })

            invoice_amount = (
                money_to_irr(
                    row.get(
                        "Invoice Amount"
                    ),
                    self.money_unit,
                )
            )

            paid_amount = (
                money_to_irr(
                    row.get(
                        "Paid Amount"
                    ),
                    self.money_unit,
                )
            )

            source_remaining = (
                money_to_irr(
                    row.get(
                        "Amount Remaining"
                    ),
                    self.money_unit,
                )
            )

            if invoice_amount < 0:
                raise CommandError(
                    f"Purchases row "
                    f"{row_number}: "
                    "Invoice Amount "
                    "cannot be negative."
                )

            if paid_amount < 0:
                raise CommandError(
                    f"Purchases row "
                    f"{row_number}: "
                    "Paid Amount "
                    "cannot be negative."
                )

            if (
                paid_amount
                > invoice_amount
            ):
                raise CommandError(
                    f"Purchases row "
                    f"{row_number}: "
                    "Paid Amount exceeds "
                    "Invoice Amount."
                )

            purchase_date = (
                parse_date(
                    row.get(
                        "Purchase Date"
                    )
                )
            )

            stage = text(
                row.get(
                    "Stage"
                )
            )

            source_notes = text(
                row.get(
                    "Notes"
                )
            )

            notes_parts = [
                "[LEGACY_CSV_IMPORT]",
            ]

            if stage:
                notes_parts.append(
                    f"Stage: {stage}"
                )

            if (
                len(
                    product_components
                ) > 1
            ):
                notes_parts.append(
                    "Composite products: "
                    + ", ".join(
                        product_components
                    )
                )


            if source_notes:
                notes_parts.append(
                    source_notes
                )

            sale = (
                Sale.objects.create(
                    customer=customer,
                    invoice_number=(
                        invoice_number
                    ),
                    sale_date=(
                        purchase_date
                    ),
                    cad_rate_irr_per_cad=None,
                    notes=" | ".join(
                        notes_parts
                    ),
                    created_by_user=user,
                )
            )

            allocations = (
                self._allocate_invoice_amount(
                    invoice_amount,
                    line_specs,
                )
            )

            for (
                spec,
                line_total,
            ) in zip(
                line_specs,
                allocations,
            ):
                qty = spec[
                    "quantity"
                ]

                unit_price = (
                    line_total
                    / Decimal(qty)
                ).quantize(
                    MONEY,
                    rounding=(
                        ROUND_HALF_UP
                    ),
                )

                item = (
                    SaleItem.objects
                    .create(
                        sale=sale,
                        product=(
                            spec[
                                "product"
                            ]
                        ),
                        warehouse=None,
                        quantity=qty,
                        unit_price_irr=(
                            unit_price
                        ),
                        unit_cost_cad_snapshot=None,
                        line_cogs_cad=None,
                        line_cogs_irr=None,
                    )
                )

                # Preserve the exact allocated historical line amount despite
                # 2-decimal unit-price rounding.
                SaleItem.objects.filter(
                    pk=item.pk
                ).update(
                    line_total_irr=(
                        line_total
                    )
                )

            if paid_amount > 0:
                Payment.objects.create(
                    sale=sale,
                    account=(
                        clearing_account
                    ),
                    payment_date=(
                        purchase_date
                    ),
                    amount=(
                        paid_amount
                    ),
                    currency_code="IRR",
                    payment_method=(
                        "LEGACY_IMPORT"
                    ),
                    notes=(
                        "Historical payment "
                        "snapshot imported "
                        "from CSV. "
                        "It intentionally "
                        "does not change "
                        "current finance balance."
                    ),
                )

            recalculate_sale(
                sale.pk
            )

            sale.refresh_from_db()

            if (
                abs(
                    sale.total_debt
                    - source_remaining
                )
                > MONEY
            ):
                stats[
                    "debt_mismatches"
                ] += 1

                self.stdout.write(
                    self.style.WARNING(
                        f"Row "
                        f"{row_number} "
                        f"{invoice_number}: "
                        f"source remaining="
                        f"{source_remaining}, "
                        f"calculated="
                        f"{sale.total_debt}"
                    )
                )

            stats[
                "created"
            ] += 1

        return stats
