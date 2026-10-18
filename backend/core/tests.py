import json
from django.test import TestCase, Client
from django.urls import reverse
from backend.core.models import User, QRFolder, QRCode, Scan, ContactMessage


class BackendCoreTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="testuser@example.com",
            display_name="Test User",
            password="StrongPassword123!",
        )

    def test_health_check(self):
        response = self.client.get(reverse("health"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "service": "free-qr-generator"})

    def test_swagger_and_openapi(self):
        response = self.client.get(reverse("swagger-ui"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response["content-type"])

        schema_res = self.client.get(reverse("schema"))
        self.assertEqual(schema_res.status_code, 200)

        redoc_res = self.client.get(reverse("redoc"))
        self.assertEqual(redoc_res.status_code, 200)

    def test_auth_me_anonymous(self):
        response = self.client.get(reverse("me"))
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["user"])

    def test_auth_flow(self):
        # Signup
        signup_res = self.client.post(
            reverse("signup"),
            data=json.dumps({"name": "New User", "email": "newuser@example.com", "password": "StrongPassword999!"}),
            content_type="application/json",
        )
        self.assertEqual(signup_res.status_code, 201)
        self.assertEqual(signup_res.json()["user"]["email"], "newuser@example.com")

        # Me while signed in
        me_res = self.client.get(reverse("me"))
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.json()["user"]["email"], "newuser@example.com")

        # Signout
        signout_res = self.client.post(reverse("signout"), content_type="application/json")
        self.assertEqual(signout_res.status_code, 200)
        self.assertEqual(signout_res.json(), {"ok": True})

        # Me after signout
        me_after = self.client.get(reverse("me"))
        self.assertIsNone(me_after.json()["user"])

        # Signin
        signin_res = self.client.post(
            reverse("signin"),
            data=json.dumps({"email": "newuser@example.com", "password": "StrongPassword999!"}),
            content_type="application/json",
        )
        self.assertEqual(signin_res.status_code, 200)
        self.assertEqual(signin_res.json()["user"]["email"], "newuser@example.com")

    def test_folders_and_codes_crud(self):
        self.client.force_login(self.user)

        # Create folder
        f_res = self.client.post(
            reverse("folders"),
            data=json.dumps({"name": "Marketing"}),
            content_type="application/json",
        )
        self.assertEqual(f_res.status_code, 201)
        folder_id = f_res.json()["folder"]["id"]

        # List folders
        folders_res = self.client.get(reverse("folders"))
        self.assertEqual(folders_res.status_code, 200)
        self.assertEqual(len(folders_res.json()["folders"]), 1)

        # Create static QR code
        svg_content = '<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>'
        c_res = self.client.post(
            reverse("codes"),
            data=json.dumps({
                "name": "Company Website",
                "type": "website",
                "payload": "https://example.com",
                "svg": svg_content,
                "folderId": folder_id,
                "dynamic": False,
            }),
            content_type="application/json",
        )
        self.assertEqual(c_res.status_code, 201)
        code_id = c_res.json()["code"]["id"]

        # Retrieve code
        get_code = self.client.get(reverse("code-detail", kwargs={"code_id": code_id}))
        self.assertEqual(get_code.status_code, 200)
        self.assertEqual(get_code.json()["code"]["name"], "Company Website")

        # Update code
        patch_code = self.client.patch(
            reverse("code-detail", kwargs={"code_id": code_id}),
            data=json.dumps({"name": "Updated Website"}),
            content_type="application/json",
        )
        self.assertEqual(patch_code.status_code, 200)
        self.assertEqual(patch_code.json()["code"]["name"], "Updated Website")

        # Delete code
        del_code = self.client.delete(reverse("code-detail", kwargs={"code_id": code_id}))
        self.assertEqual(del_code.status_code, 200)
        self.assertEqual(QRCode.objects.count(), 0)

    def test_dynamic_code_and_redirect(self):
        # Give user active pro subscription
        self.user.plan_id = "pro"
        self.user.subscription_status = "active"
        self.user.save()

        self.client.force_login(self.user)
        svg_content = '<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>'
        c_res = self.client.post(
            reverse("codes"),
            data=json.dumps({
                "name": "Dynamic Link",
                "type": "website",
                "payload": "https://example.com/promo",
                "svg": svg_content,
                "dynamic": True,
            }),
            content_type="application/json",
        )
        self.assertEqual(c_res.status_code, 201)
        code_id = c_res.json()["code"]["id"]

        # Test redirect view without authentication (anonymous scanner)
        anon_client = Client()
        redir_res = anon_client.get(reverse("dynamic-redirect", kwargs={"code_id": code_id}), HTTP_USER_AGENT="Mozilla/5.0 (iPhone)")
        self.assertEqual(redir_res.status_code, 302)
        self.assertEqual(redir_res["Location"], "https://example.com/promo")

        # Scan should be recorded
        code = QRCode.objects.get(id=code_id)
        self.assertEqual(code.scan_count, 1)
        self.assertEqual(Scan.objects.count(), 1)
        scan = Scan.objects.first()
        self.assertEqual(scan.device, "mobile")

    def test_contact_form(self):
        res = self.client.post(
            reverse("contact"),
            data=json.dumps({
                "name": "Alice Scanner",
                "email": "alice@example.org",
                "subject": "Question about printing",
                "message": "Hello, I would like to know the best resolution for print posters.",
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(ContactMessage.objects.count(), 1)
        msg = ContactMessage.objects.first()
        self.assertEqual(msg.name, "Alice Scanner")
        self.assertEqual(msg.subject, "Question about printing")
