from rest_framework import serializers

# The rendered QR SVG can be large (logo + dots/classy patterns), so it needs a far
# higher limit than a normal text field. 5,000,000 characters is roughly 5 MB.
MAX_SVG_CHARS = 5_000_000


class SignupSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(min_length=10, write_only=True, trim_whitespace=False)


class SigninSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class FolderSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80, trim_whitespace=True)


class CodeWriteSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    type = serializers.CharField(max_length=40)
    payload = serializers.CharField(max_length=10000, trim_whitespace=True)
    fields = serializers.ListField(child=serializers.CharField(max_length=5000), max_length=10, required=False)
    svg = serializers.CharField(max_length=MAX_SVG_CHARS, trim_whitespace=False)
    format = serializers.CharField(max_length=8, required=False, allow_blank=True)
    design = serializers.DictField(required=False)
    folderId = serializers.UUIDField(required=False, allow_null=True)
    dynamic = serializers.BooleanField(required=False, default=False)
    status = serializers.ChoiceField(choices=["Active", "Paused"], required=False)


class ProfileSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)


class PasswordSerializer(serializers.Serializer):
    currentPassword = serializers.CharField(trim_whitespace=False)
    newPassword = serializers.CharField(min_length=10, trim_whitespace=False)


class ContactSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    subject = serializers.CharField(max_length=160, trim_whitespace=True)
    message = serializers.CharField(min_length=10, max_length=8000, trim_whitespace=True)
