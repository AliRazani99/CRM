from django.contrib import admin

from .models import Brand, Category, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "created_at",
    )

    search_fields = (
        "name",
    )


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "created_at",
    )

    search_fields = (
        "name",
    )


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "sku",
        "name",
        "category",
        "brand",
        "sales_price_irr",
        "default_cost_cad",
        "reorder_level",
        "is_active",
    )

    list_filter = (
        "category",
        "brand",
        "is_active",
    )

    search_fields = (
        "name",
        "sku",
    )