#!/usr/bin/env bash
# Sobe API, frontend e túnel 5173. Dois modos:
#
# 1) LiveKit Cloud (recomendado se WebRTC falhar com túnel):
#    Defina LIVEKIT_WS_URL ou LIVEKIT_URL (wss://SEU-PROJETO.livekit.cloud), LIVEKIT_API_KEY e
#    LIVEKIT_API_SECRET (ex.: em .env; o script carrega .env se existir). Não sobe Docker nem túnel 7880.
#
# 2) Túnel local (LiveKit em Docker + túnel 7880):
#    Não defina LIVEKIT_WS_URL (ou use um que não seja *.livekit.cloud). O script sobe
#    LiveKit, túnel 7880, captura a URL e passa à API.
#
# Ctrl+C encerra todos os processos.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
# Carregar variáveis de .env se existir (não commitar .env — use .env.example como modelo)
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Variáveis da API
export LIVEKIT_API_KEY="${LIVEKIT_API_KEY:-lk_dev_1234567890}"
export LIVEKIT_API_SECRET="${LIVEKIT_API_SECRET:-85c9eedc302194a82a9b58184554e68b8a108cb71143ea359cbf54a2b26569745521f728270f233f2b339d9d229c4c03}"
export AUTH_JWT_SECRET="${AUTH_JWT_SECRET:-segredo_longo_e_aleatorio_para_jwt}"

# Modo LiveKit Cloud: LIVEKIT_WS_URL ou LIVEKIT_URL apontando para *.livekit.cloud
USE_LIVEKIT_CLOUD=0
LIVEKIT_WS_URL="${LIVEKIT_WS_URL:-$LIVEKIT_URL}"
if [ -n "$LIVEKIT_WS_URL" ] && echo "$LIVEKIT_WS_URL" | grep -q 'livekit\.cloud'; then
  USE_LIVEKIT_CLOUD=1
  LIVEKIT_WS_URL="$(echo "$LIVEKIT_WS_URL" | tr -d '[:space:]')"
  export LIVEKIT_WS_URL
fi

PID_TUNNEL_7880=""
PID_API=""
PID_FRONTEND=""
PID_TUNNEL_5173=""
LOG_7880=""
LOG_5173=""

cleanup() {
  echo ""
  echo -e "${YELLOW}Encerrando processos...${NC}"
  [ -n "$PID_TUNNEL_7880" ] && kill "$PID_TUNNEL_7880" 2>/dev/null || true
  [ -n "$PID_API" ] && kill "$PID_API" 2>/dev/null || true
  [ -n "$PID_FRONTEND" ] && kill "$PID_FRONTEND" 2>/dev/null || true
  [ -n "$PID_TUNNEL_5173" ] && kill "$PID_TUNNEL_5173" 2>/dev/null || true
  [ -n "$LOG_7880" ] && rm -f "$LOG_7880"
  [ -n "$LOG_5173" ] && rm -f "$LOG_5173"
  exit 0
}
trap cleanup SIGINT SIGTERM

if [ "$USE_LIVEKIT_CLOUD" = 1 ]; then
  echo -e "${GREEN}Modo LiveKit Cloud: usando $LIVEKIT_WS_URL${NC}"
  echo ""
else
  # --- Modo túnel local: LiveKit (Docker) + túnel 7880 ---
  echo -e "${GREEN}[1/5] LiveKit (Docker)...${NC}"
  if ! docker-compose -f "$REPO_ROOT/infra/docker-compose.yml" ps 2>/dev/null | grep -q livekit; then
    (cd "$REPO_ROOT/infra" && docker-compose up -d livekit)
    sleep 2
  else
    echo "  LiveKit já está rodando."
  fi

  echo -e "${GREEN}[2/5] Túnel 7880 (LiveKit)...${NC}"
  LOG_7880=$(mktemp)
  cloudflared tunnel --url http://localhost:7880 2>&1 | tee "$LOG_7880" &
  PID_TUNNEL_7880=$!
  echo "  Aguardando URL do túnel 7880 (até 20s)..."
  LIVEKIT_HTTPS=""
  for i in $(seq 1 20); do
    sleep 1
    LIVEKIT_HTTPS=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_7880" 2>/dev/null | head -1)
    [ -n "$LIVEKIT_HTTPS" ] && break
  done
  if [ -z "$LIVEKIT_HTTPS" ]; then
    echo -e "${RED}  Erro: não foi possível obter a URL do túnel 7880.${NC}"
    cleanup
  fi
  export LIVEKIT_WS_URL="${LIVEKIT_HTTPS/https/wss}"
  echo -e "  URL LiveKit: ${GREEN}$LIVEKIT_WS_URL${NC}"
  sleep 2
fi

# --- API ---
STEP_API=$([ "$USE_LIVEKIT_CLOUD" = 1 ] && echo "1/3" || echo "3/5")
echo -e "${GREEN}[$STEP_API] API...${NC}"
if command -v lsof >/dev/null 2>&1; then
  OLD_PID=$(lsof -ti :8000 2>/dev/null || true)
  [ -n "$OLD_PID" ] && kill "$OLD_PID" 2>/dev/null && sleep 1 || true
elif command -v fuser >/dev/null 2>&1; then
  fuser -k 8000/tcp 2>/dev/null && sleep 1 || true
fi
(
  source "$REPO_ROOT/apps/api/.venv/bin/activate"
  cd "$REPO_ROOT"
  export LIVEKIT_WS_URL="$LIVEKIT_WS_URL"
  uvicorn apps.api.main:app --host 0.0.0.0 --port 8000
) &
PID_API=$!
sleep 2

# --- Frontend ---
STEP_FE=$([ "$USE_LIVEKIT_CLOUD" = 1 ] && echo "2/3" || echo "4/5")
echo -e "${GREEN}[$STEP_FE] Frontend...${NC}"
(
  cd "$REPO_ROOT/apps/web"
  npm run dev
) &
PID_FRONTEND=$!
sleep 3

# --- Túnel 5173 (app) ---
STEP_T5=$([ "$USE_LIVEKIT_CLOUD" = 1 ] && echo "3/3" || echo "5/5")
echo -e "${GREEN}[$STEP_T5] Túnel 5173 (app)...${NC}"
LOG_5173=$(mktemp)
cloudflared tunnel --url http://localhost:5173 2>&1 | tee "$LOG_5173" &
PID_TUNNEL_5173=$!
echo "  Aguardando URL do túnel 5173 (até 20s)..."
APP_URL=""
for i in $(seq 1 20); do
  sleep 1
  APP_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_5173" 2>/dev/null | head -1)
  [ -n "$APP_URL" ] && break
done
if [ -z "$APP_URL" ]; then
  echo -e "${YELLOW}  URL do app ainda não apareceu; confira o log em alguns segundos.${NC}"
else
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}Tudo rodando.${NC}"
  echo -e "  URL do app (abrir no navegador): ${GREEN}$APP_URL${NC}"
  echo -e "  LiveKit:                          $LIVEKIT_WS_URL"
  echo -e "${GREEN}========================================${NC}"
  echo -e "Pressione ${YELLOW}Ctrl+C${NC} para encerrar todos os processos."
fi

while true; do sleep 10; done
