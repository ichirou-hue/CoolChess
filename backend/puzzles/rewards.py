import math

# Пороги наград, привязанные строго к рейтингу самой задачи
REWARD_TIERS = [
    {"max_elo": 1199, "xp": 15,  "coins": 5,  "elo": 5},
    {"max_elo": 1599, "xp": 30,  "coins": 10, "elo": 8},
    {"max_elo": 1999, "xp": 50,  "coins": 20, "elo": 12},
    {"max_elo": 2399, "xp": 80,  "coins": 35, "elo": 16},
    {"max_elo": 9999, "xp": 120, "coins": 50, "elo": 20},
]

def calculate_level(xp: int) -> int:
    """Уровень игрока: каждые 100 XP дают прогрессию уровней"""
    return int(math.isqrt(xp // 100)) + 1

def get_fixed_puzzle_rewards(puzzle_elo: int) -> dict:
    """Выдает фиксированные награды в зависимости от порога рейтинга задачи"""
    for tier in REWARD_TIERS:
        if puzzle_elo <= tier["max_elo"]:
            return {
                "xp_gain": tier["xp"],
                "coins_gain": tier["coins"],
                "elo_gain": tier["elo"],
            }
    
    # По умолчанию для экстремально высоких рейтингов
    return {"xp_gain": 120, "coins_gain": 50, "elo_gain": 20}