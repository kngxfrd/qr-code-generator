"""Paystack checkout for Free QR Generator.  Save as backend/core/paystack.py

Flow:
  1. POST /api/billing/checkout            -> creates a pending Payment, asks Paystack for a checkout URL
  2. Browser pays on Paystack, returns to  /billing?reference=...
  3. GET  /api/billing/paystack/verify     -> frontend confirms the result
  4. POST /api/billing/paystack/webhook    -> Paystack calls this too (covers closed browser tabs)

Both (3) and (4) go through settle(), which re-checks the transaction directly with Paystack
and is idempotent, so a payment can never grant access twice.
Prices and amounts are ALWAYS computed on the server from PLANS, never taken from the browser.
"""
import hashlib
import hmac
import json
import secrets
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .catalog import PLANS, subscription_is_current
from .models import Payment, User

PAYSTACK_API = "https://api.paystack.co"
INTERVAL_DAYS = {"monthly": 30, "quarterly": 91, "annual": 365}


def error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"error": message}, status=code)


def configured():
    return bool(getattr(settings, "PAYSTACK_SECRET_KEY", ""))


def _headers():
    return {"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}", "Content-Type": "application/json"}


def checkout_currency():
    return getattr(settings, "PAYSTACK_CURRENCY", "GHS")


def price_for(plan_id, interval):
    """Catalog price (USD, as shown on the billing page) or None if not purchasable."""
    plan = next((p for p in PLANS if p["id"] == plan_id), None)
    if not plan or interval not in INTERVAL_DAYS:
        return None
    price = plan.get(interval)
    if isinstance(price, bool) or not isinstance(price, (int, float, Decimal)) or price <= 0:
        return None
    return price


def to_minor_units(price):
    """USD catalog price -> pesewas/cents in the checkout currency (Paystack wants the smallest unit)."""
    rate = Decimal(str(getattr(settings, "PAYSTACK_USD_TO_LOCAL_RATE", "1")))
    return int((Decimal(str(price)) * rate * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def grant_access(payment):
    """Give the user the plan they paid for. Must be called inside transaction.atomic()."""
    now = timezone.now()
    user = User.objects.select_for_update().get(pk=payment.user_id)
    # Renewing the same plan before it expires stacks on top of the remaining time.
    renewing = subscription_is_current(user) and user.plan_id == payment.plan_id and user.current_period_end is not None
    start = user.current_period_end if renewing else now
    user.plan_id = payment.plan_id
    user.subscription_status = "active"
    user.billing_interval = payment.interval
    user.current_period_end = start + timedelta(days=INTERVAL_DAYS[payment.interval])
    user.save(update_fields=["plan_id", "subscription_status", "billing_interval", "current_period_end"])


def settle(reference):
    """Confirm a payment with Paystack and fulfil it once. Returns the Payment (or None)."""
    payment = Payment.objects.filter(reference=reference).first()
    if not payment or payment.status == "success":
        return payment
    try:
        response = requests.get(f"{PAYSTACK_API}/transaction/verify/{reference}", headers=_headers(), timeout=20)
        response.raise_for_status()
        data = response.json().get("data") or {}
    except (requests.RequestException, ValueError):
        return payment  # Paystack unreachable: stay pending, the webhook or a retry will finish it
    outcome = data.get("status")
    if outcome in ("failed", "reversed", "abandoned"):
        Payment.objects.filter(pk=payment.pk, status="pending").update(status="failed")
        payment.refresh_from_db()
        return payment
    if outcome != "success":
        return payment  # still processing
    if data.get("amount") != payment.amount_minor or str(data.get("currency", "")).upper() != payment.currency:
        # Paid amount does not match what we asked for: never grant access automatically.
        Payment.objects.filter(pk=payment.pk, status="pending").update(status="flagged")
        payment.refresh_from_db()
        return payment
    with transaction.atomic():
        locked = Payment.objects.select_for_update().get(pk=payment.pk)
        if locked.status != "success":
            locked.status = "success"
            locked.paid_at = timezone.now()
            locked.save(update_fields=["status", "paid_at"])
            grant_access(locked)
    payment.refresh_from_db()
    return payment


class CheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=dict, responses={200: dict, 400: OpenApiResponse(description="Invalid plan"), 503: OpenApiResponse(description="Payments not configured")})
    def post(self, request):
        if not configured():
            return error("Payments are not available yet.", status.HTTP_503_SERVICE_UNAVAILABLE)
        plan_id = str(request.data.get("planId", ""))
        interval = str(request.data.get("interval", ""))
        price = price_for(plan_id, interval)
        if price is None:
            return error("That plan can't be purchased online. Please contact us.")
        amount = to_minor_units(price)
        currency = checkout_currency()
        reference = f"fq_{secrets.token_hex(12)}"
        payment = Payment.objects.create(user=request.user, reference=reference, plan_id=plan_id, interval=interval, amount_minor=amount, currency=currency)
        body = {
            "email": request.user.email,
            "amount": amount,
            "currency": currency,
            "reference": reference,
            "callback_url": f"{settings.PUBLIC_ORIGIN}/billing",
            "metadata": {"userId": str(request.user.pk), "planId": plan_id, "interval": interval},
        }
        try:
            response = requests.post(f"{PAYSTACK_API}/transaction/initialize", headers=_headers(), data=json.dumps(body), timeout=20)
            response.raise_for_status()
            url = response.json()["data"]["authorization_url"]
        except (requests.RequestException, KeyError, ValueError, TypeError):
            Payment.objects.filter(pk=payment.pk).update(status="failed")
            return error("We couldn't start checkout. Please try again.", status.HTTP_502_BAD_GATEWAY)
        return Response({"authorizationUrl": url, "reference": reference})


class VerifyView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict, 404: OpenApiResponse(description="Payment not found")})
    def get(self, request):
        reference = request.query_params.get("reference", "")
        payment = Payment.objects.filter(reference=reference, user=request.user).first()
        if not payment:
            return error("Payment not found.", status.HTTP_404_NOT_FOUND)
        payment = settle(reference)
        return Response({"status": payment.status, "planId": payment.plan_id})


class WebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # Paystack has no session/CSRF token; the signature is the authentication

    @extend_schema(exclude=True)
    def post(self, request):
        raw = request.body  # read the raw bytes before anything parses them
        signature = request.headers.get("x-paystack-signature", "")
        expected = hmac.new(settings.PAYSTACK_SECRET_KEY.encode(), raw, hashlib.sha512).hexdigest() if configured() else ""
        if not expected or not hmac.compare_digest(expected, signature):
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        try:
            event = json.loads(raw)
        except ValueError:
            return Response(status=status.HTTP_400_BAD_REQUEST)
        if event.get("event") == "charge.success":
            reference = (event.get("data") or {}).get("reference", "")
            if reference:
                settle(reference)
        return Response({"ok": True})