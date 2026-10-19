import csv
import hashlib
import io
import re
import secrets
import logging
from collections import Counter
from datetime import timedelta

import requests
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.core.mail import send_mail
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, F
from django.http import HttpResponse, HttpResponseRedirect
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from . import paystack
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema

from .catalog import INTERVALS, PLANS, STATIC_QR_PACK, active_plan, code_json, folder_json, user_json
from .models import ContactMessage, EmailVerificationCode, OAuthAttempt, QRCode, QRFolder, Scan, User
from .serializers import CodeWriteSerializer, ContactSerializer, EmailVerificationSerializer, FolderSerializer, PasswordSerializer, ProfileSerializer, ResendVerificationSerializer, SigninSerializer, SignupSerializer

logger = logging.getLogger(__name__)


def error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"error": message}, status=code)


def first_validation_error(serializer):
    if not serializer.errors:
        return "Please check the submitted information."
    first = next(iter(serializer.errors.values()))
    return str(first[0]) if isinstance(first, list) else str(first)


# An SVG is still valid when it begins with a BOM, whitespace, an <?xml ...?> declaration,
# comments or a <!DOCTYPE>. The old check only accepted strings starting exactly with "<svg",
# so renderers that add an XML prolog (frames, logos, some patterns) were rejected.
SVG_PROLOG = re.compile(r"^(?:\s|\ufeff|<\?xml[^>]*\?>|<!--.*?-->|<!DOCTYPE[^>]*>)*", re.IGNORECASE | re.DOTALL)
SVG_SCRIPT = re.compile(r"<\s*script|<\s*foreignObject|javascript:", re.IGNORECASE)


def svg_problem(svg):
    """Return an error message if the SVG is unusable, otherwise None."""
    body = SVG_PROLOG.sub("", svg or "", count=1)
    if body[:4].lower() != "<svg":
        return "A rendered QR design is required."
    if SVG_SCRIPT.search(body):
        return "The QR design contains content that is not allowed."
    return None


def owned_code(user, code_id):
    return QRCode.objects.filter(user=user, id=code_id).first()


def has_dynamic_access(user):
    return active_plan(user) is not None


def can_add_dynamic(user):
    plan = active_plan(user)
    return bool(plan and (plan["dynamicCodes"] is None or user.qr_codes.filter(dynamic=True).count() < plan["dynamicCodes"]))


def month_start():
    now = timezone.now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def scan_device(user_agent):
    ua = (user_agent or "").lower()
    if any(token in ua for token in ("bot", "crawler", "spider", "preview")):
        return "bot"
    if "ipad" in ua or "tablet" in ua:
        return "tablet"
    if any(token in ua for token in ("mobile", "iphone", "android")):
        return "mobile"
    return "desktop"


def send_account_email(user, subject, message):
    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
    except Exception:
        logger.exception("Could not send account email to %s", user.email)


def issue_email_verification(user):
    code = f"{secrets.randbelow(1_000_000):06d}"
    record, _ = EmailVerificationCode.objects.update_or_create(
        user=user,
        defaults={"code_hash": make_password(code), "expires_at": timezone.now() + timedelta(minutes=10), "attempts": 0},
    )
    try:
        send_mail(
            "Verify your Free QR Generator email",
            f"Hi {user.display_name or 'there'},\n\nYour verification code is {code}. It expires in 10 minutes.\n\nIf you did not create this account, you can ignore this email.",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
        )
    except Exception:
        logger.exception("Could not send verification code to %s", user.email)
        return False
    return True


class HealthView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response({"ok": True, "service": "free-qr-generator"})


