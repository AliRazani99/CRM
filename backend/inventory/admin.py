from django.contrib import admin

from .models import (
    Inventory,
    StockMovement,
    StockTransfer,
)


@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "product",
        "warehouse",
        "qty_on_hand",
        "qty_reserved",
        "qty_available",
        "avg_cost_cad",
        "updated_at",
    )

    list_filter = (
        "warehouse",
    )

    search_fields = (
        "product__name",
        "product__sku",
        "warehouse__name",
    )


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "product",
        "warehouse",
        "movement_type",
        "quantity",
        "reference_type",
        "reference_id",
        "created_by",
        "movement_date",
    )

    list_filter = (
        "movement_type",
        "warehouse",
        "movement_date",
    )

    search_fields = (
        "product__name",
        "product__sku",
        "reference_type",
    )


@admin.register(StockTransfer)
class StockTransferAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "product",
        "source_warehouse",
        "destination_warehouse",
        "quantity",
        "transfer_date",
        "created_by",
    )

    list_filter = (
        "source_warehouse",
        "destination_warehouse",
        "transfer_date",
    )

    search_fields = (
        "product__name",
        "product__sku",
    )