from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from puzzles.puzzle_routes import puzzle_router
from games.game_routes import game_router
from leaderboard.leaderboard_routes import leaderboard_router
from bot.bot_routes import bot_router
from auth.users_routes import users_router

from auth.manager import (
    auth_backend,
    fastapi_users,
)
from auth.schemas import UserRead, UserCreate, UserUpdate

app = FastAPI(title="CoolChess API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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