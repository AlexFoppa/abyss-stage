from passlib.context import CryptContext
_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
def hash_password(password: str) -> str: return _pwd.hash(password)
def verify_password(password: str, password_hash: str) -> bool: return _pwd.verify(password, password_hash)
