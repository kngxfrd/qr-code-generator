# Free QR Generator

Free QR Generator is a React + TypeScript frontend backed by Django, Django REST Framework and SQLite by default. The frontend uses Vite during development. The API schema is documented with Swagger UI.

## Run locally

Install Node.js 20 or newer and Python 3.12 or newer, then open PowerShell in this project directory:

```powershell
Copy-Item .env.example .env
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
npm install
python manage.py migrate
python manage.py import_legacy_data
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). `npm run dev` starts Vite and Django together. The development server proxies API requests and Google OAuth callbacks to Django.

To access Django's admin, create an admin account in another terminal:

```powershell
python manage.py createsuperuser
```

Then open [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/). The API's Swagger UI is at [http://127.0.0.1:8000/api/docs/](http://127.0.0.1:8000/api/docs/); the raw OpenAPI schema is at `/api/schema/` and ReDoc is at `/api/redoc/`.

If you have no data from the old Node version, omit `python manage.py import_legacy_data`. The command reads `.freeqr-data/database.json`, imports accounts, folders, QR codes and scans, and does not import old browser sessions, so users sign in again. Legacy password hashes are checked by Django and upgraded to Django's current password hasher after a successful sign-in. Use `--file PATH` for a different JSON file. Use `--replace` only if you intend to replace already imported app data.

## Google sign-in

Set your own `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Add this authorized redirect URI to the Google OAuth client:

```text
http://127.0.0.1:3000/auth/google/callback
```

Keep `.env` private. `.env.example` contains placeholders only. Google sign-in remains unavailable until valid OAuth credentials are configured.

## Production notes

Set a long random `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, a production `DJANGO_ALLOWED_HOSTS`, a persistent `DATABASE_URL` (PostgreSQL is supported), and `PUBLIC_ORIGIN` to the public HTTPS origin. Run migrations, build the frontend with `npm run build`, collect static assets with `python manage.py collectstatic`, and serve Django through a production WSGI/ASGI server behind HTTPS. Use a trusted reverse proxy and enable country-header analytics only if it overwrites `CF-IPCountry`.

Static QR codes are sold in one-time packs of three for $2. Configure `PAYSTACK_SECRET_KEY` to enable checkout; `PAYSTACK_CURRENCY` and `PAYSTACK_USD_TO_LOCAL_RATE` control the settlement currency and conversion. The dynamic QR subscriptions remain separate. In production, use Render PostgreSQL and run migrations on deploy so paid QR credits persist.

## Main directories

- `frontend/src/` — typed React routes, reusable components, API client and shared styles.
- `backend/config/` — Django project settings, ASGI/WSGI and URL configuration.
- `backend/core/` — user, folder, QR, scan and support-message models, API, admin and legacy import command.
- `.freeqr-data/` — existing Node-era data source; retained for migration.
