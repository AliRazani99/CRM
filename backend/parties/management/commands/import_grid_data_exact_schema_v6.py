"""Conservative, auditable import of the three legacy Grid CSV exports.

Install at backend/parties/management/commands/import_grid_data_exact_schema_v6.py
Requires the Customer.legacy_source_row and SaleItem historical metadata fields
specified in the accompanying migration instructions.

Run --dry-run first. Database writes require --apply. Historical invoices are
financial snapshots: neither live inventory nor live account balances change.
"""

import csv
import hashlib
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import Role
from parties.models import Customer, FinancialAccount, Warehouse
from products.models import Product
from products.services import create_product_with_opening_stock
from sales.models import Payment, Sale, SaleItem
from sales.services import recalculate_sale

CENT = Decimal("0.01")
ZERO = Decimal("0.00")
PERSIAN_DIGITS = str.maketrans(
    "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"
)
ARABIC_LETTERS = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک"})
INVISIBLE = re.compile(r"[\u200b\u200c\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]")
PHONE_IN_NAME = re.compile(r"(?<!\d)(?:\+98|0098|0)?9\d{9}(?!\d)")
INSTA_IN_NAME = re.compile(r"(?<!\w)@[a-zA-Z0-9._]{2,100}")
ADDRESS_HINTS = ("خیابان", "بزرگراه", "کوچه", "کد پستی", "کدپستی", "پلاک", "بلوار", "ساختمان", "دانشکده")


def text(value):
    return "" if value is None else str(value).strip()


def clean_name(value):
    result = unicodedata.normalize("NFKC", text(value)).translate(ARABIC_LETTERS)
    result = INVISIBLE.sub("", result)
    result = re.sub(r"\s+", " ", result).strip(" \t\r\n\"'“”‘’«»")
    return re.sub(r"\s+", " ", result).strip()


def normalized(value):
    return clean_name(value).casefold()


def digits(value):
    return text(value).translate(PERSIAN_DIGITS)


def source_ids(value):
    return re.findall(r"\d+", digits(value))


def product_components(value):
    return [clean_name(x) for x in re.split(r"\s*[,،;\n\r]+\s*", text(value)) if clean_name(x)]


def decimal_number(value):
    raw = digits(value).replace(",", "").replace("٬", "").strip()
    raw = re.sub(r"^[Tt]\s*", "", raw).strip()
    raw = raw.replace("تومان", "").replace("ریال", "").strip()
    if not raw:
        raise ValueError("missing amount")
    try:
        result = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError("invalid amount") from exc
    if not result.is_finite():
        raise ValueError("amount is not finite")
    return result


def amount_irr(value, money_unit):
    # The source prefix "T" does not establish the source's numeric scale.
    # Do not guess whether its numbers are tomans or thousands of tomans.
    factor = {
        "irr": Decimal("1"),
        "toman": Decimal("10"),
        "thousand-toman": Decimal("10000"),
    }[money_unit]
    return (decimal_number(value) * factor).quantize(CENT, rounding=ROUND_HALF_UP)


def positive_quantity(value):
    raw = digits(value).strip()
    if not re.fullmatch(r"\d+", raw):
        raise ValueError("quantity must be a positive integer")
    number = int(raw)
    if number <= 0:
        raise ValueError("quantity must be positive")
    return number


def parse_date(value):
    raw = digits(value).strip()
    if not raw:
        raise ValueError("purchase date is missing")
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError("unsupported purchase date; no current-date substitute")


