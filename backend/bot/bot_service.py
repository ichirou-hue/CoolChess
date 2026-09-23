import os
import torch
import chess
from typing import Dict, Any
from maia3.uci import parse_args, Maia3UCIEngine

class MaiaBotService:
    def __init__(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.model_path = os.path.join(base_dir, "models", "maia3-5m.pt")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.engine = None
        self._load_engine()

    def _load_engine(self):
        if not os.path.exists(self.model_path):
            print(f"[MaiaBot Warning] Файл весов не найден: {self.model_path}")
            return

        try:
            print(f"[MaiaBot] Инициализация Maia3UCIEngine на {self.device}...")
            cfg = parse_args([
                "--model", "maia3-5m",
                "--checkpoint", self.model_path,
                "--trust-checkpoint",
                "--local-files-only",
                "--device", self.device
            ])
            self.engine = Maia3UCIEngine(cfg)
            self.engine.ensure_model_loaded()
            print("[MaiaBot] Модель Maia-3 5M успешно загружена и готова к игре!")
        except Exception as e:
            print(f"[MaiaBot Error] Ошибка загрузки Maia-3: {e}")

    def predict_move(self, fen: str, target_rating: int = 1500) -> Dict[str, Any]:
        board = chess.Board(fen)
        if board.is_game_over():
            return {
                "game_over": True,
                "move_uci": None,
                "move_san": None,
                "fen": fen
            }

        chosen_move = None

        if self.engine is not None:
            try:
                # Устанавливаем рейтинг для оценки ходов
                self.engine.cfg.elo = target_rating
                self.engine.cmd_position(f"position fen {fen}")
                
                # score_moves() возвращает кортеж: (best_move, list_of_scored_moves)
                result = self.engine.score_moves()
                if isinstance(result, tuple) and len(result) > 0:
                    chosen_move = result[0]
                elif isinstance(result, list) and len(result) > 0:
                    chosen_move = result[0]["move"]
            except Exception as err:
                print(f"[MaiaBot Error] Ошибка генерации хода: {err}")

        # Резервный ход на случай непредвиденного сбоя
        if chosen_move is None:
            chosen_move = next(iter(board.legal_moves))

        san_move = board.san(chosen_move)
        board.push(chosen_move)

        return {
            "move_uci": chosen_move.uci(),
            "move_san": san_move,
            "new_fen": board.fen(),
            "is_check": board.is_check(),
            "is_game_over": board.is_game_over(),
            "difficulty": target_rating
        }

maia_engine = MaiaBotService()