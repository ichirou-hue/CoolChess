import secrets
import uuid
from fastapi import APIRouter, Response, Request, status
from fastapi.responses import JSONResponse

from auth.auth_schemas import StudentRegisterRequest, StudentLoginRequest
from auth.auth_service import (
    USERS_DATABASE, 
    ACTIVE_SESSIONS, 
    hash_password, 
    verify_password
)

auth_router = APIRouter(prefix="/api/auth", tags=["Авторизация учеников"])

def error_response(code: str, message: str, fields: dict = None, status_code: int = 400):
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "fields": fields or {}}}
    )

@auth_router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_student(body: StudentRegisterRequest, response: Response):
    email = body.email.lower()
    if email in USERS_DATABASE:
        return error_response(
            code="EMAIL_ALREADY_EXISTS",
            message="Пользователь с таким email уже существует",
            fields={"email": "Email уже занят"},
            status_code=status.HTTP_400_BAD_REQUEST
        )

    user_id = str(uuid.uuid4())
    user_data = {
        "id": user_id,
        "email": email,
        "displayName": body.displayName,
        "role": "student",
        "password_hash": hash_password(body.password)
    }
    USERS_DATABASE[email] = user_data

    # Создаем сессию и пишем в HttpOnly cookie
    session_token = secrets.token_hex(32)
    ACTIVE_SESSIONS[session_token] = user_id
    response.set_cookie(key="session_token", value=session_token, httponly=True, samesite="lax", secure=False)

    return {"user": {"id": user_id, "email": email, "displayName": user_data["displayName"], "role": "student"}}

@auth_router.post("/login")
async def login_student(body: StudentLoginRequest, response: Response):
    email = body.email.lower()
    user = USERS_DATABASE.get(email)

    if not user or not verify_password(body.password, user["password_hash"]):
        return error_response(
            code="INVALID_CREDENTIALS",
            message="Неверный email или пароль",
            fields={"email": "Проверь email или пароль"},
            status_code=status.HTTP_400_BAD_REQUEST
        )

    session_token = secrets.token_hex(32)
    ACTIVE_SESSIONS[session_token] = user["id"]
    response.set_cookie(key="session_token", value=session_token, httponly=True, samesite="lax", secure=False)

    return {"user": {"id": user["id"], "email": user["email"], "displayName": user["displayName"], "role": "student"}}

@auth_router.get("/me")
async def get_current_student(request: Request):
    token = request.cookies.get("session_token")
    if not token or token not in ACTIVE_SESSIONS:
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"error": {"code": "UNAUTHORIZED", "message": "Не авторизован", "fields": {}}})

    user_id = ACTIVE_SESSIONS[token]
    user = next((u for u in USERS_DATABASE.values() if u["id"] == user_id), None)
    if not user:
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"error": {"code": "UNAUTHORIZED", "message": "Сессия не найдена", "fields": {}}})

    return {"user": {"id": user["id"], "email": user["email"], "displayName": user["displayName"], "role": "student"}}

@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_student(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token and token in ACTIVE_SESSIONS:
        del ACTIVE_SESSIONS[token]
    response.delete_cookie(key="session_token")
    return Response(status_code=status.HTTP_204_NO_CONTENT)