This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Backups automáticos

A base de dados é copiada todos os dias às **03:00 UTC** para o Google Drive, através de
uma GitHub Action (`.github/workflows/backup.yml`). Instruções completas (criar a Service
Account, partilhar a pasta, restaurar) em **[`docs/BACKUP.md`](docs/BACKUP.md)**.

Secrets necessários no GitHub (**Settings → Secrets and variables → Actions**):

| Secret | O que é | Onde obter |
|---|---|---|
| `SUPABASE_DB_URL` | Connection string completa da base de dados (URI). Usar a do **Session pooler** para compatibilidade IPv4. | Supabase → Settings → Database → Connection string → URI |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Conteúdo JSON da Service Account do Google. | Google Cloud Console → Service Account → Keys (ver `docs/BACKUP.md`) |
| `GOOGLE_DRIVE_FOLDER_ID` | ID da pasta "Backups All4laser" no Google Drive. | No URL da pasta no Drive |
| `NOTIFY_EMAIL` | Email que recebe avisos de falha do backup. | — |
| `SENDGRID_API_KEY` | Chave do SendGrid (a mesma da app) — só para o email de aviso. | Igual à do Vercel |
| `EMAIL_FROM` | Remetente verificado no SendGrid (o mesmo da app). | Igual à do Vercel |
