from django.contrib import admin
from django.urls import path, include

from django.contrib import admin
from django.urls import include, path


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("parties.urls")),
    path("api/finance/", include("finance.urls")),
    path("api/sales/", include("sales.urls")),
    path("api/", include("products.urls")),
    path("api/",include("inventory.urls")),

]
