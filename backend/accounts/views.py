from django.contrib.auth import get_user_model
from rest_framework import generics, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.permissions import (
    IsAuthenticated,
)
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models.deletion import ProtectedError
from .models import Role
from .permissions import IsStoreManager
from .serializers import (
    CurrentUserSerializer,
    PasswordResetSerializer,
    RoleSerializer,
    UserAdminSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
)


User = get_user_model()


class MeAPIView(APIView):
    permission_classes = [
        IsAuthenticated,
    ]

    def get(self, request):
        serializer = CurrentUserSerializer(
            request.user
        )

        return Response(serializer.data)


class LogoutAPIView(APIView):
    permission_classes = [
        IsAuthenticated,
    ]

    def post(self, request):
        Token.objects.filter(
            user=request.user
        ).delete()

        return Response(
            status=status.HTTP_204_NO_CONTENT
        )


class RoleListAPIView(
    generics.ListAPIView
):
    permission_classes = [
        IsStoreManager,
    ]
    serializer_class = RoleSerializer

    def get_queryset(self):
        return Role.objects.filter(
            code__in=[
                Role.Code.SALES_MANAGER,
                Role.Code.PURCHASE_MANAGER,
            ]
        ).order_by("name")


class UserViewSet(viewsets.ModelViewSet):
    permission_classes = [
        IsStoreManager,
    ]

    # user را حذف نمی‌کنیم.
    # deactivate می‌کنیم تا audit history بماند.
    http_method_names = [
        "get",
        "post",
        "patch",
        "delete",
        "head",
        "options",
    ]
    def destroy(self, request, *args, **kwargs):
        user = self.get_object()

        try:
            user.delete()
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "این کاربر دارای سوابق عملیاتی است "
                        "و قابل حذف دائمی نیست. "
                        "به‌جای حذف، او را غیرفعال کنید."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            status=status.HTTP_204_NO_CONTENT
        )

    def get_queryset(self):
        return (
            User.objects
            .filter(
                is_superuser=False,
                role__code__in=[
                    Role.Code.SALES_MANAGER,
                    Role.Code.PURCHASE_MANAGER,
                ],
            )
            .select_related("role")
            .order_by("-date_joined")
        )

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer

        if self.action in [
            "update",
            "partial_update",
        ]:
            return UserUpdateSerializer

        if self.action == "set_password":
            return PasswordResetSerializer

        return UserAdminSerializer

    @action(
        detail=True,
        methods=["post"],
        url_path="set-password",
    )
    def set_password(self, request, pk=None):
        user = self.get_object()

        serializer = PasswordResetSerializer(
            data=request.data
        )
        serializer.is_valid(
            raise_exception=True
        )

        user.set_password(
            serializer.validated_data[
                "password"
            ]
        )
        user.save(
            update_fields=["password"]
        )

        # token قبلی کاربر هم باطل شود
        Token.objects.filter(
            user=user
        ).delete()

        return Response(
            {
                "detail": (
                    "Password updated successfully."
                )
            }
        )