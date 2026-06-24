#!/usr/bin/env bash
#
# Envia um email de notificacao quando o backup falha (via SendGrid, o mesmo
# servico ja usado pela aplicacao). Chamado pela GitHub Action no passo de falha.
#
# Variaveis de ambiente necessarias:
#   SENDGRID_API_KEY  chave de API do SendGrid (a mesma da app)
#   EMAIL_FROM        remetente verificado no SendGrid (o mesmo da app)
#   NOTIFY_EMAIL      destinatario das notificacoes de falha
#   RUN_URL           (opcional) link para a execucao da Action
#
set -euo pipefail

: "${SENDGRID_API_KEY:?Falta SENDGRID_API_KEY}"
: "${EMAIL_FROM:?Falta EMAIL_FROM}"
: "${NOTIFY_EMAIL:?Falta NOTIFY_EMAIL}"

ASSUNTO="Falha no backup diario da base de dados (All4laser)"
CORPO="O backup automatico da base de dados FALHOU em $(date -u +'%F %T') UTC.

Execucao: ${RUN_URL:-(sem link)}

O que verificar:
- Os secrets no GitHub (SUPABASE_DB_URL, GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_FOLDER_ID)
- Se a base de dados Supabase esta acessivel
- Se a pasta do Google Drive continua partilhada com a service account

Esta mensagem foi enviada automaticamente pela GitHub Action de backup."

# Monta o JSON de forma segura com jq (disponivel no runner ubuntu-latest)
json=$(jq -n \
  --arg to "$NOTIFY_EMAIL" \
  --arg from "$EMAIL_FROM" \
  --arg subject "$ASSUNTO" \
  --arg body "$CORPO" \
  '{personalizations:[{to:[{email:$to}]}],from:{email:$from},subject:$subject,content:[{type:"text/plain",value:$body}]}')

codigo=$(curl -s -o /dev/null -w "%{http_code}" --request POST \
  --url https://api.sendgrid.com/v3/mail/send \
  --header "Authorization: Bearer ${SENDGRID_API_KEY}" \
  --header "Content-Type: application/json" \
  --data "$json")

echo "SendGrid respondeu HTTP ${codigo}"
# 202 = aceite. Qualquer outro codigo indica problema no envio.
if [ "$codigo" != "202" ]; then
  echo "Aviso: o email de notificacao pode nao ter sido enviado (HTTP ${codigo})."
fi
