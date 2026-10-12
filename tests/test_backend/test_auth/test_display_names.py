"""Никнеймы: регистр важен, визуальные двойники из разных раскладок запрещены."""

import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock

from auth.display_names import canonicalize_display_name, clean_display_name
from auth.manager import UserManager
from auth.schemas import UserCreate


def test_clean_collapses_spaces_and_nfkc():
    assert clean_display_name("  Сильный   Игрок  ") == "Сильный Игрок"
    assert clean_display_name("Ａdmin") == "Admin"


def test_case_matters_different_keys():
    assert canonicalize_display_name("Тест") != canonicalize_display_name("тест")
    assert canonicalize_display_name("Player") != canonicalize_display_name("player")


def test_cyrillic_latin_twins_share_key():
    assert canonicalize_display_name("Аdmin") == canonicalize_display_name("Admin")
    assert canonicalize_display_name("аdmin") == canonicalize_display_name("admin")
    assert canonicalize_display_name("Мамка") == canonicalize_display_name("Mamka")


def test_greek_twins_share_key():
    assert canonicalize_display_name("Αdmin") == canonicalize_display_name("Admin")


def test_distinct_nicks_have_distinct_keys():
    assert canonicalize_display_name("Конь") != canonicalize_display_name("Слон")
    assert canonicalize_display_name("Player1") != canonicalize_display_name("Player2")


def test_zero_and_letter_o_share_key():
    assert canonicalize_display_name("Player0") == canonicalize_display_name("PlayerO")


def test_cyrillic_te_maps_to_latin_t():
    assert canonicalize_display_name("т") == canonicalize_display_name("t")


def test_full_word_spoof_shares_key():
    # Целое слово, набранное двойниками: кириллические А + украинская і.
    assert canonicalize_display_name("Аdmіn") == canonicalize_display_name("Admin")
    assert canonicalize_display_name("Кот") == canonicalize_display_name("Kot")


def test_migration_backfill_map_matches_runtime():
    """Карта в миграции пересчёта обязана совпадать с рантаймом.

    Иначе backfill запишет ключи, которые проверка регистрации не узнает:
    либо дыра для двойников, либо ложные 409 у существующих юзеров.
    """
    import importlib.util
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[3]
    migration_path = (
        repo_root
        / "backend"
        / "alembic"
        / "versions"
        / "c5d8e1a4b902_fix_nickname_confusables.py"
    )
    spec = importlib.util.spec_from_file_location(
        "nickname_confusables_migration", migration_path
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    import auth.display_names as runtime

    assert module._CONFUSABLES == runtime._CONFUSABLES


def _payload(**overrides):
    data = {
        "email": "bowie@chess.org",
        "password": "N0tChess!R0cks_2026",
        "display_name": "Игрок",
    }
    data.update(overrides)
    return UserCreate(**data)


@pytest.mark.asyncio
async def test_manager_rejects_cyrillic_twin_of_taken_nick():
    """Занят 'Admin' (латиница) — кириллическая 'Аdmin' отклоняется с 409."""
    user_db = AsyncMock()
    hit = AsyncMock()
    hit.scalar.return_value = "existing-user-id"
    user_db.session = hit
    manager = UserManager(user_db)

    with pytest.raises(HTTPException) as exc_info:
        await manager.create(_payload(display_name="Аdmin"))
    assert exc_info.value.status_code == 409
    assert "никнейм" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_manager_allows_same_letters_different_case():
    """Регистр важен: 'Player' при занятом 'player' — не конфликт."""
    user_db = AsyncMock()
    hit = AsyncMock()
    hit.scalar.return_value = None
    user_db.session = hit
    manager = UserManager(user_db)

    created = AsyncMock()
    created.display_name = "Player"
    # Подменяем только финальное создание в БД, остальной путь настоящий.
    # (plain-функция на классе становится bound-методом — принимаем self).
    async def fake_super_create(self, user_create, safe=False, request=None):
        return created
    import fastapi_users.manager as fu_manager
    original = fu_manager.BaseUserManager.create
    fu_manager.BaseUserManager.create = fake_super_create
    try:
        result = await manager.create(_payload(display_name="Player"))
    finally:
        fu_manager.BaseUserManager.create = original

    assert result is created
    assert created.display_name_key == "Player"
    # Проверка шла именно по каноническому ключу, а не по lower().
    queried_select = hit.scalar.call_args[0][0]
    assert "display_name_key" in str(queried_select)
