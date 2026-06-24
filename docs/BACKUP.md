# Backup automático da base de dados

A base de dados (Supabase) é copiada **todos os dias às 03:00 UTC** para uma pasta no
Google Drive, através de uma GitHub Action. Cada cópia é um ficheiro comprimido
`backup-AAAA-MM-DD.sql.gz`.

- **O que faz:** `pg_dump` → `gzip` → upload para o Google Drive (via Service Account).
- **Se falhar:** envia um email de aviso para o endereço configurado.
- **Onde está definido:** `.github/workflows/backup.yml`, `scripts/backup.sh`,
  `scripts/drive-upload.mjs`, `scripts/notify-failure.sh`.
- **Custo:** zero (usa só `pg_dump`, `gzip` e o package gratuito `googleapis`).

Para correr **à mão** (teste): no GitHub → separador **Actions** → *Backup diario da base
de dados* → **Run workflow**.

---

## 1. Criar a Service Account no Google Cloud Console

A Service Account é uma "conta de robô" que permite à GitHub Action escrever no Drive.

1. Vai a <https://console.cloud.google.com/> e inicia sessão.
2. Em cima, cria (ou escolhe) um **projeto** — ex.: `all4laser-backups`.
3. Ativa a API do Drive:
   - Menu **APIs & Services → Library** → procura **Google Drive API** → **Enable**.
4. Cria a conta de serviço:
   - **APIs & Services → Credentials → Create credentials → Service account**.
   - Nome: ex. `backup-bot`. Clica **Create and continue** e depois **Done**
     (não é preciso atribuir papéis/roles).
5. Gera a chave JSON:
   - Na lista **Service Accounts**, clica na que criaste → separador **Keys** →
     **Add key → Create new key → JSON → Create**.
   - Faz-se download de um ficheiro `.json`. **Guarda-o bem — é um segredo.**
     (Não o metas no repositório; o `.gitignore` já bloqueia `*service-account*.json`.)
6. Abre esse JSON e copia o valor do campo **`client_email`** (algo como
   `backup-bot@all4laser-backups.iam.gserviceaccount.com`). Vais precisar dele no passo 2.

---

## 2. Partilhar a pasta do Google Drive com a Service Account

