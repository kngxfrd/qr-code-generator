from django.contrib import admin
from django.urls import include, path, re_path
from django.http import FileResponse, Http404
from django.conf import settings
from django.views.static import serve
from backend.core import paystack 
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from backend.core import views


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health", views.HealthView.as_view(), name="health"),
    path("api/config", views.PublicConfigView.as_view(), name="public-config"),
    path("api/csrf/", views.CsrfView.as_view(), name="csrf"),
    path("api/auth/signup", views.SignupView.as_view(), name="signup"),
    path("api/auth/signin", views.SigninView.as_view(), name="signin"),
    path("api/auth/signout", views.SignoutView.as_view(), name="signout"),
    path("api/auth/me", views.MeView.as_view(), name="me"),
    path("api/billing/plans", views.BillingPlansView.as_view(), name="billing-plans"),
    path("api/billing/subscription", views.BillingSubscriptionView.as_view(), name="billing-subscription"),
    path("api/account/profile", views.ProfileView.as_view(), name="account-profile"),
    path("api/account/password", views.PasswordView.as_view(), name="account-password"),
    path("api/account", views.AccountDeleteView.as_view(), name="account-delete"),
    path("api/folders", views.FolderListCreateView.as_view(), name="folders"),
    path("api/folders/<uuid:folder_id>", views.FolderDetailView.as_view(), name="folder-detail"),
    path("api/codes", views.CodeListCreateView.as_view(), name="codes"),
    path("api/codes/<uuid:code_id>", views.CodeDetailView.as_view(), name="code-detail"),
    path("api/analytics/summary", views.AnalyticsSummaryView.as_view(), name="analytics-summary"),
    path("api/analytics/export", views.AnalyticsExportView.as_view(), name="analytics-export"),
    path("api/analytics/codes/<uuid:code_id>", views.AnalyticsCodeView.as_view(), name="analytics-code"),
    path("api/contact", views.ContactView.as_view(), name="contact"),
    path("auth/google", views.google_start, name="google-start"),
    path("auth/google/callback", views.google_callback, name="google-callback"),
    path("r/<uuid:code_id>", views.DynamicRedirectView.as_view(), name="dynamic-redirect"),
    path("api/billing/checkout", paystack.CheckoutView.as_view(), name="billing-checkout"),
    path("api/billing/paystack/verify", paystack.VerifyView.as_view(), name="paystack-verify"),
    path("api/billing/paystack/webhook", paystack.WebhookView.as_view(), name="paystack-webhook"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]


def frontend_entry(request, path=""):
    entry = settings.FRONTEND_DIST / "index.html"
    if not entry.is_file():
        raise Http404("Frontend build not found. Run npm run build.")
    return FileResponse(entry.open("rb"), content_type="text/html; charset=utf-8")


# Serve Vite-built JavaScript and CSS files in production.
urlpatterns += [
    re_path(
        r"^assets/(?P<path>.*)$",
        serve,
        {"document_root": settings.FRONTEND_DIST / "assets"},
    ),
]

# Serve the favicon from the frontend build directory.
urlpatterns += [
    re_path(
        r"^favicon\.png$",
        serve,
        {
            "path": "favicon.png",
            "document_root": settings.FRONTEND_DIST,
        },
    ),
]

# Serve the React application for all remaining frontend routes.
urlpatterns += [
    re_path(
        r"^(?!api/|admin/|auth/|r/|static/|assets/).*$",
        frontend_entry,
    ),
]

