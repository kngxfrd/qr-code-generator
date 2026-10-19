import uuid

from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("A superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("A superuser must have is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    email_verified = models.BooleanField(default=True)
    display_name = models.CharField(max_length=100, blank=True)
    google_sub = models.CharField(max_length=255, blank=True, unique=True, null=True)
    plan_id = models.CharField(max_length=32, default="free")
    subscription_status = models.CharField(max_length=24, default="free")
    billing_interval = models.CharField(max_length=16, blank=True, null=True)
    current_period_end = models.DateTimeField(blank=True, null=True)
    static_qr_credits = models.PositiveIntegerField(default=0)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    def __str__(self):
        return self.email


class QRFolder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="folders")
    name = models.CharField(max_length=80)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["user", "name"], name="unique_folder_name_per_user")]

    def __str__(self):
        return self.name


class QRCode(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="qr_codes")
    name = models.CharField(max_length=120)
    type = models.CharField(max_length=40)
    payload = models.TextField(max_length=10_000)
    fields = models.JSONField(default=list, blank=True)
    svg = models.TextField()
    format = models.CharField(max_length=8, default="png")
    design = models.JSONField(default=dict, blank=True)
    folder = models.ForeignKey(QRFolder, on_delete=models.SET_NULL, related_name="qr_codes", blank=True, null=True)
    status = models.CharField(max_length=12, default="Active", choices=[("Active", "Active"), ("Paused", "Paused")])
    dynamic = models.BooleanField(default=False)
    scan_count = models.PositiveIntegerField(default=0)
    last_scanned_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name


class Scan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="scans")
    code = models.ForeignKey(QRCode, on_delete=models.CASCADE, related_name="scans")
    created_at = models.DateTimeField(auto_now_add=True)
    country = models.CharField(max_length=2, default="Unknown")
    device = models.CharField(max_length=16, default="Unknown")

    class Meta:
        ordering = ["-created_at"]


class OAuthAttempt(models.Model):
    state_hash = models.CharField(max_length=64, unique=True)
    nonce = models.CharField(max_length=64)
    expires_at = models.DateTimeField()


class EmailVerificationCode(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="email_verification")
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    def __str__(self):
        return f"Email verification for {self.user.email}"


class ContactMessage(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField()
    subject = models.CharField(max_length=160)
    message = models.TextField(max_length=8000)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.subject} — {self.email}"


class Payment(models.Model):
    """One Paystack checkout attempt. amount_minor is in pesewas/cents of `currency`."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="payments")
    reference = models.CharField(max_length=64, unique=True)
    plan_id = models.CharField(max_length=32)
    interval = models.CharField(max_length=16)
    amount_minor = models.BigIntegerField()
    currency = models.CharField(max_length=3)
    status = models.CharField(max_length=10, default="pending")  # pending | success | failed | flagged
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference} ({self.status})"