class PublicConfigView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response({"qrRedirectOrigin": settings.QR_REDIRECT_ORIGIN})


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response({"csrfToken": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class SignupView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=SignupSerializer, responses={201: dict, 400: OpenApiResponse(description="Invalid signup details"), 409: OpenApiResponse(description="Email is already registered")})
    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        if not serializer.is_valid():
            return error(first_validation_error(serializer))
        values = serializer.validated_data
        email = values["email"].strip().lower()
        user = User.objects.filter(email__iexact=email).first()
        if user and user.email_verified:
            return error("An account with this email already exists.", status.HTTP_409_CONFLICT)
        if user:
            previous_code = EmailVerificationCode.objects.filter(user=user).first()
            if previous_code and previous_code.created_at > timezone.now() - timedelta(seconds=60):
                return error("A verification code was sent recently. Check your inbox or wait a minute before trying again.", status.HTTP_429_TOO_MANY_REQUESTS)
        try:
            with transaction.atomic():
                if user is None:
                    user = User.objects.create_user(email=email, password=values["password"], display_name=values["name"].strip(), is_active=False, email_verified=False)
        except IntegrityError:
            return error("An account with this email already exists.", status.HTTP_409_CONFLICT)
        if not issue_email_verification(user):
            return error("We couldn't send your verification code. Check your email settings and try again.", status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"verificationRequired": True, "email": email}, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class EmailVerificationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=EmailVerificationSerializer, responses={200: dict, 400: OpenApiResponse(description="Invalid or expired code")})
    def post(self, request):
        serializer = EmailVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return error(first_validation_error(serializer))
        values = serializer.validated_data
        user = User.objects.filter(email__iexact=values["email"].strip().lower(), email_verified=False).first()
        record = EmailVerificationCode.objects.filter(user=user).first() if user else None
        if not user or not record:
            return error("No pending verification was found. Start signup again to request a new code.")
        if record.expires_at <= timezone.now():
            return error("That code has expired. Request a new verification code.")
        if record.attempts >= 5:
            return error("Too many incorrect attempts. Request a new verification code.", status.HTTP_429_TOO_MANY_REQUESTS)
        if not check_password(values["code"], record.code_hash):
            record.attempts += 1
            record.save(update_fields=["attempts"])
            return error("That verification code is incorrect.")
        user.email_verified = True
        user.is_active = True
        user.save(update_fields=["email_verified", "is_active"])
        record.delete()
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        send_account_email(user, "Welcome to Free QR Generator", f"Congratulations, {user.display_name or 'your account'} is ready. You can now save, organize, and download your QR codes from your workspace.")
        return Response({"user": user_json(user)})


@method_decorator(csrf_protect, name="dispatch")
class ResendVerificationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=ResendVerificationSerializer, responses={200: dict, 429: OpenApiResponse(description="Resend cooldown")})
    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return error(first_validation_error(serializer))
        user = User.objects.filter(email__iexact=serializer.validated_data["email"].strip().lower(), email_verified=False).first()
        if user:
            existing = EmailVerificationCode.objects.filter(user=user).first()
            if existing and existing.created_at > timezone.now() - timedelta(seconds=60):
                return error("Please wait a minute before requesting another code.", status.HTTP_429_TOO_MANY_REQUESTS)
            if not issue_email_verification(user):
                return error("We couldn't send a verification code. Please try again later.", status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"ok": True})


@method_decorator(csrf_protect, name="dispatch")
class SigninView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=SigninSerializer, responses={200: dict, 400: OpenApiResponse(description="Invalid credentials"), 401: OpenApiResponse(description="Invalid credentials")})
    def post(self, request):
        serializer = SigninSerializer(data=request.data)
        if not serializer.is_valid():
            return error("Enter a valid email address and password.")
        values = serializer.validated_data
        email = values["email"].strip().lower()
        user = authenticate(request, username=email, password=values["password"])
        if not user:
            pending_user = User.objects.filter(email__iexact=email, email_verified=False).first()
            if pending_user and pending_user.check_password(values["password"]):
                return error("Please verify your email before signing in.", status.HTTP_403_FORBIDDEN)
            return error("Email or password is incorrect. If you created your account with Google, use the Google sign-in button.", status.HTTP_401_UNAUTHORIZED)
        if not user.email_verified:
            return error("Please verify your email before signing in.", status.HTTP_403_FORBIDDEN)
        login(request, user)
        send_account_email(user, "New sign-in to Free QR Generator", f"Hi {user.display_name or 'there'},\n\nYour Free QR Generator account was just signed in to. If this wasn't you, change your password and contact support.togethere@gmail.com.")
        return Response({"user": user_json(user)})


@method_decorator(csrf_protect, name="dispatch")
class SignoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={200: dict})
    def post(self, request):
        logout(request)
        return Response({"ok": True})


class MeView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response({"user": user_json(request.user) if request.user.is_authenticated else None})


