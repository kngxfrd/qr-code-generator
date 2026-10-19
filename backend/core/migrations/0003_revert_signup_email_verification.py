from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_email_verification_code"),
    ]

    operations = [
        migrations.DeleteModel(name="EmailVerificationCode"),
        migrations.RemoveField(model_name="user", name="email_verified"),
    ]
