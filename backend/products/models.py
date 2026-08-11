from django.db import models


class Category(models.Model):
    name = models.CharField(
        max_length=150,
        unique=True,
    )

    description = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return self.name

    class Meta:
        db_table = "categories"
        ordering = ["name"]


class Brand(models.Model):
    name = models.CharField(
        max_length=150,
        unique=True,
    )

    description = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return self.name

    class Meta:
        db_table = "brands"
        ordering = ["name"]


class Product(models.Model):
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="products",
    )

    brand = models.ForeignKey(
        Brand,
        on_delete=models.PROTECT,
        related_name="products",
    )

    name = models.CharField(
        max_length=255,
    )

    sku = models.CharField(
        max_length=100,
        unique=True,
    )

    sales_price_irr = models.DecimalField(
        max_digits=18,
        decimal_places=2,
    )

    default_cost_cad = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
    )

    reorder_level = models.PositiveIntegerField(
        default=0,
    )

    is_active = models.BooleanField(
        default=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    updated_at = models.DateTimeField(
        auto_now=True,
    )

    def __str__(self):
        return f"{self.name} ({self.sku})"

    class Meta:
        db_table = "products"
        ordering = ["name"]