class BillingPlansView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response({"plans": PLANS, "staticQrPack": STATIC_QR_PACK, "intervals": INTERVALS, "paymentConfigured": paystack.configured(), "checkoutCurrency": paystack.checkout_currency()})


class BillingSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response({"subscription": user_json(request.user)["subscription"], "paymentConfigured": False})


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ProfileSerializer, responses={200: dict, 400: OpenApiResponse(description="Invalid profile"), 409: OpenApiResponse(description="Email is already used")})
    def patch(self, request):
        serializer = ProfileSerializer(data=request.data)
        if not serializer.is_valid():
            return error(first_validation_error(serializer))
        data = serializer.validated_data
        email = data["email"].strip().lower()
        if User.objects.exclude(pk=request.user.pk).filter(email__iexact=email).exists():
            return error("That email is already in use.", status.HTTP_409_CONFLICT)
        request.user.display_name = data["name"].strip()
        request.user.email = email
        request.user.save(update_fields=["display_name", "email"])
        return Response({"user": user_json(request.user)})


class PasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PasswordSerializer, responses={200: dict, 400: OpenApiResponse(description="Invalid password details"), 401: OpenApiResponse(description="Current password is incorrect")})
    def patch(self, request):
        serializer = PasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return error(first_validation_error(serializer))
        data = serializer.validated_data
        if not request.user.check_password(data["currentPassword"]):
            return error("Current password is incorrect.", status.HTTP_401_UNAUTHORIZED)
        try:
            validate_password(data["newPassword"], request.user)
        except ValidationError as exc:
            return error(" ".join(exc.messages))
        request.user.set_password(data["newPassword"])
        request.user.save(update_fields=["password"])
        return Response({"ok": True})


class AccountDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def delete(self, request):
        request.user.delete()
        logout(request)
        return Response({"ok": True})


class FolderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict, 201: dict})
    def get(self, request):
        return Response({"folders": [folder_json(folder) for folder in request.user.folders.annotate(_count=Count("qr_codes"))]})

    @extend_schema(request=FolderSerializer, responses={201: dict, 400: OpenApiResponse(description="Invalid folder"), 409: OpenApiResponse(description="Folder name already exists")})
    def post(self, request):
        serializer = FolderSerializer(data=request.data)
        if not serializer.is_valid():
            return error("Folder name is required.")
        try:
            folder = QRFolder.objects.create(user=request.user, name=serializer.validated_data["name"])
        except IntegrityError:
            return error("A folder with this name already exists.", status.HTTP_409_CONFLICT)
        return Response({"folder": folder_json(folder)}, status=status.HTTP_201_CREATED)


class FolderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=FolderSerializer, responses={200: dict, 400: OpenApiResponse(description="Invalid folder"), 404: OpenApiResponse(description="Folder not found"), 409: OpenApiResponse(description="Folder name already exists")})
    def patch(self, request, folder_id):
        folder = request.user.folders.filter(pk=folder_id).first()
        if not folder:
            return error("Folder not found.", status.HTTP_404_NOT_FOUND)
        serializer = FolderSerializer(data=request.data)
        if not serializer.is_valid():
            return error("Folder name is required.")
        folder.name = serializer.validated_data["name"]
        try:
            folder.save(update_fields=["name"])
        except IntegrityError:
            return error("A folder with this name already exists.", status.HTTP_409_CONFLICT)
        return Response({"folder": folder_json(folder)})

    @extend_schema(responses={200: dict, 404: OpenApiResponse(description="Folder not found")})
    def delete(self, request, folder_id):
        folder = request.user.folders.filter(pk=folder_id).first()
        if not folder:
            return error("Folder not found.", status.HTTP_404_NOT_FOUND)
        folder.delete()
        return Response({"ok": True})


class CodeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(operation_id="api_codes_list", responses={200: dict})
    def get(self, request):
        codes = request.user.qr_codes.select_related("folder").all()
        return Response({"codes": [code_json(code) for code in codes]})

    @extend_schema(request=CodeWriteSerializer, responses={201: dict, 400: OpenApiResponse(description="Invalid QR code"), 403: OpenApiResponse(description="Plan required")})
    def post(self, request):
        serializer = CodeWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return error(first_validation_error(serializer))
        values = serializer.validated_data
        if values.get("dynamic") and not has_dynamic_access(request.user):
            return error("Dynamic QR codes and scan analytics require an active subscription. Static QR codes are available in a 3-code pack.", status.HTTP_403_FORBIDDEN)
        if values.get("dynamic") and not can_add_dynamic(request.user):
            return error("You have reached your plan’s dynamic QR code limit.", status.HTTP_403_FORBIDDEN)
        if values.get("dynamic") and not values["payload"].lower().startswith(("https://", "http://")):
            return error("Dynamic QR codes need an HTTP or HTTPS destination.")
        problem = svg_problem(values["svg"])
        if problem:
            return error(problem)
        if values.get("id") and QRCode.objects.filter(pk=values["id"]).exists():
            return error("That QR identifier is already in use. Start a new code and try again.", status.HTTP_409_CONFLICT)
        with transaction.atomic():
            owner = User.objects.select_for_update().get(pk=request.user.pk)
            if not values.get("dynamic"):
                if owner.static_qr_credits < 1:
                    return error("You have no static QR credits left. Buy a 3-code pack for $2 to continue.", status.HTTP_402_PAYMENT_REQUIRED)
                owner.static_qr_credits -= 1
                owner.save(update_fields=["static_qr_credits"])
            folder = owner.folders.filter(pk=values.get("folderId")).first() if values.get("folderId") else None
            code = QRCode.objects.create(
                id=values.get("id"),
                user=owner, name=(values.get("name") or f"{values['type']} QR code").strip(), type=values["type"], payload=values["payload"],
                fields=values.get("fields", []), svg=values["svg"], format=values.get("format") or "png", design=values.get("design", {}),
                folder=folder, dynamic=values.get("dynamic", False),
            )
        return Response({"code": code_json(code)}, status=status.HTTP_201_CREATED)


class CodeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(operation_id="api_codes_retrieve", responses={200: dict, 404: OpenApiResponse(description="QR code not found")})
    def get(self, request, code_id):
        code = owned_code(request.user, code_id)
        return Response({"code": code_json(code)}) if code else error("QR code not found.", status.HTTP_404_NOT_FOUND)

    @extend_schema(request=CodeWriteSerializer, responses={200: dict, 400: OpenApiResponse(description="Validation error"), 403: OpenApiResponse(description="Plan limit reached"), 404: OpenApiResponse(description="QR code not found")})
    def patch(self, request, code_id):
        code = owned_code(request.user, code_id)
        if not code:
            return error("QR code not found.", status.HTTP_404_NOT_FOUND)
        serializer = CodeWriteSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return error(first_validation_error(serializer))
        values = serializer.validated_data
        if "svg" in values:
            problem = svg_problem(values["svg"])
            if problem:
                return error(problem)
        make_dynamic = values.get("dynamic", code.dynamic)
        if make_dynamic and not code.dynamic and not has_dynamic_access(request.user):
            return error("Dynamic QR codes and scan analytics require an active subscription. Static QR codes are available in a 3-code pack.", status.HTTP_403_FORBIDDEN)
        if make_dynamic and not code.dynamic and not can_add_dynamic(request.user):
            return error("You have reached your plan’s dynamic QR code limit.", status.HTTP_403_FORBIDDEN)
        payload = values.get("payload", code.payload)
        if code.dynamic and not has_dynamic_access(request.user) and payload != code.payload:
            return error("Changing a dynamic destination requires an active subscription.", status.HTTP_403_FORBIDDEN)
        if make_dynamic and not payload.lower().startswith(("https://", "http://")):
            return error("Dynamic QR codes need an HTTP or HTTPS destination.")
        for field in ("name", "type", "payload", "svg", "format", "fields", "design", "status", "dynamic"):
            if field in values:
                setattr(code, field, values[field])
        if "name" in values and not code.name.strip():
            return error("QR code name is required.")
        if "folderId" in values:
            folder = request.user.folders.filter(pk=values["folderId"]).first() if values["folderId"] else None
            if values["folderId"] and not folder:
                return error("Folder not found.")
            code.folder = folder
        code.save()
        return Response({"code": code_json(code)})

    @extend_schema(responses={200: dict, 404: OpenApiResponse(description="QR code not found")})
    def delete(self, request, code_id):
        code = owned_code(request.user, code_id)
        if not code:
            return error("QR code not found.", status.HTTP_404_NOT_FOUND)
        code.delete()
        return Response({"ok": True})


class AnalyticsSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict, 403: OpenApiResponse(description="Subscription required")})
    def get(self, request):
        if not has_dynamic_access(request.user):
            return error("Scan analytics are part of the dynamic QR subscription plans.", status.HTTP_403_FORBIDDEN)
        codes = request.user.qr_codes.all()
        all_scans = request.user.scans.select_related("code").all()
        scans = all_scans.filter(created_at__gte=month_start())
        daily = []
        today = timezone.localdate()
        for offset in range(29, -1, -1):
            day = today - timedelta(days=offset)
            daily.append({"date": day.isoformat(), "count": all_scans.filter(created_at__date=day).count()})
        countries = Counter(scans.values_list("country", flat=True))
        devices = Counter(scans.values_list("device", flat=True))
        group = lambda counter: [{"value": value or "Unknown", "count": count} for value, count in counter.most_common()]
        recent = [{"id": str(scan.id), "codeId": str(scan.code_id), "codeName": scan.code.name if scan.code_id else "Deleted QR code", "createdAt": scan.created_at.isoformat(), "country": scan.country or "Unknown", "device": scan.device or "Unknown"} for scan in scans[:20]]
        return Response({"totalCodes": codes.count(), "dynamicCodes": codes.filter(dynamic=True).count(), "totalScans": scans.count(), "dailyScans": daily, "countries": group(countries), "devices": group(devices), "recentScans": recent})


class AnalyticsExportView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiResponse(description="CSV of scan records"), 403: OpenApiResponse(description="Pro plan required")})
    def get(self, request):
        plan = active_plan(request.user)
        if not plan or plan["id"] not in ("pro", "enterprise"):
            return error("CSV scan exports are included with Pro and Enterprise plans.", status.HTTP_403_FORBIDDEN)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["codeName", "createdAt", "country", "device"])
        for scan in request.user.scans.select_related("code").all():
            writer.writerow([scan.code.name if scan.code_id else "Deleted QR code", scan.created_at.isoformat(), scan.country, scan.device])
        response = HttpResponse(output.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="free-qr-scans.csv"'
        return response


class AnalyticsCodeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict, 403: OpenApiResponse(description="Subscription required")})
    def get(self, request, code_id):
        if not has_dynamic_access(request.user):
            return error("Scan analytics are part of the dynamic QR subscription plans.", status.HTTP_403_FORBIDDEN)
        code = owned_code(request.user, code_id)
        if not code:
            return error("QR code not found.", status.HTTP_404_NOT_FOUND)
        scans = [{"id": str(scan.id), "createdAt": scan.created_at.isoformat(), "country": scan.country, "device": scan.device} for scan in code.scans.all()]
        return Response({"codeId": str(code.id), "scans": scans})


