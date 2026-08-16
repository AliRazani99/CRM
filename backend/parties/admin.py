from django.contrib import admin

from .models import (
    Customer,
    FinancialAccount,
    Supplier,
    Warehouse,
)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "full_name",
        "phone",
        "instagram_handle",
        "created_at",
    )

    search_fields = (
        "full_name",
        "phone",
        "instagram_handle",
    )


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "country",
        "created_at",
    )

    search_fields = (
        "name",
        "country",
    )


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "location",
        "created_at",
    )

    search_fields = (
        "name",
        "location",
    )


@admin.register(FinancialAccount)
class FinancialAccountAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "account_type",
        "currency_code",
        "current_balance",
        "is_active",
        "created_at",
    )

    list_filter = (
        "account_type",
        "currency_code",
        "is_active",
    )

    search_fields = (
        "name",
    )