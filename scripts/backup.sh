#!/usr/bin/env bash
#
# Backup da base de dados Supabase -> ficheiro .sql.gz -> Google Drive.
#
# Requisitos (instalados pela GitHub Action):
#   - pg_dump (postgresql-client-17, para corresponder ao Postgres 17 do Supabase)
#   - gzip
#   - node + package googleapis (para o upload: scripts/drive-upload.mjs)
#
# Variaveis de ambiente necessarias:
#   SUPABASE_DB_URL              connection string (URI) da base de dados
#   GOOGLE_SERVICE_ACCOUNT_JSON  JSON da service account do Google
#   GOOGLE_DRIVE_FOLDER_ID       id da pasta no Google Drive
#
set -euo pipefail

# Falha cedo e com mensagem clara se faltar configuracao
: "${SUPABASE_DB_URL:?Falta a variavel SUPABASE_DB_URL}"
: "${GOOGLE_SERVICE_ACCOUNT_JSON:?Falta a variavel GOOGLE_SERVICE_ACCOUNT_JSON}"
: "${GOOGLE_DRIVE_FOLDER_ID:?Falta a variavel GOOGLE_DRIVE_FOLDER_ID}"

DATA=$(date -u +%F)            # YYYY-MM-DD em UTC
FICHEIRO="backup-${DATA}.sql.gz"

echo "==> [1/3] Dump da base de dados ($DATA, UTC)..."
# Formato "custom" (-Fc): restaura-se com pg_restore (nao com psql).
# --no-owner/--no-acl tornam o restauro mais simples noutro projeto.
# O pipefail garante que uma falha do pg_dump faz o script falhar.
/usr/lib/postgresql/17/bin/pg_dump "$SUPABASE_DB_URL" \
  --no-password \
  --format=custom \
  --no-acl \
  --no-owner \
  | gzip > "$FICHEIRO"

# Sanidade: um dump valido nunca e minusculo. Evita enviar um ficheiro vazio.
TAMANHO_BYTES=$(wc -c < "$FICHEIRO")
if [ "$TAMANHO_BYTES" -lt 1000 ]; then
  echo "Erro: o ficheiro de backup tem apenas ${TAMANHO_BYTES} bytes — o dump provavelmente falhou."
  exit 1
fi
echo "==> Dump concluido: $FICHEIRO ($(du -h "$FICHEIRO" | cut -f1))"

echo "==> [2/3] Upload para o Google Drive..."
node scripts/drive-upload.mjs "$FICHEIRO"

echo "==> [3/3] Backup concluido com sucesso."
