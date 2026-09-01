from django.core.exceptions import (
    ValidationError,
)
from django.db import transaction

from .models import (
    Inventory,
    StockMovement,
    StockTransfer,
)


@transaction.atomic
def transfer_stock(
    *,
    product,
    source_warehouse,
    destination_warehouse,
    quantity,
    created_by,
    notes="",
):
    if (
        source_warehouse.pk
        == destination_warehouse.pk
    ):
        raise ValidationError(
            "Source and destination warehouses "
            "must be different."
        )

    if quantity <= 0:
        raise ValidationError(
            "Transfer quantity must be "
            "greater than zero."
        )

    inventory_rows = (
        Inventory.objects
        .select_for_update()
        .filter(
            product=product,
            warehouse__in=[
                source_warehouse,
                destination_warehouse,
            ],
        )
        .order_by("warehouse_id")
    )

    inventory_map = {
        row.warehouse_id: row
        for row in inventory_rows
    }

    source_inventory = inventory_map.get(
        source_warehouse.pk
    )

    if source_inventory is None:
        raise ValidationError(
            "Source inventory does not exist."
        )

    if (
        source_inventory.qty_available
        < quantity
    ):
        raise ValidationError(
            "Insufficient available stock."
        )

    destination_inventory = (
        inventory_map.get(
            destination_warehouse.pk
        )
    )

    if destination_inventory is None:
        destination_inventory = (
            Inventory.objects.create(
                product=product,
                warehouse=destination_warehouse,
                qty_on_hand=0,
                qty_reserved=0,
                avg_cost_cad=(
                    source_inventory.avg_cost_cad
                ),
            )
        )

    destination_qty_before = (
        destination_inventory.qty_on_hand
    )
    destination_cost_before = (
        destination_inventory.avg_cost_cad
    )
    source_cost = (
        source_inventory.avg_cost_cad
    )

    destination_qty_after = (
        destination_qty_before
        + quantity
    )

    destination_cost_after = (
        (
            destination_qty_before
            * destination_cost_before
        )
        + (
            quantity
            * source_cost
        )
    ) / destination_qty_after

    source_inventory.qty_on_hand -= (
        quantity
    )
    source_inventory.save(
        update_fields=[
            "qty_on_hand",
        ]
    )

    destination_inventory.qty_on_hand = (
        destination_qty_after
    )
    destination_inventory.avg_cost_cad = (
        destination_cost_after
    )
    destination_inventory.save(
        update_fields=[
            "qty_on_hand",
            "avg_cost_cad",
        ]
    )

    stock_transfer = (
        StockTransfer.objects.create(
            product=product,
            source_warehouse=(
                source_warehouse
            ),
            destination_warehouse=(
                destination_warehouse
            ),
            quantity=quantity,
            created_by=created_by,
            notes=notes,
        )
    )

    StockMovement.objects.create(
        product=product,
        warehouse=source_warehouse,
        movement_type="TRANSFER_OUT",
        quantity=-quantity,
        reference_type="STOCK_TRANSFER",
        reference_id=stock_transfer.pk,
        created_by=created_by,
        notes=notes,
    )

    StockMovement.objects.create(
        product=product,
        warehouse=destination_warehouse,
        movement_type="TRANSFER_IN",
        quantity=quantity,
        reference_type="STOCK_TRANSFER",
        reference_id=stock_transfer.pk,
        created_by=created_by,
        notes=notes,
    )

    return stock_transfer