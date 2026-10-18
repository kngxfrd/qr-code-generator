import json
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from backend.core.models import QRCode, QRFolder, Scan, User


def parse_date(value):
    if not value:
        return None
    try:
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return result if result.tzinfo else result.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


class Command(BaseCommand):
    help = "Import existing Free QR Generator JSON data without printing account or QR content."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(settings.BASE_DIR / ".freeqr-data" / "database.json"))
        parser.add_argument("--replace", action="store_true", help="Replace existing imported app records before import.")

    @transaction.atomic
    def handle(self, *args, **options):
        path = Path(options["file"])
        if not path.is_file():
            raise CommandError(f"Legacy data file not found: {path}")
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise CommandError("The legacy database file could not be read as valid JSON.") from exc
        if options["replace"]:
            Scan.objects.all().delete()
            QRCode.objects.all().delete()
            QRFolder.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()

        users_by_legacy_id = {}
        for record in data.get("users", []):
            email = str(record.get("email", "")).strip().lower()
            if not email:
                continue
            user, created = User.objects.get_or_create(email=email, defaults={
                "display_name": record.get("name", "")[:100],
                "plan_id": (record.get("subscription") or {}).get("planId", "free"),
                "subscription_status": (record.get("subscription") or {}).get("status", "free"),
                "billing_interval": (record.get("subscription") or {}).get("interval"),
                "current_period_end": parse_date((record.get("subscription") or {}).get("currentPeriodEnd")),
                "date_joined": parse_date(record.get("createdAt")) or datetime.now(timezone.utc),
            })
            if created and record.get("salt") and record.get("hash"):
                user.password = f"freeqr_scrypt${record['salt']}${record['hash']}"
                user.save(update_fields=["password"])
            users_by_legacy_id[record.get("id")] = user

        folders_by_legacy_id = {}
        for record in data.get("folders", []):
            user = users_by_legacy_id.get(record.get("userId"))
            if not user:
                continue
            folder, _ = QRFolder.objects.get_or_create(user=user, name=str(record.get("name", "Folder"))[:80])
            folders_by_legacy_id[record.get("id")] = folder

        codes_by_legacy_id = {}
        for record in data.get("codes", []):
            user = users_by_legacy_id.get(record.get("userId"))
            if not user:
                continue
            code_id = str(record.get("id", ""))
            if not code_id:
                continue
            code, _ = QRCode.objects.get_or_create(id=code_id, defaults={
                "user": user, "name": str(record.get("name", "QR code"))[:120], "type": str(record.get("type", "website"))[:40],
                "payload": str(record.get("payload", ""))[:10000], "fields": record.get("fields", []), "svg": str(record.get("svg", ""))[:500000],
                "format": str(record.get("format", "png"))[:8], "design": record.get("design", {}), "folder": folders_by_legacy_id.get(record.get("folderId")),
                "status": record.get("status", "Active") if record.get("status") in ("Active", "Paused") else "Active",
                "dynamic": bool(record.get("dynamic")), "scan_count": int(record.get("scanCount", 0) or 0),
                "last_scanned_at": parse_date(record.get("lastScannedAt")), "created_at": parse_date(record.get("createdAt")) or datetime.now(timezone.utc),
                "updated_at": parse_date(record.get("updatedAt")) or datetime.now(timezone.utc),
            })
            codes_by_legacy_id[record.get("id")] = code

        imported_scans = 0
        for record in data.get("scans", []):
            code = codes_by_legacy_id.get(record.get("codeId"))
            user = users_by_legacy_id.get(record.get("userId"))
            scan_id = record.get("id")
            if not code or not user or not scan_id:
                continue
            Scan.objects.get_or_create(id=scan_id, defaults={
                "user": user, "code": code, "created_at": parse_date(record.get("createdAt")) or datetime.now(timezone.utc),
                "country": str(record.get("country", "Unknown"))[:2], "device": str(record.get("device", "Unknown"))[:16],
            })
            imported_scans += 1

        self.stdout.write(self.style.SUCCESS(
            f"Imported {len(users_by_legacy_id)} accounts, {len(folders_by_legacy_id)} folders, {len(codes_by_legacy_id)} QR codes and {imported_scans} scan records."
        ))
        self.stdout.write("Legacy browser sessions and pending Google OAuth attempts were not imported; users will sign in again.")
