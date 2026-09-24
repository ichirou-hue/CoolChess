import pytest
from puzzles.rewards import calculate_level, get_fixed_puzzle_rewards, REWARD_TIERS


@pytest.mark.parametrize(
    "puzzle_elo, expected_xp, expected_coins, expected_elo",
    [
        # Граничные значения для первого тира (до 1199)
        (600, 15, 5, 5),
        (1199, 15, 5, 5),
        # Второй тир (1200 - 1599)
        (1200, 30, 10, 8),
        (1526, 30, 10, 8),
        (1599, 30, 10, 8),
        # Третий тир (1600 - 1999)
        (1600, 50, 20, 12),
        (1999, 50, 20, 12),
        # Четвертый тир (2000 - 2399)
        (2000, 80, 35, 16),
        (2399, 80, 35, 16),
        # Пятый тир (2400+)
        (2400, 120, 50, 20),
        (3200, 120, 50, 20),
        # За пределами max_elo 9999 (дефолтная ветка)
        (10000, 120, 50, 20),
    ],
)
def test_get_fixed_puzzle_rewards_tiers(puzzle_elo, expected_xp, expected_coins, expected_elo):
    rewards = get_fixed_puzzle_rewards(puzzle_elo)
    assert rewards["xp_gain"] == expected_xp
    assert rewards["coins_gain"] == expected_coins
    assert rewards["elo_gain"] == expected_elo


@pytest.mark.parametrize(
    "xp, expected_level",
    [
        # 0 <= xp < 100 -> math.isqrt(0) + 1 = 1
        (0, 1),
        (50, 1),
        (99, 1),
        # 100 <= xp < 400 -> math.isqrt(1..3) + 1 = 2
        (100, 2),
        (250, 2),
        (399, 2),
        # 400 <= xp < 900 -> math.isqrt(4..8) + 1 = 3
        (400, 3),
        (899, 3),
        # 900 <= xp < 1600 -> math.isqrt(9..15) + 1 = 4
        (900, 4),
        # 1600 XP -> math.isqrt(16) + 1 = 5
        (1600, 5),
    ],
)
def test_calculate_level_progression(xp, expected_level):
    assert calculate_level(xp) == expected_level


def test_reward_tiers_structure():
    # Проверка целостности конфигурации
    for tier in REWARD_TIERS:
        assert "max_elo" in tier
        assert "xp" in tier
        assert "coins" in tier
        assert "elo" in tier
        assert tier["xp"] > 0
        assert tier["coins"] > 0
        assert tier["elo"] > 0