1. No teu Google Drive (<https://drive.google.com>), cria uma pasta chamada
   **`Backups All4laser`**.
2. Abre a pasta. O **ID da pasta** está no URL do navegador:
   `https://drive.google.com/drive/folders/`**`<ESTE_ID>`**. Copia esse ID
   (é o `GOOGLE_DRIVE_FOLDER_ID`).
3. Clica com o botão direito na pasta → **Partilhar** → cola o **`client_email`** da
   Service Account (passo 1.6) → dá permissão de **Editor** → **Enviar/Concluir**.

> **Importante (contas Gmail normais):** uma Service Account não tem espaço de
> armazenamento próprio. Por isso o upload **tem de ser feito para uma pasta que é tua
> (do teu Drive) e que partilhaste com a Service Account** — exatamente como acima. Se
> mesmo assim aparecer o erro `Service Accounts do not have storage quota`, vê a secção
> **Resolução de problemas** no fim.

---

## 3. Obter a connection string do Supabase

1. No Supabase → o teu projeto → **Settings → Database**.
2. Em **Connection string**, escolhe o separador **URI** e copia o valor. Vais ter de
   substituir `[YOUR-PASSWORD]` pela password da base de dados.
3. **Recomendado para a GitHub Action:** usa a string do **Session pooler**
   (Connection pooling, em modo *Session*). Os servidores do GitHub Actions só têm IPv4,
   e a ligação direta do Supabase é muitas vezes só IPv6 — o pooler funciona sobre IPv4.
   A string fica parecida com:
   ```
   postgresql://postgres.<ref>:<PASSWORD>@aws-0-<regiao>.pooler.supabase.com:5432/postgres
   ```
   Este é o valor do secret `SUPABASE_DB_URL`.

---

## 4. Adicionar os secrets no GitHub

No repositório → **Settings → Secrets and variables → Actions → New repository secret**.
Cria os seguintes (o nome tem de ser exatamente este):

| Secret | O que é |
|---|---|
| `SUPABASE_DB_URL` | A connection string do passo 3 (com a password já substituída). |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | O **conteúdo completo** do ficheiro JSON da Service Account (abre o `.json`, copia tudo e cola). |
| `GOOGLE_DRIVE_FOLDER_ID` | O ID da pasta do Drive (passo 2.2). |
| `NOTIFY_EMAIL` | O email que recebe os avisos de falha. |
| `SENDGRID_API_KEY` | A chave do SendGrid (a **mesma** já usada pela app no Vercel). Necessária para enviar o email de aviso. |
| `EMAIL_FROM` | O remetente verificado no SendGrid (o **mesmo** já usado pela app). |

> Os dois últimos (`SENDGRID_API_KEY` e `EMAIL_FROM`) só servem para o **email de aviso
> em caso de falha**. Reutiliza os valores que já existem no Vercel.

Depois de gravar os secrets, testa: **Actions → Backup diario da base de dados → Run
workflow**. Em 1-2 minutos deve aparecer o ficheiro na pasta do Drive.

---

## 5. Restaurar um backup (emergência)

1. Vai à pasta **Backups All4laser** no Drive e descarrega o ficheiro do dia pretendido,
   ex.: `backup-2026-06-24.sql.gz`.
2. Descomprime:
   ```bash
   gunzip backup-2026-06-24.sql.gz
   # fica: backup-2026-06-24.sql
   ```
3. Restaura para uma base de dados Supabase. **Em regra restaura-se para um projeto
   NOVO/vazio** (restaurar por cima de dados existentes pode dar conflitos):
   ```bash
   psql "postgresql://postgres.<ref>:<PASSWORD>@aws-0-<regiao>.pooler.supabase.com:5432/postgres" \
     -f backup-2026-06-24.sql
   ```
   - Precisas do `psql` (vem com o `postgresql-client`).
   - Usa a connection string do projeto **para onde** queres restaurar.
4. Avisos:
   - O dump inclui todo o conteúdo do `public` (equipamentos, peças, alugueres, etc.) e
     as contas de utilizador (`auth.users`).
   - Algumas mensagens de erro sobre extensões/papéis já existentes são normais ao
     restaurar no Supabase e podem ser ignoradas — o que interessa é que as tabelas e os
     dados fiquem repostos.
   - Se só precisares dos dados de uma tabela, podes abrir o `.sql` e copiar apenas a
     secção dessa tabela.

> Dica: de vez em quando, descarrega um backup e confirma que abre e tem tamanho
> razoável. Um backup nunca testado não é um backup de confiança.

---

## Manutenção

- **Retenção:** os ficheiros vão-se acumulando na pasta do Drive. De tempos a tempos,
  apaga os mais antigos à mão (ou cria uma subpasta "arquivo"). Não há apagamento
  automático, de propósito, para não haver risco de perder cópias.
- **Mudar a hora:** edita o `cron` em `.github/workflows/backup.yml` (`'0 3 * * *'` =
  03:00 UTC; em Portugal no verão são 04:00).

---

## Resolução de problemas

**A Action falha no `pg_dump` com "server version mismatch".**
O `postgresql-client-17` instalado tem de ser igual ou superior ao Postgres do servidor.
Se o Supabase atualizar para uma versão mais recente, muda `postgresql-client-17` para a
versão correspondente no workflow.

**Erro `Service Accounts do not have storage quota` no upload.**
Acontece se o ficheiro tentar ser guardado no espaço da própria Service Account. Garante
que estás a enviar **para uma pasta tua, partilhada com a SA** (passo 2). Se usares Gmail
normal e o erro persistir, as alternativas são:
- Usar uma **Shared Drive** do Google Workspace (os ficheiros pertencem à drive, não à SA)
  e partilhá-la com a Service Account; ou
- Trocar a autenticação por **OAuth com a tua conta** (refresh token) em vez da Service
  Account. (Implica mudar `scripts/drive-upload.mjs`.)

**Não recebo o email de falha.**
Confirma `SENDGRID_API_KEY`, `EMAIL_FROM` (tem de ser remetente verificado no SendGrid) e
`NOTIFY_EMAIL` nos secrets. Vê também o spam.

**A ligação à base de dados dá timeout.**
Usa a string do **Session pooler** (IPv4), não a ligação direta (passo 3).
