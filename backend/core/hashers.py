import hashlib
import hmac

from django.contrib.auth.hashers import BasePasswordHasher, mask_hash


class LegacyScryptPasswordHasher(BasePasswordHasher):
    """Verifies Node's historical crypto.scrypt hashes during migration."""

    algorithm = "freeqr_scrypt"
    n = 16384
    r = 8
    p = 1
    dklen = 64

    def salt(self):
        return ""

    def encode(self, password, salt):
        digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=self.n, r=self.r, p=self.p, dklen=self.dklen)
        return f"{self.algorithm}${salt}${digest.hex()}"

    def verify(self, password, encoded):
        algorithm, salt, expected = encoded.split("$", 2)
        return algorithm == self.algorithm and hmac.compare_digest(self.encode(password, salt), encoded)

    def decode(self, encoded):
        algorithm, salt, digest = encoded.split("$", 2)
        return {"algorithm": algorithm, "salt": salt, "hash": digest}

    def safe_summary(self, encoded):
        decoded = self.decode(encoded)
        return {"algorithm": decoded["algorithm"], "salt": mask_hash(decoded["salt"]), "hash": mask_hash(decoded["hash"])}

    def harden_runtime(self, password, encoded):
        pass
