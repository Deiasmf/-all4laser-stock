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

// Quantos dias guardar os backups antes de os apagar automaticamente.
const RETENCAO_DIAS = 30

// Apaga da pasta os backups com mais de RETENCAO_DIAS dias.
// Por seguranca so mexe em ficheiros com nome de backup (backup-*.dump.gz / .sql.gz)
// e nunca falha o processo (o backup do dia ja foi enviado com sucesso).
async function limparBackupsAntigos() {
  try {
    const limite = Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000

    // 1) Lista todos os ficheiros da pasta (ignora a lixeira), mais antigos primeiro.
    const ficheiros = []
    let pageToken
    do {
      const r = await drive.files.list({
        q: `'${pastaId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, createdTime, mimeType)',
        orderBy: 'createdTime', // mais antigos primeiro
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })
      ficheiros.push(...(r.data.files ?? []))
      pageToken = r.data.nextPageToken
    } while (pageToken)

    // So consideramos ficheiros de backup (nao pastas nem outros ficheiros).
    const backups = ficheiros.filter(
      (f) =>
        f.mimeType !== 'application/vnd.google-apps.folder' &&
        /^backup-.*\.(dump|sql)\.gz$/.test(f.name)
    )

    // 2/3) Apaga os que tem mais de RETENCAO_DIAS dias.
    const antigos = backups.filter((f) => new Date(f.createdTime).getTime() < limite)
    if (antigos.length === 0) {
      console.log(
        `Limpeza: 0 backups com mais de ${RETENCAO_DIAS} dias (${backups.length} no total, todos mantidos).`
      )
      return
    }

    console.log(`Limpeza: ${antigos.length} backup(s) com mais de ${RETENCAO_DIAS} dias a apagar...`)
    let apagados = 0
    for (const f of antigos) {
      try {
        await drive.files.delete({ fileId: f.id, supportsAllDrives: true })
        console.log(`  - apagado: ${f.name} (criado em ${f.createdTime})`)
        apagados++
      } catch (e) {
        console.warn(`  ! falha a apagar ${f.name}: ${e?.message ?? e}`)
      }
    }
    // 4) Resumo.
    console.log(
      `Limpeza concluida: ${apagados} de ${antigos.length} ficheiro(s) apagado(s); ${backups.length - apagados} mantido(s).`
    )
  } catch (e) {
    // Nunca rebenta o backup por causa da limpeza.
    console.warn(`Aviso: a limpeza de backups antigos falhou (o backup do dia esta seguro): ${e?.message ?? e}`)
  }
}

const nome = path.basename(ficheiro)

console.log(`A enviar "${nome}" para a pasta do Drive (GOOGLE_DRIVE_FOLDER_ID=${pastaId})...`)

try {
  const res = await drive.files.create({
    requestBody: {
      name: nome,
      // Coloca o ficheiro dentro da pasta indicada por GOOGLE_DRIVE_FOLDER_ID
      parents: [pastaId],
    },
    media: { mimeType: 'application/gzip', body: fs.createReadStream(ficheiro) },
    fields: 'id, name, size, parents',
    // Necessario para suportar Shared Drives / Team Drives
    supportsAllDrives: true,
    supportsTeamDrives: true,
  })
  const tamanho = res.data.size ? `${Math.round(Number(res.data.size) / 1024)} KB` : '?'
  console.log(
    `Upload concluido: ${res.data.name} (id=${res.data.id}, ${tamanho}, parents=${JSON.stringify(res.data.parents)})`
  )

  // Limpeza automatica dos backups antigos (so apos o upload ter corrido bem).
  await limparBackupsAntigos()
} catch (e) {
  // Log detalhado do erro do Google para facilitar o debug
  console.error('=== Erro no upload para o Google Drive ===')
  console.error(`Mensagem: ${e?.message ?? '(sem mensagem)'}`)
  if (e?.code) console.error(`Codigo HTTP: ${e.code}`)
  // A API do Google devolve os detalhes em e.response.data.error e/ou e.errors
  const detalhe = e?.response?.data?.error ?? e?.errors
  if (detalhe) {
    console.error('Detalhe do Google:')
    console.error(JSON.stringify(detalhe, null, 2))
  }
  // Como ultimo recurso, despeja o objeto de erro inteiro
  console.error('Erro completo:')
  console.error(JSON.stringify(e, Object.getOwnPropertyNames(e ?? {}), 2))
  process.exit(1)
}
