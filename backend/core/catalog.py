from django.utils import timezone
from django.conf import settings

PLANS = [
    {"id": "starter", "name": "Starter", "monthly": 5, "quarterly": 15, "annual": 48, "dynamicCodes": 5, "monthlyScans": 1000, "description": "For a few links you may need to update later.", "features": ["5 editable dynamic QR codes", "Up to 1,000 scans per month", "Scan time, device and coarse country", "Change destinations after printing"]},
    {"id": "growth", "name": "Growth", "monthly": 19, "quarterly": 54, "annual": 180, "dynamicCodes": 25, "monthlyScans": 10000, "description": "For shops, events and growing local teams.", "features": ["25 editable dynamic QR codes", "Up to 10,000 scans per month", "Scan time, device and coarse country", "Everything in Starter"]},
    {"id": "pro", "name": "Pro", "monthly": 49, "quarterly": 135, "annual": 468, "dynamicCodes": 100, "monthlyScans": 100000, "description": "For campaigns with a steady stream of scans.", "features": ["100 editable dynamic QR codes", "Up to 100,000 scans per month", "Scan time, device and coarse country", "CSV export of scan records"]},
    {"id": "enterprise", "name": "Enterprise", "monthly": None, "quarterly": None, "annual": None, "dynamicCodes": None, "monthlyScans": None, "description": "For high-volume programmes and custom requirements.", "features": ["Custom code and scan limits", "Custom pricing by volume", "Discuss rollout requirements with our team"]},
]
STATIC_QR_PACK = {"id": "static_qr_pack", "name": "Static QR pack", "price": 2, "credits": 3, "description": "A one-time purchase for three downloadable static QR codes.", "features": ["3 static QR code generations", "Custom colours, patterns, frames and logos", "PNG downloads included", "Codes never expire"]}
INTERVALS = {"monthly": "month", "quarterly": "3 months", "annual": "year"}


def subscription_is_current(user):
    """True while a paid plan is active. An empty end date means access granted by hand (e.g. in admin)."""
    if not user or user.subscription_status != "active":
        return False
    return user.current_period_end is None or user.current_period_end > timezone.now()


def active_plan(user):
    if not subscription_is_current(user):
        return None
    return next((plan for plan in PLANS if plan["id"] == user.plan_id and plan["dynamicCodes"] != 0), None)


def user_json(user):
    if not user:
        return None
    status = user.subscription_status or "free"
    if status == "active" and not subscription_is_current(user):
        status = "expired"  # paid period has ended; plan_id is kept so the page can offer "Renew"
    return {
        "id": str(user.id),
        "name": user.display_name or user.email.split("@", 1)[0],
        "email": user.email,
        "createdAt": user.date_joined.isoformat(),
        "subscription": {"planId": user.plan_id or "free", "status": status, "interval": user.billing_interval, "currentPeriodEnd": user.current_period_end.isoformat() if user.current_period_end else None},
        "staticQrCredits": user.static_qr_credits,
    }


def folder_json(folder):
    return {"id": str(folder.id), "userId": str(folder.user_id), "name": folder.name, "createdAt": folder.created_at.isoformat(), "codeCount": folder.qr_codes.count()}


def code_json(code):
    return {
        "id": str(code.id), "userId": str(code.user_id), "name": code.name, "type": code.type, "payload": code.payload,
        "fields": code.fields, "svg": code.svg, "format": code.format, "design": code.design,
        "folderId": str(code.folder_id) if code.folder_id else None, "status": code.status, "dynamic": code.dynamic,
        "redirectUrl": f"{settings.QR_REDIRECT_ORIGIN}/r/{code.id}" if code.dynamic else None,
        "scanCount": code.scan_count, "lastScannedAt": code.last_scanned_at.isoformat() if code.last_scanned_at else None,
        "createdAt": code.created_at.isoformat(), "updatedAt": code.updated_at.isoformat(),
    }
