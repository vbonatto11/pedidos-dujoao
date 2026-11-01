#!/usr/bin/env bash
# Roda todos os testes contra o simulador local do Apps Script.
# Uso, na raiz do repositório: bash testes/rodar.sh
# Precisa de Node 18+ e do Playwright com Chromium (veja testes/LEIAME.md).
set -u
cd "$(dirname "$0")"
TEMP="${TMPDIR:-/tmp}"
TELAS="${TELAS:-$TEMP/dujoao-telas}"
mkdir -p "$TELAS"
PID=""

subir() { # subir [MAX_LINHAS] [ATRASO_MS]
  MAX_LINHAS="${1:-1000}" ATRASO="${2:-100}" node servidor.js 8790 > "$TEMP/dujoao-servidor.log" 2>&1 &
  PID=$!
  for _ in $(seq 1 50); do
    node -e "fetch('http://localhost:8790/exec?acao=catalogo').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" && return 0
    sleep 0.2
  done
  echo "O simulador não subiu. Veja $TEMP/dujoao-servidor.log"; exit 1
}
descer() { if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; PID=""; fi; }
trap descer EXIT

falhas=0
rodar() {
  echo "=== $1"
  if ! node "$1" "$TELAS"; then falhas=$((falhas + 1)); echo ">>> FALHOU: $1"; fi
}

subir 12 0 # api-teste.js começa do zero e usa uma planilha pequena (12 linhas)
rodar api-teste.js
descer

subir
for t in api-peso.js peso.js peso2.js imp-logo.js regressao.js novos.js visor.js filtro.js cobranca.js; do rodar "$t"; done
descer

echo
if [ "$falhas" -eq 0 ]; then echo "Todos os testes passaram. Telas salvas em $TELAS"; else echo "$falhas arquivo(s) com falha."; exit 1; fi
