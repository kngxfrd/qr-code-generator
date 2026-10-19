from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_payment"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="static_qr_credits",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
