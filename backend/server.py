from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from puzzles.puzzle_routes import puzzle_router



from auth.manager import (
    auth_backend,
    fastapi_users,
    current_active_user,
    current_verified_user,
    require_role,
)
from auth.schemas import UserRead, UserCreate, UserUpdate
from auth.models import User, UserRole
from bot.bot_routes import bot_router

app = FastAPI(title="CoolChess API")

# Регистрируем роутер задач
app.include_router(puzzle_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Логин / Логаут по JWT: /api/auth/jwt/login, /api/auth/jwt/logout
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/auth/jwt",
    tags=["Auth"],
)

# 2. Регистрация: /api/auth/register
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["Auth"],
)

# 3. Верификация Email: /api/auth/request-verify-token, /api/auth/verify
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/api/auth",
    tags=["Auth"],
)

# 4. Профиль текущего пользователя: /api/users/me
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["Users"],
)

# 5. Роуты шахматного бота
app.include_router(bot_router)

# 6. Пример защищенного роута для авторизованных игроков
@app.get("/api/me/profile", tags=["Player"])
async def get_player_profile(user: User = Depends(current_active_user)):
    return {
        "email": user.email,
        "role": user.role,
        "elo": user.elo_rating,
        "is_verified": user.is_verified,
    }

# 7. Пример роута только для тренеров (RBAC)
@app.get("/api/coach/dashboard", tags=["Coach"])
async def coach_dashboard(user: User = Depends(require_role(UserRole.COACH))):
    return {"message": f"Добро пожаловать в тренерскую панель, {user.email}!"}

@app.get("/health")
def health():
    return {"status": "ok", "app": "CoolChess Server"}