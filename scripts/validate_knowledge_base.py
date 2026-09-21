"""Checks that every published knowledge-base article has valid metadata."""
from pathlib import Path
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "content/manifest.json").read_text(encoding="utf-8"))
errors = []

for item in manifest:
    path = root / "content" / item["path"]
    if not path.exists():
        errors.append(f"missing file: {item['path']}")
        continue
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        errors.append(f"missing front matter: {item['path']}")
    topic_match = re.search(r"^topicId:\s*(.+)$", text, re.MULTILINE)
    if not topic_match or topic_match.group(1).strip() != item["topicId"]:
        errors.append(f"topicId mismatch: {item['path']}")
    for required in ("moduleId", "title", "level", "puzzleThemes"):
        if not re.search(rf"^{required}:\s*.+$", text, re.MULTILINE):
            errors.append(f"missing {required}: {item['path']}")
    if "## Цель" not in text or "## Объяснение" not in text or "## Практика" not in text:
        errors.append(f"incomplete article sections: {item['path']}")

if errors:
    print("Knowledge base validation failed:")
    print("\n".join(f"- {error}" for error in errors))
    sys.exit(1)

print(f"Knowledge base OK: {len(manifest)} articles")
