import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi_users.password import PasswordHelper
from sqlalchemy import select

from auth.models import User, UserRole
from database import async_session_maker, engine


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DEMO_ACCOUNTS = (
    {
        "email": "admin@coolchess.com",
        "legacy_email": "admin@coolchess.local",
        "password": "Rook&River_74Moon",
        "display_name": "Тестовый администратор",
        "role": UserRole.ADMIN,
        "is_superuser": True,
    },
    {
        "email": "coach@coolchess.com",
        "legacy_email": "coach@coolchess.local",
        "password": "Bishop!Cedar_83Lake",
        "display_name": "Тестовый тренер",
        "role": UserRole.COACH,
        "is_superuser": False,
    },
    {
        "email": "student@coolchess.com",
        "legacy_email": "student@coolchess.local",
        "password": "Knight#Cloud_59Pine",
        "display_name": "Тестовый ученик",
        "role": UserRole.STUDENT,
        "is_superuser": False,
    },
)


async def seed_demo_accounts() -> None:
    environment = os.getenv("ENV", "").casefold()
    enabled = os.getenv("ENABLE_DEMO_ACCOUNTS", "").casefold() == "true"
    if environment not in {"development", "test", "testing"}:
        raise RuntimeError(
            "Demo accounts can only be seeded when ENV=development or ENV=test."
        )
    if not enabled:
        raise RuntimeError(
            "Set ENABLE_DEMO_ACCOUNTS=true explicitly to create or reset demo accounts."
        )

    password_helper = PasswordHelper()
    async with async_session_maker() as session:
        for account in DEMO_ACCOUNTS:
            user = await session.scalar(
                select(User).where(User.email == account["email"])
            )
            if user is None:
                user = await session.scalar(
                    select(User).where(User.email == account["legacy_email"])
                )
            if user is None:
                user = User(email=account["email"])
                session.add(user)
            else:
                user.email = account["email"]

            user.hashed_password = password_helper.hash(account["password"])
            user.display_name = account["display_name"]
            user.role = account["role"]
            user.is_active = True
            user.is_verified = True
            user.is_superuser = account["is_superuser"]

        await session.commit()

    print("Demo accounts created or reset:")
    for account in DEMO_ACCOUNTS:
        print(f"  {account['email']}")


if __name__ == "__main__":
    try:
        asyncio.run(seed_demo_accounts())
    finally:
        asyncio.run(engine.dispose())
