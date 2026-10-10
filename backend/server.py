from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from puzzles.puzzle_routes import puzzle_router
from games.game_routes import game_router
from leaderboard.leaderboard_routes import leaderboard_router
from bot.bot_routes import bot_router
from clans.clan_routes import clan_router
from auth.users_routes import users_router
from learning.course_routes import course_router
from pvp.pvp_routes import pvp_router, pvp_http_router, pvp_api_router
from pvp.manager import pvp_manager

from auth.manager import (
    auth_backend,
    fastapi_users,
)
from auth.schemas import UserRead, UserCreate, UserUpdate




@asynccontextmanager
async def lifespan(app: FastAPI):
    # Фоновый таймер шахматных часов PvP (таймауты + TTL-чистка комнат).
    await pvp_manager.start_background_tasks()
    yield
    await pvp_manager.stop_background_tasks()


app = FastAPI(title="CoolChess API", lifespan=lifespan)

# CORS: явный список origin из окружения, wildcard запрещен —
# комбинация allow_origins=["*"] + allow_credentials=True небезопасна.
# Пример: CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Доменные роутеры CoolChess
app.include_router(puzzle_router)
app.include_router(game_router)
app.include_router(leaderboard_router)
app.include_router(bot_router)
app.include_router(users_router)
app.include_router(course_router)
app.include_router(clan_router)
app.include_router(pvp_router)
app.include_router(pvp_http_router)
app.include_router(pvp_api_router)

# 2. Аутентификация и управление аккаунтом (fastapi-users)
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/auth/jwt",
    tags=["Auth"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["Auth"],
)
app.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/api/auth",
    tags=["Auth"],
)
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/api/auth",
    tags=["Auth"],
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["Users"],
)


@app.get("/health", tags=["System"])
def health():
    return {"status": "ok", "app": "CoolChess Server"}
