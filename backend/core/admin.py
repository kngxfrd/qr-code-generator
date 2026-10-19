from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import ContactMessage, EmailVerificationCode, OAuthAttempt, QRCode, QRFolder, Scan, User


@admin.register(User)
class FreeQRUserAdmin(UserAdmin):
    ordering = ("email",)
    list_display = ("email", "display_name", "email_verified", "static_qr_credits", "plan_id", "subscription_status", "is_staff", "date_joined")
    search_fields = ("email", "display_name")
    fieldsets = ((None, {"fields": ("email", "password")}), ("Profile", {"fields": ("display_name", "google_sub", "email_verified")}), ("QR credits", {"fields": ("static_qr_credits",)}), ("Subscription", {"fields": ("plan_id", "subscription_status", "billing_interval", "current_period_end")}), ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}), ("Dates", {"fields": ("last_login", "date_joined")}))
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "display_name", "password1", "password2")} ),)
    filter_horizontal = ("groups", "user_permissions")


@admin.register(QRCode)
class QRCodeAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "type", "dynamic", "status", "scan_count", "created_at")
    list_filter = ("dynamic", "status", "type")
    search_fields = ("name", "payload", "user__email")
    readonly_fields = ("id", "created_at", "updated_at", "scan_count", "last_scanned_at")


@admin.register(QRFolder)
class QRFolderAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "created_at")
    search_fields = ("name", "user__email")


@admin.register(Scan)
class ScanAdmin(admin.ModelAdmin):
    list_display = ("code", "user", "created_at", "country", "device")
    list_filter = ("country", "device", "created_at")
    search_fields = ("code__name", "user__email")
    readonly_fields = ("id", "user", "code", "created_at", "country", "device")


@admin.register(OAuthAttempt)
class OAuthAttemptAdmin(admin.ModelAdmin):
    list_display = ("state_hash", "expires_at")
    readonly_fields = ("state_hash", "nonce", "expires_at")


@admin.register(EmailVerificationCode)
class EmailVerificationCodeAdmin(admin.ModelAdmin):
    list_display = ("user", "created_at", "expires_at", "attempts")
    readonly_fields = ("user", "code_hash", "created_at", "expires_at", "attempts")


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("subject", "name", "email", "created_at", "resolved")
    list_filter = ("resolved", "created_at")
    search_fields = ("name", "email", "subject", "message")
