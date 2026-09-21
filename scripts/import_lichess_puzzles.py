"""Build a compact CoolChess puzzle index from the official Lichess dump.

The source archive is intentionally kept outside Git. Install the optional
`zstandard` package for the Python runtime and run:

  python scripts/import_lichess_puzzles.py \
    data/source/lichess_db_puzzle.csv.zst \
    public/data/puzzles.json \
    --max-per-tag 500

The output keeps only fields needed by the learning UI. It does not call the
Lichess API; `gameUrl` remains the canonical source link for the original PGN.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
from collections import defaultdict
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-per-tag", type=int, default=500)
    parser.add_argument("--min-rating", type=int, default=600)
    parser.add_argument("--max-rating", type=int, default=1800)
    return parser.parse_args()


def rows_from_zst(path: Path):
    try:
        import zstandard as zstd
    except ImportError as error:
        raise SystemExit("Install zstandard first: python -m pip install zstandard") from error

    with path.open("rb") as compressed:
        reader = zstd.ZstdDecompressor().stream_reader(compressed)
        with io.TextIOWrapper(reader, encoding="utf-8", newline="") as text:
            yield from csv.DictReader(text)


def main() -> None:
    args = parse_args()
    selected: list[dict] = []
    counts: defaultdict[str, int] = defaultdict(int)

    for row in rows_from_zst(args.source):
        rating = int(row["Rating"])
        if not args.min_rating <= rating <= args.max_rating:
            continue
        themes = row["Themes"].split()
        if not themes or any(counts[theme] >= args.max_per_tag for theme in themes):
            continue
        selected.append({
            "id": row["PuzzleId"],
            "fen": row["FEN"],
            "moves": row["Moves"].split(),
            "rating": rating,
            "ratingDeviation": int(row["RatingDeviation"]),
            "popularity": int(row["Popularity"]),
            "plays": int(row["NbPlays"]),
            "themes": themes,
            "gameUrl": row["GameUrl"],
            "openingTags": row["OpeningTags"].split() if row["OpeningTags"] else [],
            "dailyDate": row["DailyDate"] or None,
        })
        for theme in themes:
            counts[theme] += 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(selected, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(selected)} puzzles to {args.output}")


if __name__ == "__main__":
    main()