def read_csv(path, required_columns):
    try:
        with open(path, encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                raise CommandError(f"CSV has no header: {path}")
            absent = set(required_columns) - set(reader.fieldnames)
            if absent:
                raise CommandError(f"Missing CSV columns in {path}: {sorted(absent)}")
            return [(number, row) for number, row in enumerate(reader, start=2)]
    except FileNotFoundError as exc:
        raise CommandError(f"File not found: {path}") from exc


def sku_for(name):
    digest = hashlib.sha1(normalized(name).encode("utf-8")).hexdigest()[:12].upper()
    return f"LEGACY-{digest}"


def recover_customer(raw_row, row_number, linked_sales, problems):
    """Only repair a packed name when its phone/handle delimit the fields."""
    name = clean_name(raw_row.get("Customer Name"))
    phone = digits(raw_row.get("Phone"))
    insta = text(raw_row.get("Instagram ID"))
    address = text(raw_row.get("Address"))
    if not name:
        problems.append(("customer", row_number, "", "EMPTY_CUSTOMER_NAME", "No customer name; row cannot be identified"))
        return None

    source_name = digits(name)
    embedded_phone = PHONE_IN_NAME.search(source_name) if not phone else None
    if embedded_phone:
        prefix = clean_name(source_name[:embedded_phone.start()])
        suffix = source_name[embedded_phone.end():].strip()
        words = prefix.split()
        if 2 <= len(words) <= 5 and not any(k in prefix for k in ADDRESS_HINTS):
            name = prefix
            phone = embedded_phone.group()
            match = INSTA_IN_NAME.search(suffix)
            if match and not insta:
                insta = match.group()
                suffix = (suffix[:match.start()] + " " + suffix[match.end():]).strip()
            if suffix and not address:
                address = suffix
            problems.append(("customer", row_number, "", "RECOVERED_PACKED_CONTACT", "Name/phone/address split only at explicit phone/handle delimiters"))
        else:
            problems.append(("customer", row_number, "", "EMBEDDED_PHONE_UNRESOLVED", "Review packed name manually"))

    if not linked_sales and not phone and not insta:
        normalized_digits = digits(name)
        if (
            re.fullmatch(r"[\d\s\-\+\(\)\.\/:،,]+", normalized_digits)
            or len(name) > 55
            or any(word in name for word in ADDRESS_HINTS)
        ):
            problems.append(("customer", row_number, "", "MALFORMED_NAME_SKIPPED", "Address/number-like name, no linked sale or contact"))
            return None

    if not phone and not insta:
        problems.append(("customer", row_number, "", "HISTORICAL_CONTACT_MISSING", "Import as legacy incomplete; new CRM entries still require contact"))
    if text(raw_row.get("Birth-month")):
        problems.append(("customer", row_number, "", "BIRTH_MONTH_ONLY", "Only month is known; cannot fabricate a full birth_date"))
    return {
        "name": name, "original_name": clean_name(raw_row.get("Customer Name")),
        "phone": phone, "instagram": insta, "address": address, "row": row_number,
    }


def unique_price_quantities(prices, quantity, invoice):
    """Find the *unique* positive-integer exact-price solution, if any.

    Even a unique numerical solution is an INFERENCE, not source-verified:
    the product's exported current selling price may differ from its past price.
    """
    if not prices or any(x <= 0 for x in prices) or quantity < len(prices):
        return None
    if len(prices) > 15 or quantity > 300:
        return None
    solutions = []

    def search(index, left_qty, left_amount, path):
        if len(solutions) > 1:
            return
        if index == len(prices) - 1:
            if left_qty >= 1 and left_amount == prices[index] * left_qty:
                solutions.append(path + [left_qty])
            return
        later = len(prices) - index - 1
        for q in range(1, left_qty - later + 1):
            remaining = left_amount - prices[index] * q
            if remaining < 0:
                break
            search(index + 1, left_qty - q, remaining, path + [q])
            if len(solutions) > 1:
                break

    search(0, quantity, invoice, [])
    return solutions[0] if len(solutions) == 1 else None


def distribute_amount(invoice, specs):
    """Allocations reconcile invoices; they are not historical item prices."""
    if len(specs) == 1:
        return [invoice], [False]
    known_prices = all(x["price"] is not None and x["price"] > 0 for x in specs)
    if known_prices:
        weights = [x["price"] * (x["quantity"] or 1) for x in specs]
        if all(x["quantity"] is not None for x in specs) and sum(weights, ZERO) == invoice:
            return weights, [False for _ in specs]
    else:
        # Unknown historical prices: equal accounting allocation, explicitly estimated.
        weights = [Decimal("1") for _ in specs]
    total = sum(weights, ZERO)
    allocations, remaining = [], invoice
    for idx, weight in enumerate(weights):
        part = remaining if idx == len(specs) - 1 else (invoice * weight / total).quantize(CENT, rounding=ROUND_HALF_UP)
        part = min(part, remaining)
        allocations.append(part)
        remaining -= part
    return allocations, [True for _ in specs]


def make_plan(customers, products, purchases, money_unit):
    problems = []
    summary = Counter()
    customer_rows = {row: data for row, data in customers}
    product_rows = {row: data for row, data in products}
    customer_links = defaultdict(list)
    product_links = defaultdict(list)
    master_purchase_ids = set()

    for row_id, raw in customers:
        for purchase_id in source_ids(raw.get("Purchases")):
            customer_links[purchase_id].append(row_id)
            master_purchase_ids.add(purchase_id)

    for row_id, raw in products:
        for purchase_id in source_ids(raw.get("Purchases")):
            product_links[purchase_id].append(row_id)
            master_purchase_ids.add(purchase_id)

    seen_purchase_ids = set()
    for row_number, raw in purchases:
        purchase_id = text(raw.get("Purchase ID"))
        if not purchase_id:
            raise CommandError(f"Purchase row {row_number} has blank Purchase ID")
        if purchase_id in seen_purchase_ids:
            raise CommandError(f"Duplicate Purchase ID {purchase_id}; refusing to mix invoices")
        seen_purchase_ids.add(purchase_id)

    orphan_links = master_purchase_ids - seen_purchase_ids
    for purchase_id in sorted(orphan_links):
        problems.append(("purchase", "", purchase_id, "ORPHAN_MASTER_LINK", "Purchase ID mentioned by master CSV but absent from purchases CSV"))

    valid_customers = {}
    for row_id, raw in customers:
        entry = recover_customer(raw, row_id, customer_links_for_row(raw), problems)
        if entry is not None:
            valid_customers[row_id] = entry

    normalized_products = defaultdict(list)
    for row_id, raw in products:
        name = clean_name(raw.get("Product Name"))
        if not name:
            problems.append(("product", row_id, "", "BLANK_PRODUCT_NAME", "Product master row skipped"))
            continue
        stock_raw = text(raw.get("Stock"))
        price_raw = text(raw.get("Selling Price"))
        stock = None
        price = None
        if stock_raw:
            try:
                stock = int(positive_quantity(stock_raw))
            except ValueError:
                if digits(stock_raw).strip() == "0":
                    stock = 0
                else:
                    problems.append(("product", row_id, "", "INVALID_STOCK", "Stock is not a nonnegative integer; treat as unknown"))
        else:
            summary["stock_missing"] += 1
        if price_raw:
            try:
                price = amount_irr(price_raw, money_unit)
                if price < 0:
                    raise ValueError("negative")
            except ValueError:
                problems.append(("product", row_id, "", "INVALID_PRICE", "Invalid selling price; treat as unknown"))
                price = None
        else:
            summary["price_missing"] += 1
        product_rows[row_id] = {"name": name, "stock": stock, "price": price, "row": row_id}
        normalized_products[normalized(name)].append(row_id)

    for name, row_ids in normalized_products.items():
        if len(row_ids) > 1:
            problems.append(("product", ",".join(map(str, row_ids)), "", "DUPLICATE_MASTER_NAME", "Same normalized product name appears in multiple master rows; merged by name"))

    invoice_plan = []
    for row_id, raw in purchases:
        purchase_id = text(raw.get("Purchase ID"))
        source_customer = clean_name(raw.get("Customer"))
        source_product = text(raw.get("Product"))
        invoice_raw = text(raw.get("Invoice Amount"))
        if not source_customer and not source_product and not invoice_raw:
            # Source has placeholder rows; do not fabricate a sale for these.
            summary["empty_purchase_rows"] += 1
            problems.append(("purchase", row_id, purchase_id, "BLANK_PURCHASE_ROW", "No customer/product/invoice; not a sale"))
            continue
        try:
            invoice = amount_irr(raw.get("Invoice Amount"), money_unit)
            paid = amount_irr(raw.get("Paid Amount"), money_unit)
            remaining = amount_irr(raw.get("Amount Remaining"), money_unit)
            quantity = positive_quantity(raw.get("Quantity"))
            sale_date = parse_date(raw.get("Purchase Date"))
            if invoice < 0 or paid < 0 or paid > invoice or invoice - paid != remaining:
                raise ValueError("invoice / paid / debt amounts contradict each other")
        except ValueError as exc:
            problems.append(("purchase", row_id, purchase_id, "INVALID_FINANCIAL_ROW", str(exc)))
            summary["invalid_purchase_rows"] += 1
            continue
        linked_customers = customer_links[purchase_id]
        if len(linked_customers) != 1 or linked_customers[0] not in valid_customers:
            problems.append(("purchase", row_id, purchase_id, "CUSTOMER_LINK_MISSING_OR_AMBIGUOUS", "Cannot safely identify one master customer"))
            summary["invalid_purchase_rows"] += 1
            continue
        linked_products = product_links[purchase_id]
        components = product_components(source_product)
        specs = []
        if linked_products:
            if Counter(normalized(x) for x in components) != Counter(
                normalized(product_rows[x]["name"]) for x in linked_products
            ):
                problems.append(("purchase", row_id, purchase_id, "PRODUCT_TEXT_MISMATCH", "Master backlinks used; Product cell text does not match"))
            for linked_id in linked_products:
                specs.append({"source_row": linked_id, "name": product_rows[linked_id]["name"], "price": product_rows[linked_id]["price"]})
        else:
            if components:
                problems.append(("purchase", row_id, purchase_id, "PRODUCT_LINK_MISSING", "No master backlink: retaining item text with unknown product master"))
                for name in components:
                    choices = normalized_products.get(normalized(name), [])
                    linked_id = choices[0] if len(choices) == 1 else None
                    specs.append({"source_row": linked_id, "name": name, "price": product_rows[linked_id]["price"] if linked_id is not None else None})
            else:
                problems.append(("purchase", row_id, purchase_id, "PRODUCT_IDENTITY_UNKNOWN", "Invoice and customer preserved; source product blank"))
                specs.append({"source_row": None, "name": "محصول نامشخص - فاکتور تاریخی", "price": None})
                summary["unknown_product_invoices"] += 1

        if len(specs) == 1:
            specs[0]["quantity"] = quantity
            specs[0]["quantity_source"] = "SOURCE"
        elif quantity == len(specs):
            for spec in specs:
                spec["quantity"] = 1
                spec["quantity_source"] = "SOURCE"
        else:
            prices = [x["price"] for x in specs]
            solution = unique_price_quantities(prices, quantity, invoice) if all(x is not None for x in prices) else None
            if solution is not None:
                for spec, q in zip(specs, solution):
                    spec["quantity"] = q
                    spec["quantity_source"] = "INFERRED"
                summary["quantity_inferred_invoices"] += 1
                problems.append(("purchase", row_id, purchase_id, "QUANTITY_INFERRED", "Unique price-based mathematical solution; NOT source-verified"))
            else:
                for spec in specs:
                    spec["quantity"] = None
                    spec["quantity_source"] = "UNKNOWN"
                summary["quantity_unknown_invoices"] += 1
                problems.append(("purchase", row_id, purchase_id, "QUANTITY_UNKNOWN", f"{quantity} total items across {len(specs)} distinct listed components; per-item quantities unknown"))
        amounts, estimated = distribute_amount(invoice, specs)
        for spec, line_amount, is_estimated in zip(specs, amounts, estimated):
            spec["line_total"] = line_amount
            spec["line_amount_estimated"] = is_estimated
        invoice_plan.append({
            "source_row": row_id, "purchase_id": purchase_id,
            "customer_row": linked_customers[0], "date": sale_date,
            "invoice": invoice, "paid": paid, "remaining": remaining,
            "total_quantity": quantity, "items": specs,
            "stage": text(raw.get("Stage")), "notes": text(raw.get("Notes")),
        })
        summary["planned_invoices"] += 1
        summary["planned_items"] += len(specs)
        if any(x["line_amount_estimated"] for x in specs):
            summary["estimated_line_amount_invoices"] += 1
    summary["customer_master_rows"] = len(customers)
    summary["usable_customers"] = len(valid_customers)
    summary["product_master_rows"] = len(products)
    summary["purchase_source_rows"] = len(purchases)
    return valid_customers, product_rows, invoice_plan, problems, summary


def customer_links_for_row(raw):
    return source_ids(raw.get("Purchases"))


def write_review(path, issues):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["entity", "csv_row", "purchase_id", "issue", "details"])
        writer.writerows(issues)
    return target


