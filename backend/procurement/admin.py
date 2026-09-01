from django.contrib import admin

from .models import Purchase, PurchaseItem, PurchasePayment


class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 0


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "purchase_number",
        "supplier",
        "warehouse",
        "purchase_date",
        "purchase_currency",
        "paid_amount",
        "paying_account",
        "created_by",
        "created_at",
    )

    list_filter = (
        "purchase_currency",
        "warehouse",
        "purchase_date",
    )

    search_fields = (
        "purchase_number",
        "supplier__name",
    )

    inlines = [
        PurchaseItemInline,
    ]


@admin.register(PurchaseItem)
class PurchaseItemAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "purchase",
        "product",
        "quantity",
        "unit_cost",
        "row_discount",
        "landed_cost_per_unit",
        "line_total",
    )

    search_fields = (
        "purchase__purchase_number",
        "product__name",
        "product__sku",
    )

@admin.register(PurchasePayment)
class PurchasePaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "purchase",
        "account",
        "payment_date",
        "amount",
        "currency_code",
        "payment_type",
        "created_at",
    )

    list_filter = (
        "currency_code",
        "payment_type",
        "payment_date",
    )

    search_fields = (
        "purchase__purchase_number",
        "account__name",
    )