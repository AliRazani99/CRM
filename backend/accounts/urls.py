from django.urls import include, path
from rest_framework.authtoken.views import (
    obtain_auth_token,
)
from rest_framework.routers import (
    DefaultRouter,
)

from .views import (
    LogoutAPIView,
    MeAPIView,
    RoleListAPIView,
    UserViewSet,
)


router = DefaultRouter()

router.register(
    "users",
    UserViewSet,
    basename="user",
)


urlpatterns = [
    path(
        "token/",
        obtain_auth_token,
        name="api-token-auth",
    ),

    path(
        "me/",
        MeAPIView.as_view(),
        name="auth-me",
    ),

    path(
        "logout/",
        LogoutAPIView.as_view(),
        name="auth-logout",
    ),

    path(
        "roles/",
        RoleListAPIView.as_view(),
        name="role-list",
    ),

    path(
        "",
        include(router.urls),
    ),
]