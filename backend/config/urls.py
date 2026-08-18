from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("parties.urls")),
    path("api/finance/", include("finance.urls")),
    path("api/sales/", include("sales.urls")),
]
