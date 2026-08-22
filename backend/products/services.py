from django.core.exceptions import ValidationError
from django.db import transaction

from inventory.models import (
    Inventory,
    StockMovement,
)

from .models import (
    Brand,
    Category,
    Product,
)


def _get_or_create_category(name):
    normalized_name = name.strip()

    category = (
        Category.objects
        .filter(name__iexact=normalized_name)
        .first()
    )

    if category:
        return category

    return Category.objects.create(
        name=normalized_name,
    )


def _get_or_create_brand(name):
    normalized_name = name.strip()

    brand = (
        Brand.objects
        .filter(name__iexact=normalized_name)
        .first()
    )

    if brand:
        return brand

    return Brand.objects.create(
        name=normalized_name,
    )


@transaction.atomic
def create_product_with_opening_stock(
    *,
    name,
    sku,
    category_name,
    brand_name,
    sales_price_irr,
    default_cost_cad,
    reorder_level,
    opening_stocks,
    created_by,
):
    name = name.strip()
    sku = sku.strip().upper()
    category_name = category_name.strip()
    brand_name = brand_name.strip()

    if not name:
        raise ValidationError(
            "Product name is required."
        )

    if not sku:
        raise ValidationError(
            "SKU is required."
        )

    if not category_name:
        raise ValidationError(
            "Category is required."
        )

    if not brand_name:
        raise ValidationError(
            "Brand is required."
        )

    if Product.objects.filter(
        sku__iexact=sku
    ).exists():
        raise ValidationError(
            "This SKU already exists."
        )

    if sales_price_irr < 0:
        raise ValidationError(
            "Sales price cannot be negative."
        )

    if default_cost_cad < 0:
        raise ValidationError(
            "Default cost cannot be negative."
        )

    category = _get_or_create_category(
        category_name
    )

    brand = _get_or_create_brand(
        brand_name
    )

    product = Product.objects.create(
        name=name,
        sku=sku,
        category=category,
        brand=brand,
        sales_price_irr=sales_price_irr,
        default_cost_cad=default_cost_cad,
        reorder_level=reorder_level,
    )

    seen_warehouse_ids = set()

    for opening_stock in opening_stocks:
        warehouse = opening_stock[
            "warehouse"
        ]

        quantity = opening_stock[
            "quantity"
        ]

        if warehouse.pk in seen_warehouse_ids:
            raise ValidationError(
                "Duplicate warehouse in opening stock."
            )

        seen_warehouse_ids.add(
            warehouse.pk
        )

        if quantity < 0:
            raise ValidationError(
                "Opening stock cannot be negative."
            )

        Inventory.objects.create(
            product=product,
            warehouse=warehouse,
            qty_on_hand=quantity,
            qty_reserved=0,
            avg_cost_cad=default_cost_cad,
        )

        if quantity > 0:
            StockMovement.objects.create(
                product=product,
                warehouse=warehouse,
                movement_type="OPENING_BALANCE",
                quantity=quantity,
                reference_type="PRODUCT",
                reference_id=product.pk,
                created_by=created_by,
                notes="Opening stock",
            )

    return product