class ContactView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=ContactSerializer, responses={201: dict, 400: OpenApiResponse(description="Invalid contact request")})
    def post(self, request):
        serializer = ContactSerializer(data=request.data)
        if not serializer.is_valid():
            return error(first_validation_error(serializer))
        values = serializer.validated_data
        ContactMessage.objects.create(name=values["name"], email=values["email"], subject=values["subject"], message=values["message"])
        body = (
            f"New message from the Free QR Generator contact form.\n\n"
            f"Name: {values['name']}\n"
            f"Email: {values['email']}\n"
            f"Subject: {values['subject']}\n\n"
            f"{values['message']}"
        )
        try:
            send_mail(
                subject=f"Free QR Generator support: {values['subject']}",
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[settings.SUPPORT_EMAIL],
                fail_silently=False,
                headers={"Reply-To": values["email"]},
            )
        except Exception:
            return error(
                f"Your note was saved, but email delivery is not configured. You can email us directly at {settings.SUPPORT_EMAIL}.",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


class DynamicRedirectView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(exclude=True)
    def get(self, request, code_id):
        code = QRCode.objects.select_related("user").filter(id=code_id, dynamic=True, status="Active").first()
        if not code:
            return HttpResponse("This QR link is unavailable.", status=404, content_type="text/plain; charset=utf-8")
        plan = active_plan(code.user)
        month_scans = code.user.scans.filter(created_at__gte=month_start()).count()
        if plan and (plan["monthlyScans"] is None or month_scans < plan["monthlyScans"]):
            country = "Unknown"
            if settings.TRUST_PROXY_COUNTRY_HEADER:
                candidate = request.headers.get("CF-IPCountry", "").upper()
                if len(candidate) == 2 and candidate.isalpha():
                    country = candidate
            Scan.objects.create(user=code.user, code=code, country=country, device=scan_device(request.headers.get("User-Agent", "")))
        QRCode.objects.filter(pk=code.pk).update(scan_count=F("scan_count") + 1, last_scanned_at=timezone.now())
        return HttpResponseRedirect(code.payload)


def oauth_cookie_options():
    return {"httponly": True, "secure": not settings.DEBUG, "samesite": "Lax", "path": "/", "max_age": 600}


def google_start(request):
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        return HttpResponseRedirect(f"{settings.PUBLIC_ORIGIN}/?google=unconfigured")
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    OAuthAttempt.objects.filter(expires_at__lt=timezone.now()).delete()
    OAuthAttempt.objects.create(state_hash=hashlib.sha256(state.encode()).hexdigest(), nonce=nonce, expires_at=timezone.now() + timedelta(minutes=10))
    params = requests.compat.urlencode({"client_id": settings.GOOGLE_CLIENT_ID, "redirect_uri": f"{settings.PUBLIC_ORIGIN}/auth/google/callback", "response_type": "code", "scope": "openid email profile", "state": state, "nonce": nonce, "prompt": "select_account"})
    response = HttpResponseRedirect(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")
    response.set_cookie("freeqr_oauth_state", state, **oauth_cookie_options())
    return response


def google_callback(request):
    state = request.GET.get("state", "")
    code = request.GET.get("code", "")
    digest = hashlib.sha256(state.encode()).hexdigest()
    attempt = OAuthAttempt.objects.filter(state_hash=digest, expires_at__gt=timezone.now()).first()
    origin = settings.PUBLIC_ORIGIN
    if not state or state != request.COOKIES.get("freeqr_oauth_state") or not attempt or not code:
        if attempt:
            attempt.delete()
        response = HttpResponseRedirect(f"{origin}/?google=failed")
        response.delete_cookie("freeqr_oauth_state", path="/")
        return response
    try:
        token_response = requests.post("https://oauth2.googleapis.com/token", data={"code": code, "client_id": settings.GOOGLE_CLIENT_ID, "client_secret": settings.GOOGLE_CLIENT_SECRET, "redirect_uri": f"{origin}/auth/google/callback", "grant_type": "authorization_code"}, timeout=15)
        token_response.raise_for_status()
        credential = token_response.json()["id_token"]
        claims = id_token.verify_oauth2_token(credential, GoogleRequest(), settings.GOOGLE_CLIENT_ID)
        if claims.get("nonce") != attempt.nonce or not claims.get("email_verified") or not claims.get("email"):
            raise ValueError("Google identity claims could not be verified.")
        email = claims["email"].strip().lower()
        user = User.objects.filter(google_sub=claims["sub"]).first() or User.objects.filter(email__iexact=email).first()
        is_new_user = user is None
        if not user:
            user = User.objects.create_user(email=email, display_name=str(claims.get("name") or email.split("@", 1)[0])[:100], email_verified=True, is_active=True)
        user.google_sub = claims["sub"]
        user.email_verified = True
        user.is_active = True
        if not user.display_name and claims.get("name"):
            user.display_name = str(claims["name"])[:100]
        user.save(update_fields=["google_sub", "display_name", "email_verified", "is_active"])
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        if is_new_user:
            send_account_email(user, "Welcome to Free QR Generator", f"Congratulations, {user.display_name or 'your account'} is ready. You can now save, organize, and download your QR codes from your workspace.")
        else:
            send_account_email(user, "New sign-in to Free QR Generator", f"Hi {user.display_name or 'there'},\n\nYour Free QR Generator account was just signed in to. If this wasn't you, contact support.togethere@gmail.com.")
        result = "success"
    except (requests.RequestException, KeyError, ValueError, TypeError) as exc:
        # Do not expose upstream tokens or provider response details to the browser.
        result = "failed"
    finally:
        attempt.delete()
    response = HttpResponseRedirect(f"{origin}/?google={result}")
    response.delete_cookie("freeqr_oauth_state", path="/")
    return response
