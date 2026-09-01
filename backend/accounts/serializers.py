from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Role


User = get_user_model()


class RoleSerializer(
    serializers.ModelSerializer
):
    class Meta:
        model = Role
        fields = [
            "id",
            "code",
            "name",
            "description",
        ]


class CurrentUserSerializer(
    serializers.ModelSerializer
):
    role_code = serializers.SerializerMethodField()
    role_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "full_name",
            "email",
            "role_code",
            "role_name",
        ]

    def get_role_code(self, obj):
        if obj.is_superuser:
            return Role.Code.STORE_MANAGER

        return (
            obj.role.code
            if obj.role
            else None
        )

    def get_role_name(self, obj):
        if obj.is_superuser:
            return "مدیر فروشگاه"

        return (
            obj.role.name
            if obj.role
            else "بدون سمت"
        )


class UserAdminSerializer(
    serializers.ModelSerializer
):
    role = RoleSerializer(
        read_only=True,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "full_name",
            "email",
            "role",
            "is_active",
            "date_joined",
        ]


class UserCreateSerializer(
    serializers.ModelSerializer
):
    password = serializers.CharField(
        write_only=True,
        min_length=8,
    )

    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.filter(
            code__in=[
                Role.Code.SALES_MANAGER,
                Role.Code.PURCHASE_MANAGER,
            ]
        )
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "password",
            "full_name",
            "email",
            "role",
        ]

    def create(self, validated_data):
        password = validated_data.pop(
            "password"
        )

        user = User(
            **validated_data
        )

        user.set_password(password)
        user.save()

        return user


class UserUpdateSerializer(
    serializers.ModelSerializer
):
    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.filter(
            code__in=[
                Role.Code.SALES_MANAGER,
                Role.Code.PURCHASE_MANAGER,
            ]
        ),
        required=False,
    )

    class Meta:
        model = User
        fields = [
            "full_name",
            "email",
            "role",
            "is_active",
        ]


class PasswordResetSerializer(
    serializers.Serializer
):
    password = serializers.CharField(
        min_length=8,
        write_only=True,
    )