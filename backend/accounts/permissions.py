from rest_framework.permissions import (
    BasePermission,
    SAFE_METHODS,
)

from .models import Role


def get_user_role_code(user):
    if not user or not user.is_authenticated:
        return None

    # superuser فنی همیشه بالاترین سطح را دارد
    if user.is_superuser:
        return Role.Code.STORE_MANAGER

    if not user.role:
        return None

    return user.role.code


class HasAnyRole(BasePermission):
    allowed_roles = set()

    def has_permission(self, request, view):
        role_code = get_user_role_code(
            request.user,
        )

        return role_code in self.allowed_roles


class IsStoreManager(HasAnyRole):
    allowed_roles = {
        Role.Code.STORE_MANAGER,
    }


class IsStoreOrSalesManager(HasAnyRole):
    allowed_roles = {
        Role.Code.STORE_MANAGER,
        Role.Code.SALES_MANAGER,
    }


class IsStoreOrPurchaseManager(HasAnyRole):
    allowed_roles = {
        Role.Code.STORE_MANAGER,
        Role.Code.PURCHASE_MANAGER,
    }


class IsOperationalUser(HasAnyRole):
    allowed_roles = {
        Role.Code.STORE_MANAGER,
        Role.Code.SALES_MANAGER,
        Role.Code.PURCHASE_MANAGER,
    }


class OperationalReadOnlyStoreWrite(
    BasePermission
):
    """
    همه نقش‌ها GET دارند.
    فقط مدیر فروشگاه write دارد.

    برای Product و Inventory مناسب است.
    """

    def has_permission(self, request, view):
        role_code = get_user_role_code(
            request.user,
        )

        if request.method in SAFE_METHODS:
            return role_code in {
                Role.Code.STORE_MANAGER,
                Role.Code.SALES_MANAGER,
                Role.Code.PURCHASE_MANAGER,
            }

        return (
            role_code
            == Role.Code.STORE_MANAGER
        )