class Command(BaseCommand):
    help = "Import legacy CSV history with exact master backlinks, audited unknown quantities and correct IRR units."

    def add_arguments(self, parser):
        parser.add_argument("--customers", default="seed_data/Customers-Grid view.csv")
        parser.add_argument("--products", default="seed_data/Products-Grid view.csv")
        parser.add_argument("--purchases", default="seed_data/Purchases-Grid view.csv")
        parser.add_argument("--money-unit", choices=("toman", "thousand-toman", "irr"), required=True,
                            help="REQUIRED: confirm the source amounts mean toman, thousand-toman, or IRR")
        parser.add_argument("--warehouse", default="انبار اصلی")
        parser.add_argument("--report", default="legacy_import_review.csv")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--apply", action="store_true")
        parser.add_argument(
            "--purge-malformed-source-rows", action="store_true",
            help="Only with --apply: delete strictly matched, unlinked, contactless bad-name rows left by v5",
        )

    def handle(self, *args, **options):
        if options["apply"] and options["dry_run"]:
            raise CommandError("Use either --dry-run or --apply, not both")
        if options["purge_malformed_source_rows"] and not options["apply"]:
            raise CommandError("--purge-malformed-source-rows requires --apply and a database backup")
        customer_csv = read_csv(options["customers"], ("Customer Name", "Phone", "Instagram ID", "Address", "Purchases"))
        product_csv = read_csv(options["products"], ("Product Name", "Stock", "Selling Price", "Purchases"))
        purchase_csv = read_csv(options["purchases"], (
            "Purchase ID", "Customer", "Product", "Quantity",
            "Invoice Amount", "Paid Amount", "Amount Remaining", "Purchase Date",
        ))
        customers, products, plan, issues, summary = make_plan(
            customer_csv, product_csv, purchase_csv, options["money_unit"]
        )
        report_path = write_review(options["report"], issues)
        self.stdout.write(f"Source money unit: {options['money_unit']} (explicit choice)")
        if plan:
            self.stdout.write(f"Sample: invoice {plan[0]['purchase_id']} = {plan[0]['invoice']} IRR")
        self.stdout.write("CSV preflight summary:")
        for key, value in sorted(summary.items()):
            self.stdout.write(f"  {key}: {value}")
        self.stdout.write(f"Review report: {report_path}")
        if summary["invalid_purchase_rows"]:
            raise CommandError("Unsafe financial/link rows detected. Review CSV and report before applying.")
        if not options["apply"]:
            self.stdout.write(self.style.SUCCESS("Dry-run completed: no database writes."))
            return

        # This command should never silently skip old v5 invoices with wrong
        # currency conversion or silently overwrite newer invoice settlements.
        if Sale.objects.filter(notes__contains="[LEGACY_CSV_IMPORT]").exists():
            raise CommandError(
                "Existing legacy CSV sales detected. Back up the DB and use the "
                "safe delete_legacy_csv_import command BEFORE --apply; do not "
                "re-import over existing historical invoices."
            )
        required_customer_fields = {"legacy_source_row"}
        required_item_fields = {"is_historical", "quantity_source", "line_amount_estimated"}
        if not required_customer_fields.issubset({x.name for x in Customer._meta.fields}):
            raise CommandError("Add Customer.legacy_source_row and run parties migrations first")
        if not required_item_fields.issubset({x.name for x in SaleItem._meta.fields}):
            raise CommandError("Add SaleItem historical fields and run sales migrations first")
        if not SaleItem._meta.get_field("quantity").null:
            raise CommandError("Make SaleItem.quantity nullable and run sales migrations first")

        with transaction.atomic():
            if options["purge_malformed_source_rows"]:
                self._purge_strictly_identified_bad_v5_customers(customer_csv, issues)
            user = self._import_user()
            warehouse, _ = Warehouse.objects.get_or_create(name=options["warehouse"], defaults={"location": ""})
            account, _ = FinancialAccount.objects.get_or_create(
                name="Legacy Sales Clearing", currency_code="IRR",
                defaults={"account_type": "BANK", "current_balance": ZERO, "is_active": False},
            )
            if account.is_active:
                raise CommandError("Legacy Sales Clearing account must be inactive")
            customer_map = self._import_customers(customers)
            product_map = self._import_products(products, warehouse, user)
            source_products = {normalized(entry["name"]): product_map[row] for row, entry in products.items()}
            missing = None
            for invoice in plan:
                number = f"LEGACY-{invoice['purchase_id']}"[:100]
                if Sale.objects.filter(invoice_number=number).exists():
                    raise CommandError(f"Invoice {number} already exists; no accidental overwrite")
                cust = customer_map[invoice["customer_row"]]
                meta = (
                    f"[LEGACY_CSV_IMPORT] | Source ID: {invoice['purchase_id']} | "
                    f"Source total quantity: {invoice['total_quantity']} | "
                    "Item-line prices may be allocated estimates; check review CSV."
                )
                if invoice["stage"]:
                    meta += f" | Stage: {invoice['stage']}"
                if invoice["notes"]:
                    meta += f" | {invoice['notes']}"
                sale = Sale.objects.create(
                    customer=cust, invoice_number=number, sale_date=invoice["date"],
                    cad_rate_irr_per_cad=None, created_by_user=user, notes=meta,
                )
                for spec in invoice["items"]:
                    if spec["source_row"] is not None:
                        product = product_map[spec["source_row"]]
                    elif normalized(spec["name"]) in source_products:
                        product = source_products[normalized(spec["name"])]
                    else:
                        if missing is None and spec["name"] == "محصول نامشخص - فاکتور تاریخی":
                            missing = self._placeholder_product(spec["name"], user)
                        product = missing if spec["name"] == "محصول نامشخص - فاکتور تاریخی" else self._placeholder_product(spec["name"], user)
                    qty = spec["quantity"]
                    unit_price = (
                        (spec["line_total"] / Decimal(qty)).quantize(CENT, rounding=ROUND_HALF_UP)
                        if qty is not None else ZERO
                    )
                    # Historical snapshots do not decrease current stock.
                    SaleItem.objects.create(
                        sale=sale, product=product, warehouse=None, quantity=qty,
                        unit_price_irr=unit_price, line_total_irr=spec["line_total"],
                        is_historical=True, quantity_source=spec["quantity_source"],
                        line_amount_estimated=spec["line_amount_estimated"],
                        unit_cost_cad_snapshot=None, line_cogs_cad=None, line_cogs_irr=None,
                    )
                if invoice["paid"] > 0:
                    Payment.objects.create(
                        sale=sale, account=account, payment_date=invoice["date"],
                        amount=invoice["paid"], currency_code="IRR", payment_method="LEGACY_IMPORT",
                        notes="Imported historical payment; does NOT affect live financial balances.",
                    )
                recalculate_sale(sale.pk)
                sale.refresh_from_db()
                if sale.total_amount != invoice["invoice"] or sale.total_debt != invoice["remaining"]:
                    raise CommandError(f"Reconciliation failed: {number}; rolling back whole import")
        self.stdout.write(self.style.SUCCESS(
            f"Imported {len(plan)} historical invoices and {summary['planned_items']} items. "
            "All invoice totals and debts reconcile; no live stock or financial balances were changed."
        ))

    def _purge_strictly_identified_bad_v5_customers(self, customer_csv, issues):
        malformed_rows = {
            int(issue[1]) for issue in issues if issue[3] == "MALFORMED_NAME_SKIPPED"
        }
        purged = 0
        for row_id, row in customer_csv:
            if row_id not in malformed_rows or source_ids(row.get("Purchases")):
                continue
            bad_name = clean_name(row.get("Customer Name"))
            candidates = list(Customer.objects.filter(
                full_name=bad_name,
                phone="",
                instagram_handle="",
                address="",
                legacy_source_row__isnull=True,
                sales__isnull=True,
                receivables__isnull=True,
            ).distinct())
            if len(candidates) != 1:
                continue
            candidate = candidates[0]
            if getattr(candidate, "email", "") or getattr(candidate, "birth_date", None):
                continue
            # The exact malformed source string, empty contact/profile, and
            # no sales/receivables must *all* match before optional deletion.
            candidate.delete()
            purged += 1
        self.stdout.write(f"Safely purged {purged} exact malformed v5 customer rows")

    @staticmethod
    def _import_user():
        role, _ = Role.objects.get_or_create(
            code=Role.Code.STORE_MANAGER,
            defaults={"name": "Store Manager", "description": "Store manager role"},
        )
        User = get_user_model()
        user, created = User.objects.get_or_create(
            username="legacy_importer",
            defaults={"email": "legacy_importer@local.invalid", "full_name": "Legacy CSV Importer", "role": role},
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        return user

    def _import_customers(self, rows):
        mapping = {}
        canonical_rows = {}
        for row_id, entry in rows.items():
            name, phone, instagram = entry["name"], entry["phone"], entry["instagram"]
            # An exact-contact duplicate source row can map to one person.
            # Never merge contactless rows based solely on a common name.
            fingerprint = (normalized(name), digits(phone), normalized(instagram))
            if not phone and not instagram:
                fingerprint += (row_id,)
            if fingerprint in canonical_rows:
                mapping[row_id] = mapping[canonical_rows[fingerprint]]
                continue
            canonical_rows[fingerprint] = row_id
            customer = Customer.objects.filter(legacy_source_row=row_id).first()
            if customer is None:
                candidates = [
                    person for person in Customer.objects.filter(full_name=name, legacy_source_row__isnull=True)
                    if (phone and digits(person.phone) == phone)
                    or (not phone and instagram and person.instagram_handle == instagram)
                    or (not phone and not instagram and not person.phone and not person.instagram_handle)
                ]
                customer = candidates[0] if len(candidates) == 1 else None
            if customer is None and entry["original_name"] != name:
                # Safely repair one v5 master row that stored a phone/address
                # inside full_name instead of creating a second customer.
                packed = list(Customer.objects.filter(
                    full_name=entry["original_name"],
                    legacy_source_row__isnull=True,
                    sales__isnull=True,
                    phone="",
                    instagram_handle="",
                ).distinct())
                if len(packed) == 1:
                    customer = packed[0]
            if customer is None:
                customer = Customer.objects.create(
                    legacy_source_row=row_id, full_name=name, phone=phone,
                    instagram_handle=instagram, address=entry["address"],
                )
            else:
                # Do not erase contact details later added by CRM users.
                updates = []
                if entry["original_name"] != name and customer.full_name == entry["original_name"]:
                    customer.full_name = name
                    updates.append("full_name")
                if customer.legacy_source_row is None:
                    customer.legacy_source_row = row_id
                    updates.append("legacy_source_row")
                if not customer.phone and phone:
                    customer.phone = phone
                    updates.append("phone")
                if not customer.instagram_handle and instagram:
                    customer.instagram_handle = instagram
                    updates.append("instagram_handle")
                if not customer.address and entry["address"]:
                    customer.address = entry["address"]
                    updates.append("address")
                if updates:
                    customer.save(update_fields=updates)
            mapping[row_id] = customer
        return mapping

    def _import_products(self, rows, warehouse, user):
        mapping = {}
        cache = {}
        for row_id, entry in rows.items():
            name = entry["name"]
            key = normalized(name)
            if key in cache:
                mapping[row_id] = cache[key]
                continue
            sku = sku_for(name)
            product = Product.objects.filter(sku=sku).first()
            if product is None:
                opening = [] if entry["stock"] is None else [{"warehouse": warehouse, "quantity": entry["stock"]}]
                product = create_product_with_opening_stock(
                    name=name, sku=sku, category_name="Legacy Import", brand_name="Legacy Import",
                    sales_price_irr=entry["price"] if entry["price"] is not None else ZERO,
                    default_cost_cad=ZERO, reorder_level=0,
                    opening_stocks=opening, created_by=user,
                )
            elif (
                entry["price"] is not None
                and product.category.name == "Legacy Import"
                and product.sales_price_irr == entry["price"] * Decimal("1000")
            ):
                # Correct only an identifiable factor-1000 mismatch when the
                # selected source unit explicitly differs from the old scale.
                # Never overwrite an ordinary ERP product or a manually edited price.
                product.sales_price_irr = entry["price"]
                product.save(update_fields=["sales_price_irr"])
            cache[key] = product
            mapping[row_id] = product
        return mapping

    @staticmethod
    def _placeholder_product(name, user):
        key = sku_for("missing historical product:" + name)
        product = Product.objects.filter(sku=key).first()
        if product is not None:
            return product
        return create_product_with_opening_stock(
            name=name, sku=key, category_name="Legacy Unmatched", brand_name="Legacy Import",
            sales_price_irr=ZERO, default_cost_cad=ZERO, reorder_level=0,
            opening_stocks=[], created_by=user,
        )
