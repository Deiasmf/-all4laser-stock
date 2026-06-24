// Envia um ficheiro para uma pasta do Google Drive usando uma Service Account.
//
// Uso:   node scripts/drive-upload.mjs <caminho-do-ficheiro>
//
// Variaveis de ambiente necessarias:
//   GOOGLE_SERVICE_ACCOUNT_JSON  -> conteudo JSON da service account (string)
//   GOOGLE_DRIVE_FOLDER_ID       -> id da pasta no Drive (partilhada com a SA)
//
// Depende apenas do package `googleapis` (gratuito).

import { google } from 'googleapis'
import fs from 'node:fs'
import path from 'node:path'

const ficheiro = process.argv[2]
if (!ficheiro) {
  console.error('Erro: indica o ficheiro. Uso: node scripts/drive-upload.mjs <ficheiro>')
  process.exit(1)
}
if (!fs.existsSync(ficheiro)) {
  console.error(`Erro: o ficheiro "${ficheiro}" nao existe.`)
  process.exit(1)
}

const jsonSA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
const pastaId = process.env.GOOGLE_DRIVE_FOLDER_ID
if (!jsonSA) {
  console.error('Erro: falta a variavel GOOGLE_SERVICE_ACCOUNT_JSON.')
  process.exit(1)
}
if (!pastaId) {
  console.error('Erro: falta a variavel GOOGLE_DRIVE_FOLDER_ID.')
  process.exit(1)
}

let credenciais
try {
  credenciais = JSON.parse(jsonSA)
} catch {
  console.error('Erro: GOOGLE_SERVICE_ACCOUNT_JSON nao e um JSON valido.')
  process.exit(1)
}

const auth = new google.auth.GoogleAuth({
  credentials: credenciais,
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })

const nome = path.basename(ficheiro)

try {
  const res = await drive.files.create({
    requestBody: { name: nome, parents: [pastaId] },
    media: { mimeType: 'application/gzip', body: fs.createReadStream(ficheiro) },
    fields: 'id, name, size',
    supportsAllDrives: true,
  })
  const tamanho = res.data.size ? `${Math.round(Number(res.data.size) / 1024)} KB` : '?'
  console.log(`Upload concluido: ${res.data.name} (id=${res.data.id}, ${tamanho})`)
} catch (e) {
  console.error('Erro no upload para o Google Drive:')
  console.error(e?.errors ?? e?.message ?? e)
  process.exit(1)
}
