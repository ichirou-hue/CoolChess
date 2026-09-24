from typing import Dict, Any
from puzzles.rewards import calculate_level


def _normalize_bot_elo(difficulty: int) -> int:
    """Если сложность 1-5, переводим в рейтинг, иначе берем как есть."""
    tier_map = {1: 1100, 2: 1300, 3: 1500, 4: 1700, 5: 1900}
    return tier_map.get(difficulty, difficulty)


def calculate_match_rewards(
    user_elo: int,
    bot_difficulty: int,
    result: str,  # "win", "loss", "draw"
    k_factor: int = 32,
) -> Dict[str, Any]:
    """
    Рассчитывает дельту Elo (FIDE) и награды XP/монет за матч с ботом Maia.
    """
    bot_elo = _normalize_bot_elo(bot_difficulty)

    # Ожидаемый результат (мат. ожидание) по формуле Эло
    expected_score = 1.0 / (1.0 + 10.0 ** ((bot_elo - user_elo) / 400.0))

    if result == "win":
        actual_score = 1.0
        # XP и монеты масштабируются от силы бота
        xp_earned = max(20, int(bot_elo / 15))      # 1500 Elo -> 100 XP
        coins_earned = max(5, int(bot_elo / 50))    # 1500 Elo -> 30 монет
    elif result == "draw":
        actual_score = 0.5
        xp_earned = max(10, int(bot_elo / 35))
        coins_earned = max(2, int(bot_elo / 120))
    else:  # "loss" (включая resign)
        actual_score = 0.0
        xp_earned = 10  # Утешительный опыт за доигранную партию
        coins_earned = 0

    elo_delta = round(k_factor * (actual_score - expected_score))

    return {
        "elo_delta": int(elo_delta),
        "xp_earned": int(xp_earned),
        "coins_earned": int(coins_earned),
    }


def apply_match_rewards_to_user(user, rewards: Dict[str, Any]) -> int:
    """
    Применяет дельту Elo, начисляет XP и монеты, пересчитывает уровень.
    Возвращает новый уровень.
    """
    user.games_played += 1
    user.elo_rating = max(100, user.elo_rating + rewards["elo_delta"])
    user.xp += rewards["xp_earned"]
    user.coins += rewards["coins_earned"]

    user.level = calculate_level(user.xp)
    return user.level