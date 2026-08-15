from django.db import models


class Customer(models.Model):
    full_name = models.CharField(
        max_length=255,
    )

    phone = models.CharField(
        max_length=30,
        blank=True,
    )

    instagram_handle = models.CharField(
        max_length=100,
        blank=True,
    )

    postal_code = models.CharField(
        max_length=30,
        blank=True,
    )

    address = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return self.full_name

    class Meta:
        db_table = "customers"


class Supplier(models.Model):
    name = models.CharField(
        max_length=255,
    )

    country = models.CharField(
        max_length=100,
        blank=True,
    )

    contact_info = models.TextField(
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return self.name

    class Meta:
        db_table = "suppliers"


class Warehouse(models.Model):
    name = models.CharField(
        max_length=255,
    )

    location = models.CharField(
        max_length=255,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return self.name

    class Meta:
        db_table = "warehouses"


class FinancialAccount(models.Model):
    name = models.CharField(
        max_length=255,
    )

    account_type = models.CharField(
        max_length=50,
    )

    currency_code = models.CharField(
        max_length=3,
    )

    current_balance = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        default=0,
    )

    is_active = models.BooleanField(
        default=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return f"{self.name} - {self.currency_code}"

    class Meta:
        db_table = "financial_accounts"