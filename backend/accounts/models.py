from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.Model):
    class Code(models.TextChoices):
        STORE_MANAGER = (
            "STORE_MANAGER",
            "Store Manager",
        )
        SALES_MANAGER = (
            "SALES_MANAGER",
            "Sales Manager",
        )
        PURCHASE_MANAGER = (
            "PURCHASE_MANAGER",
            "Purchase Manager",
        )

    code = models.CharField(
        max_length=50,
        choices=Code.choices,
        unique=True,
        null=True,
        blank=True,
    )

    name = models.CharField(
        max_length=100,
        unique=True,
    )

    description = models.TextField(
        blank=True,
    )

    def __str__(self):
        return self.name

    class Meta:
        db_table = "roles"


class User(AbstractUser):
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
    )

    full_name = models.CharField(
        max_length=255,
        blank=True,
    )

    email = models.EmailField(
        unique=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    def __str__(self):
        return self.full_name or self.username

    class Meta:
        db_table = "users"