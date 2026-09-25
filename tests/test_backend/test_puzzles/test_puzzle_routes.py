import pytest
from unittest.mock import MagicMock
from sqlalchemy.exc import IntegrityError
from auth.models import Puzzle


def make_fake_puzzle(
    puzzle_id="00qIK",
    fen="r1bqk2r/pp1p1ppp/2n5/4p3/1b2P3/1NN5/PPP2PPP/R1BQKB1R w KQkq - 1 7",
    moves="c6a8 b6e3 d1e2",
    rating=1526,
    popularity=95,
    themes="advantage intermezzo middlegame",
    game_url="https://lichess.org/test1234"
):
    puzzle = MagicMock(spec=Puzzle)
    puzzle.id = puzzle_id
    puzzle.fen = fen
    puzzle.moves = moves
    puzzle.rating = rating
    puzzle.popularity = popularity
    puzzle.themes = themes
    puzzle.game_url = game_url
    return puzzle


# --- 1. ПРОВЕРКА АВТОРИЗАЦИИ (401 UNAUTHORIZED) ---

@pytest.mark.asyncio
async def test_get_random_puzzle_unauthorized(anonymous_client):
    response = await anonymous_client.get("/api/puzzles/random")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_solve_puzzle_unauthorized(anonymous_client):
    response = await anonymous_client.post(
        "/api/puzzles/00qIK/solve",
        json={"user_moves": "b6e3"}
    )
    assert response.status_code == 401


# --- 2. GET /api/puzzles/random ---

@pytest.mark.asyncio
async def test_get_random_puzzle_success(authorized_client):
    client, user, db = authorized_client
    fake_puzzle = make_fake_puzzle()

    # Имитируем возврат одной случайной задачи
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = fake_puzzle
    db.execute.return_value = mock_result

    response = await client.get("/api/puzzles/random?difficulty=intermediate")
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == "00qIK"
    assert data["fen"] == fake_puzzle.fen
    # Первый ход оппонента — c6a8
    assert data["initial_move"] == "c6a8"
    assert data["rating"] == 1526
    assert "intermezzo" in data["themes"]


@pytest.mark.asyncio
async def test_get_random_puzzle_not_found(authorized_client):
    client, user, db = authorized_client

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_result

    response = await client.get("/api/puzzles/random?min_rating=3500")
    assert response.status_code == 404
    assert "не найдена" in response.json()["detail"]


# --- 3. POST /api/puzzles/{id}/solve ---

@pytest.mark.asyncio
async def test_solve_puzzle_not_found(authorized_client):
    client, user, db = authorized_client

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_result

    response = await client.post(
        "/api/puzzles/unknown_id/solve",
        json={"user_moves": "e2e4"}
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_solve_puzzle_wrong_move(authorized_client):
    client, user, db = authorized_client
    fake_puzzle = make_fake_puzzle()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = fake_puzzle
    db.execute.return_value = mock_result

    # Ожидаемый правильный ход — b6e3, отправляем неверный g8f6
    response = await client.post(
        f"/api/puzzles/{fake_puzzle.id}/solve",
        json={"user_moves": "g8f6"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_correct"] is False
    assert data["already_solved"] is False
    assert data["xp_earned"] == 0
    assert "Неверный ход" in data["message"]


@pytest.mark.asyncio
async def test_solve_puzzle_correct_first_time(authorized_client):
    client, user, db = authorized_client
    fake_puzzle = make_fake_puzzle(rating=1526)  # Попадает во второй тир: xp=30, coins=10, elo=8

    # Настраиваем возвраты db.execute:
    # 1-й вызов: поиск задачи
    # 2-й вызов: проверка user_solved_puzzles (возвращает None -> первая попытка)
    # 3-й вызов: вставка записи об успешном решении
    res_puzzle = MagicMock()
    res_puzzle.scalar_one_or_none.return_value = fake_puzzle

    res_already_solved = MagicMock()
    res_already_solved.first.return_value = None

    res_insert = MagicMock()

    db.execute.side_effect = [res_puzzle, res_already_solved, res_insert]

    response = await client.post(
        f"/api/puzzles/{fake_puzzle.id}/solve",
        json={"user_moves": "b6e3"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["is_correct"] is True
    assert data["already_solved"] is False
    assert data["xp_earned"] == 30
    assert data["coins_earned"] == 10
    assert data["elo_change"] == 8
    assert data["new_level"] is not None

    # Проверяем, что прогресс начислен на объект пользователя
    assert user.xp == 30
    assert user.coins == 10
    assert user.elo_rating == 1208
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_solve_puzzle_already_solved_repeat(authorized_client):
    client, user, db = authorized_client
    fake_puzzle = make_fake_puzzle()

    res_puzzle = MagicMock()
    res_puzzle.scalar_one_or_none.return_value = fake_puzzle

    res_already_solved = MagicMock()
    res_already_solved.first.return_value = ("user_id", "00qIK")  # Уже есть в таблице

    db.execute.side_effect = [res_puzzle, res_already_solved]

    response = await client.post(
        f"/api/puzzles/{fake_puzzle.id}/solve",
        json={"user_moves": "b6e3"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["is_correct"] is True
    assert data["already_solved"] is True
    assert data["xp_earned"] == 0
    assert data["coins_earned"] == 0
    assert data["elo_change"] == 0
    assert data["new_level"] is None


@pytest.mark.asyncio
async def test_solve_puzzle_concurrent_race_no_double_rewards(authorized_client):
    # Гонка: два параллельных запроса оба прошли проверку already_solved,
    # но составной PK пропустил только один — второй ловит IntegrityError
    # и получает already_solved=True без повторных наград.
    client, user, db = authorized_client
    fake_puzzle = make_fake_puzzle(rating=1526)

    res_puzzle = MagicMock()
    res_puzzle.scalar_one_or_none.return_value = fake_puzzle

    res_already_solved = MagicMock()
    res_already_solved.first.return_value = None

    db.execute.side_effect = [
        res_puzzle,
        res_already_solved,
        IntegrityError("INSERT INTO user_solved_puzzles", {}, Exception("duplicate key")),
    ]

    response = await client.post(
        f"/api/puzzles/{fake_puzzle.id}/solve",
        json={"user_moves": "b6e3"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["is_correct"] is True
    assert data["already_solved"] is True
    assert data["xp_earned"] == 0
    assert data["coins_earned"] == 0
    assert data["elo_change"] == 0
    # Награды не начислены повторно
    assert user.xp == 0
    assert user.coins == 0
    assert user.elo_rating == 1200
    db.rollback.assert_awaited_once()