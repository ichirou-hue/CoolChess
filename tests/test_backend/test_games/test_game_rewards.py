import pytest
from unittest.mock import MagicMock
from games.rewards import calculate_match_rewards, apply_match_rewards_to_user
from auth.models import User


def test_calculate_match_rewards_win():
    # Игрок 1300 побеждает бота 1500
    rewards = calculate_match_rewards(user_elo=1300, bot_difficulty=1500, result="win")
    assert rewards["elo_delta"] > 0
    assert rewards["xp_earned"] == 100  # 1500 / 15
    assert rewards["coins_earned"] == 30  # 1500 / 50


def test_calculate_match_rewards_loss():
    # Игрок 1300 проигрывает боту 1500
    rewards = calculate_match_rewards(user_elo=1300, bot_difficulty=1500, result="loss")
    assert rewards["elo_delta"] < 0
    assert rewards["xp_earned"] == 10  # Утешительный XP
    assert rewards["coins_earned"] == 0


def test_calculate_match_rewards_draw():
    # Ничья
    rewards = calculate_match_rewards(user_elo=1300, bot_difficulty=1300, result="draw")
    assert rewards["elo_delta"] == 0
    assert rewards["xp_earned"] > 0
    assert rewards["coins_earned"] > 0


def test_apply_match_rewards_to_user():
    user = MagicMock(spec=User)
    user.games_played = 0
    user.elo_rating = 1200
    user.xp = 0
    user.coins = 0
    user.level = 1

    rewards = {"elo_delta": 18, "xp_earned": 100, "coins_earned": 25}
    new_lvl = apply_match_rewards_to_user(user, rewards)

    assert user.games_played == 1
    assert user.elo_rating == 1218
    assert user.xp == 100
    assert user.coins == 25
    assert new_lvl >= 1