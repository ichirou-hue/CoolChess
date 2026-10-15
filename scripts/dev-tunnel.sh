#!/bin/bash
# Локальная разработка Mini App без сервера:
# поднимает ngrok-туннель до vite (:5173) и прописывает публичный HTTPS
# в WEBAPP_URL корневого .env (кнопка web_app в боте).
# После этого: перезапусти backend и бота (читают .env на старте).
set -e
cd "$(dirname "$0")/.."

pkill -f "ngrok http 127.0.0.1:5173" 2>/dev/null || true
ngrok http 127.0.0.1:5173 --log=stdout >/tmp/coolchess-ngrok.log 2>&1 &
for i in $(seq 1 20); do
  URL=$(curl -s localhost:4040/api/tunnels 2>/dev/null | python3 -c "import json,sys
ts=json.load(sys.stdin)['tunnels']
print(next((t['public_url'] for t in ts if t['proto']=='https'), ''))" 2>/dev/null || true)
  if [ -n "$URL" ]; then break; fi
  sleep 1
done
if [ -z "$URL" ]; then
  echo "Не смог получить URL туннеля. Лог: /tmp/coolchess-ngrok.log"
  exit 1
fi

# Правки .env через python (sed -i несовместим между macOS и Linux).
URL="$URL" python3 - <<'EOF'
import os
from pathlib import Path
url = os.environ["URL"]
lines = Path(".env").read_text().splitlines()
seen_webapp = seen_cors = False
out = []
for line in lines:
    if line.startswith("WEBAPP_URL="):
        out.append(f"WEBAPP_URL={url}")
        seen_webapp = True
    elif line.startswith("CORS_ORIGINS="):
        origins = [o for o in line.split("=", 1)[1].split(",") if o.strip()]
        if url not in origins:
            origins.append(url)
        out.append("CORS_ORIGINS=" + ",".join(origins))
        seen_cors = True
    else:
        out.append(line)
if not seen_webapp:
    out.append(f"WEBAPP_URL={url}")
if not seen_cors:
    out.append(f"CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,{url}")
Path(".env").write_text("\n".join(out) + "\n")
EOF

echo "Туннель: $URL -> 127.0.0.1:5173"
echo "WEBAPP_URL и CORS_ORIGINS записаны в .env"
echo "Дальше: перезапусти backend и бота (они читают .env на старте)."
