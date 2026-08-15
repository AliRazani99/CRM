from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class Inventory(models.Model):
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="inventory_records",
    )

    warehouse = models.ForeignKey(
        "parties.Warehouse",
        on_delete=models.PROTECT,
        related_name="inventory_records",
    )

    qty_on_hand = models.PositiveIntegerField(
        default=0,
    )

    qty_reserved = models.PositiveIntegerField(
        default=0,
    )

    qty_available = models.PositiveIntegerField(
        default=0,
    )

    avg_cost_cad = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    def save(self, *args, **kwargs):
        self.qty_available = self.qty_on_hand - self.qty_reserved

        update_fields = kwargs.get("update_fields")

        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {"qty_available"}

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product} - {self.warehouse}"

    class Meta:
        db_table = "inventory"

        constraints = [
            models.UniqueConstraint(
                fields=["product", "warehouse"],
                name="unique_inventory_product_warehouse",
            ),

            models.CheckConstraint(
                check=Q(qty_reserved__lte=F("qty_on_hand")),
                name="inventory_reserved_lte_on_hand",
            ),

            models.CheckConstraint(
                check=Q(
                    qty_available=F("qty_on_hand") - F("qty_reserved")
                ),
                name="inventory_available_matches_stock",
            ),
        ]


class StockMovement(models.Model):
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )

    warehouse = models.ForeignKey(
        "parties.Warehouse",
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )

    movement_type = models.CharField(
        max_length=30,
    )

    quantity = models.IntegerField()

    reference_type = models.CharField(
        max_length=50,
        blank=True,
    )

    reference_id = models.BigIntegerField(
        null=True,
        blank=True,
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_movements",
    )

    movement_date = models.DateTimeField(
        default=timezone.now,
    )

    notes = models.TextField(
        blank=True,
    )

    def __str__(self):
        return (
            f"{self.product} - "
            f"{self.warehouse} - "
            f"{self.movement_type} - "
            f"{self.quantity}"
        )

    class Meta:
        db_table = "stock_movements"

        constraints = [
            models.CheckConstraint(
                check=~Q(quantity=0),
                name="stock_movement_quantity_nonzero",
            ),
        ]


class StockTransfer(models.Model):
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="stock_transfers",
    )

    source_warehouse = models.ForeignKey(
        "parties.Warehouse",
        on_delete=models.PROTECT,
        related_name="outgoing_stock_transfers",
    )

    destination_warehouse = models.ForeignKey(
        "parties.Warehouse",
        on_delete=models.PROTECT,
        related_name="incoming_stock_transfers",
    )

    quantity = models.PositiveIntegerField()

    transfer_date = models.DateTimeField(
        default=timezone.now,
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_transfers",
    )

    notes = models.TextField(
        blank=True,
    )

    def __str__(self):
        return (
            f"{self.product}: "
            f"{self.source_warehouse} → "
            f"{self.destination_warehouse}"
        )

    class Meta:
        db_table = "stock_transfers"

        constraints = [
            models.CheckConstraint(
                check=Q(quantity__gt=0),
                name="stock_transfer_quantity_gt_zero",
            ),

            models.CheckConstraint(
                check=~Q(
                    source_warehouse=F("destination_warehouse")
                ),
                name="stock_transfer_different_warehouses",
            ),
        ]