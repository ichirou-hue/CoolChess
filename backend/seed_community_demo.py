"""Populate an isolated development database with visible community data.

This script only inserts missing demo accounts and one demo tournament. It
never resets existing accounts or deletes user data.
"""

import asyncio
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi_users.password import PasswordHelper
from sqlalchemy import insert, select

from auth.display_names import canonicalize_display_name
from auth.models import Puzzle, User, UserRole, user_solved_puzzles
from database import async_session_maker, engine
from tournaments.models import Tournament, TournamentParticipant


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

COMMUNITY_PLAYERS = (
    ("aleks99", 1428, 8, 1840),
    ("chess_king", 1362, 7, 1510),
    ("knightfox", 1294, 6, 1180),
    ("maria_check", 1248, 6, 1020),
    ("rookie_rook", 1196, 5, 870),
    ("rapidcat", 1164, 5, 790),
    ("tacticfox", 1120, 4, 680),
    ("bluebishop", 1088, 4, 590),
    ("pawnstorm", 1056, 4, 510),
    ("little_maia", 1028, 3, 430),
    ("quietmove", 998, 3, 380),
    ("endgame_pro", 972, 3, 330),
    ("whiteknight", 948, 2, 280),
    ("blackbishop", 920, 2, 230),
    ("castling_time", 896, 2, 190),
    ("mate_in_two", 870, 1, 150),
    ("first_pawn", 842, 1, 100),
    ("new_player", 810, 1, 50),
)
GENERATED_PLAYERS = tuple(
    (
        f"rookie_{index:03d}",
        650 + ((index * 137) % 850),
        1 + (index % 9),
        60 + (index * 47),
    )
    for index in range(1, 124)
)
ALL_COMMUNITY_PLAYERS = COMMUNITY_PLAYERS + GENERATED_PLAYERS

RACE_NAME = "Недельный спринт (Лига новичков)"
CUP_NAME = "Кубок гроссмейстеров"


async def seed_community_demo() -> None:
    environment = os.getenv("ENV", "").casefold()
    enabled = os.getenv("ENABLE_COMMUNITY_DEMO", "").casefold() == "true"
    if environment not in {"development", "test", "testing"}:
        raise RuntimeError("Community demo data can only be seeded in development or test.")
    if not enabled:
        raise RuntimeError("Set ENABLE_COMMUNITY_DEMO=true to seed community demo data.")

    password_helper = PasswordHelper()
    async with async_session_maker() as session:
        race = await session.scalar(select(Tournament).where(Tournament.name == RACE_NAME))
        if race is None:
            creator = await session.scalar(
                select(User).where(User.is_active.is_(True)).order_by(User.id.asc()).limit(1)
            )
            if creator is None:
                raise RuntimeError("Create a real local account before seeding the community demo.")
        else:
            creator = await session.get(User, race.created_by_id)
            if creator is None:
                raise RuntimeError("The existing community race has no creator account.")

        players: list[User] = []
        for index, (handle, rating, level, xp) in enumerate(ALL_COMMUNITY_PLAYERS, start=1):
            email = f"{handle}@community.coolchess.test"
            display_key = canonicalize_display_name(handle)
            player = await session.scalar(select(User).where(User.email == email))
            if player is None:
                player = await session.scalar(
                    select(User).where(User.display_name_key == display_key)
                )
            if player is None:
                player = User(
                    id=uuid.uuid4(),
                    email=email,
                    hashed_password=password_helper.hash(secrets.token_urlsafe(32)),
                    display_name=handle,
                    display_name_key=display_key,
                    role=UserRole.STUDENT,
                    is_active=True,
                    is_verified=True,
                    is_superuser=False,
                    elo_rating=rating,
                    level=level,
                    xp=xp,
                    games_played=10 + index * 3,
                )
                session.add(player)
            players.append(player)

        await session.flush()

        puzzle_ids = (await session.scalars(select(Puzzle.id).order_by(Puzzle.id))).all()
        if puzzle_ids:
            player_ids = [player.id for player in players if player.email.endswith("@community.coolchess.test")]
            existing_solutions = set(
                (await session.execute(
                    select(user_solved_puzzles.c.user_id, user_solved_puzzles.c.puzzle_id).where(
                        user_solved_puzzles.c.user_id.in_(player_ids)
                    )
                )).all()
            )
            new_solutions = []
            for index, player in enumerate(players, start=1):
                if player.id not in player_ids:
                    continue
                for puzzle_id in puzzle_ids[:index % 14]:
                    pair = (player.id, puzzle_id)
                    if pair not in existing_solutions:
                        new_solutions.append({"user_id": player.id, "puzzle_id": puzzle_id})
            if new_solutions:
                await session.execute(insert(user_solved_puzzles), new_solutions)

        if race is None:
            race = Tournament(
                name=RACE_NAME,
                description="Недельная гонка для учеников: сыграй несколько партий и поднимись в рейтинге.",
                format="round_robin",
                time_control=300,
                increment=3,
                max_players=32,
                status="registration",
                ends_at=datetime.now(timezone.utc) + timedelta(days=7),
                prize="500 монет и медаль чемпиона",
                created_by_id=creator.id,
            )
            session.add(race)
            await session.flush()

        existing_ids = set(
            (await session.scalars(
                select(TournamentParticipant.user_id).where(
                    TournamentParticipant.tournament_id == race.id
                )
            )).all()
        )
        # The current local account and the first seven demo players appear in
        # the race, so the race card is useful immediately after seeding.
        for participant in [creator, *players[:7]]:
            if participant.id not in existing_ids:
                session.add(
                    TournamentParticipant(tournament_id=race.id, user_id=participant.id)
                )

        cup = await session.scalar(select(Tournament).where(Tournament.name == CUP_NAME))
        if cup is None:
            cup = Tournament(
                name=CUP_NAME,
                description="Открытый швейцарский турнир для всего сообщества CoolChess.",
                format="swiss",
                time_control=600,
                increment=5,
                max_players=64,
                status="registration",
                ends_at=datetime.now(timezone.utc) + timedelta(days=7),
                prize="1000 монет и кубок",
                created_by_id=creator.id,
            )
            session.add(cup)
            await session.flush()

        cup_ids = set(
            (await session.scalars(
                select(TournamentParticipant.user_id).where(
                    TournamentParticipant.tournament_id == cup.id
                )
            )).all()
        )
        for participant in players[8:40]:
            if participant.id not in cup_ids:
                session.add(
                    TournamentParticipant(tournament_id=cup.id, user_id=participant.id)
                )

        await session.commit()
        print(f"Community demo is ready: {len(ALL_COMMUNITY_PLAYERS)} demo users; events: {RACE_NAME}, {CUP_NAME}.")


if __name__ == "__main__":
    try:
        asyncio.run(seed_community_demo())
    finally:
        asyncio.run(engine.dispose())
