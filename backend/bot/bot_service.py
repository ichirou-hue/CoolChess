import os
import chess
from typing import Dict, Any

try:
    import torch
    from maia3.uci import parse_args, Maia3UCIEngine
except ImportError:
    torch = None
    parse_args = None
    Maia3UCIEngine = None

class MaiaBotService:
    def __init__(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.model_path = os.path.join(base_dir, "models", "maia3-5m.pt")
        self.device = "cuda" if torch is not None and torch.cuda.is_available() else "cpu"
        self.engine = None
        self._load_engine()

    def _load_engine(self):
        if not os.path.exists(self.model_path) or Maia3UCIEngine is None or parse_args is None:
            print(f"[MaiaBot Warning] Файл весов не найден: {self.model_path}")
            return

        try:
            print(f"[MaiaBot] Инициализация Maia3UCIEngine на {self.device}...")
            cfg = parse_args([
                "--model", "maia3-5m",
                "--checkpoint-path", self.model_path,
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

        # Если модель недоступна, не выбираем первый legal move: это выглядит
        # как случайное и часто бессмысленное поведение. Используем небольшой
        # детерминированный эвристический fallback с приоритетом матов,
        # взятий, шахов и центральных полей.
        if chosen_move is None:
            chosen_move = self._fallback_move(board)

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

    @staticmethod
    def _fallback_move(board: chess.Board) -> chess.Move:
        piece_values = {
            chess.PAWN: 100,
            chess.KNIGHT: 320,
            chess.BISHOP: 330,
            chess.ROOK: 500,
            chess.QUEEN: 900,
            chess.KING: 20_000,
        }
        best_move = None
        best_score = None
        for move in board.legal_moves:
            trial = board.copy(stack=False)
            moving_piece = board.piece_at(move.from_square)
            captured_piece = board.piece_at(move.to_square)
            trial.push(move)
            score = 0
            if trial.is_checkmate():
                score += 1_000_000
            elif trial.is_check():
                score += 4_000
            if captured_piece:
                score += piece_values[captured_piece.piece_type] * 10
            if moving_piece:
                score -= piece_values[moving_piece.piece_type] // 20
            score += 30 - abs(chess.square_file(move.to_square) - 3.5) * 4
            score += 30 - abs(chess.square_rank(move.to_square) - 3.5) * 4
            if best_score is None or score > best_score:
                best_move, best_score = move, score
        return best_move or next(iter(board.legal_moves))

maia_engine = MaiaBotService()
