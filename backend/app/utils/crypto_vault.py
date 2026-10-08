import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEY_FILE = os.getenv("OXENGL_KEY_FILE", "/var/crypto/oxengl/master.key")
try:
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
except (PermissionError, OSError):
    KEY_FILE = os.path.expanduser("~/.oxengl/master.key")
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)

def ensure_master_key() -> bytes:
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, "rb") as f:
            return f.read()
    fresh_key = AESGCM.generate_key(bit_length=256)
    with open(KEY_FILE, "wb") as f:
        f.write(fresh_key)
    try:
        os.chmod(KEY_FILE, 0o600)
    except Exception:
        pass
    return fresh_key

def encrypt_bytes_aes256(raw_data: bytes, key: bytes = None) -> bytes:
    master_key = key if key is not None else ensure_master_key()
    aesgcm = AESGCM(master_key)
    nonce = os.urandom(12)
    return nonce + aesgcm.encrypt(nonce, raw_data, None)

def decrypt_bytes_aes256(encrypted_stream: bytes, key: bytes = None) -> bytes:
    master_key = key if key is not None else ensure_master_key()
    aesgcm = AESGCM(master_key)
    nonce = encrypted_stream[:12]
    ciphertext = encrypted_stream[12:]
    return aesgcm.decrypt(nonce, ciphertext, None)
