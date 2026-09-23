import uuid
import hashlib
import secrets
from typing import Optional, Dict

# Временная база в оперативной памяти до подключения Postgres
USERS_DATABASE: Dict[str, dict] = {}        # email -> данные пользователя
ACTIVE_SESSIONS: Dict[str, str] = {}        # session_token -> user_id

def hash_password(password: str, salt: Optional[str] = None) -> str:
    """Безопасное хэширование пароля с уникальной солью."""
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((password + salt).encode("utf-8")).hexdigest()
    return f"{salt}:{hashed}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Проверка введенного пароля против сохраненного хэша."""
    try:
        salt, _ = stored_hash.split(":", 1)
        return hash_password(password, salt) == stored_hash
    except ValueError:
        return False