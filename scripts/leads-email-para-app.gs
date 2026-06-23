/**
 * All4laser — Importar leads do email para a APP
 * ------------------------------------------------
 * Lê os emails de leads que chegam ao Gmail/Google Workspace (formulário do
 * site via chat do Wix, Bimedis, etc.) e cria a lead na plataforma, chamando
 * o endpoint público /api/leads/website. Marca cada email como importado para
 * nunca o repetir.
 *
 * COMO INSTALAR (uma vez):
 * 1. Entra em https://script.google.com com a conta de email que RECEBE as leads.
 * 2. "Novo projeto" → apaga o conteúdo e cola este ficheiro todo.
 * 3. No Gmail, cria um marcador (label) chamado exatamente "Leads" e mete lá os
 *    emails de leads (o melhor é criar um filtro do Gmail: ex.
 *    de:(wix.com) OU de:(bimedis) → aplicar o marcador "Leads").
 * 4. Volta ao Apps Script, escolhe a função "importarLeads" e clica em Executar.
 *    Autoriza os acessos pedidos (Gmail + ligação externa) na primeira vez.
 * 5. Cria um acionador automático: ícone do relógio (Triggers) → "Adicionar
 *    acionador" → função "importarLeads", origem "Baseado no tempo", a cada
 *    "15 minutos". Guardar.
 *
 * A partir daqui, de 15 em 15 minutos as leads novas entram sozinhas na app.
 */

// ─── Configuração ────────────────────────────────────────────────────────────
const ENDPOINT = 'https://app.all4laser.com/api/leads/website'
const LABEL_POR_IMPORTAR = 'Leads'            // marcador onde ficam as leads novas
const LABEL_IMPORTADA   = 'Leads-importadas'  // marcador aplicado após importar
// Domínios a IGNORAR ao adivinhar o email do cliente (sistemas, não clientes).
const DOMINIOS_SISTEMA = ['wix.com', 'wixchat.com', 'bimedis.com', 'all4laser.com', 'sentry']

// ─── Função principal (a que o acionador chama) ──────────────────────────────
function importarLeads() {
  const porImportar = GmailApp.getUserLabelByName(LABEL_POR_IMPORTAR)
  if (!porImportar) {
    Logger.log('Não existe o marcador "%s". Cria-o no Gmail primeiro.', LABEL_POR_IMPORTAR)
    return
  }
  const importada = GmailApp.getUserLabelByName(LABEL_IMPORTADA) || GmailApp.createLabel(LABEL_IMPORTADA)

  // Threads com o marcador "Leads" que ainda não têm "Leads-importadas".
  const threads = GmailApp.search('label:' + LABEL_POR_IMPORTAR.toLowerCase() +
    ' -label:' + LABEL_IMPORTADA.toLowerCase(), 0, 50)

  let ok = 0, falhas = 0
  threads.forEach(function (thread) {
    const msg = thread.getMessages()[thread.getMessageCount() - 1] // a mais recente
    try {
      const lead = extrairLead(msg)
      if (!lead.nome && !lead.email && !lead.telefone) throw new Error('sem dados reconhecíveis')
      enviar(lead)
      thread.addLabel(importada)
      ok++
    } catch (e) {
      falhas++
      Logger.log('Falha numa lead (%s): %s', msg.getSubject(), e.message)
    }
  })
  Logger.log('Importadas: %s · Falhas: %s', ok, falhas)
}

// ─── Extrair os dados da lead a partir do email ──────────────────────────────
function extrairLead(msg) {
  const corpo = msg.getPlainBody() || ''
  const remetente = msg.getFrom() || ''
  const assunto = msg.getSubject() || ''

  // Pares "etiqueta / valor" (formato do chat do Wix: name, email, phone, message).
  const nome     = valorDe(corpo, ['name', 'nome', 'full name']) || nomeDoAssunto(assunto)
  const telefone = valorDe(corpo, ['phone', 'telefone', 'telemóvel', 'telemovel', 'tel'])
  const mensagem = valorDe(corpo, ['message', 'mensagem', 'comentário', 'comentario']) || limpar(corpo)

  // Email do cliente: o do par "email", senão o primeiro email do corpo que não
  // seja de um sistema. Como recurso, o email do remetente.
  var email = valorDe(corpo, ['email', 'e-mail'])
  if (!emailValido(email)) email = primeiroEmailCliente(corpo)
  if (!emailValido(email)) email = extrairEmail(remetente)

  return {
    nome: nome || null,
    email: emailValido(email) ? email : null,
    telefone: telefone || null,
    mensagem: mensagem || null,
    canal: canalDe(remetente, assunto),
  }
}

// Procura uma das etiquetas e devolve o valor (linha seguinte não-vazia, ou
// o que vem depois de "etiqueta:"). Robusto a maiúsculas e a texto à volta.
function valorDe(corpo, etiquetas) {
  const linhas = corpo.split(/\r?\n/).map(function (l) { return l.trim() })
  for (var i = 0; i < linhas.length; i++) {
    const baixa = linhas[i].toLowerCase().replace(/[:*]/g, '').trim()
    for (var j = 0; j < etiquetas.length; j++) {
      if (baixa === etiquetas[j]) {
        // valor na própria linha ("etiqueta: valor") ou na linha seguinte
        const mesmaLinha = linhas[i].split(/[:]/).slice(1).join(':').trim()
        if (mesmaLinha) return mesmaLinha
        for (var k = i + 1; k < linhas.length; k++) {
          if (linhas[k]) return linhas[k]
        }
      }
      // formato "etiqueta: valor" sem ser linha isolada
      const m = linhas[i].match(new RegExp('^' + etiquetas[j] + '\\s*[:]\\s*(.+)$', 'i'))
      if (m && m[1].trim()) return m[1].trim()
    }
  }
  return null
}

function nomeDoAssunto(assunto) {
  // ex.: "New lead from João Silva" / "Form Submitted via Chat"
  const m = assunto.match(/(?:from|de)\s+(.+)$/i)
  return m ? m[1].trim() : null
}

function primeiroEmailCliente(corpo) {
  const todos = corpo.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []
  for (var i = 0; i < todos.length; i++) {
    const dom = todos[i].split('@')[1].toLowerCase()
    if (!DOMINIOS_SISTEMA.some(function (d) { return dom.indexOf(d) !== -1 })) return todos[i]
  }
  return null
}

function extrairEmail(texto) {
  const m = (texto || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  return m ? m[0] : null
}

function emailValido(e) { return !!e && /.+@.+\..+/.test(e) }

function canalDe(remetente, assunto) {
  const t = (remetente + ' ' + assunto).toLowerCase()
  if (t.indexOf('bimedis') !== -1) return 'bimedis'
  return 'website'
}

// Limpa o corpo para usar como mensagem (tira rodapés/ruído comuns).
function limpar(corpo) {
  return corpo
    .replace(/form submitted via chat/gi, '')
    .replace(/this email was sent[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000)
}

// ─── Enviar para a app ───────────────────────────────────────────────────────
function enviar(lead) {
  const resp = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(lead),
    muteHttpExceptions: true,
  })
  const code = resp.getResponseCode()
  if (code !== 200 && code !== 201) {
    throw new Error('HTTP ' + code + ' — ' + resp.getContentText())
  }
}
