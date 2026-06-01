// Service worker da All4laser Stock.
// Função principal: receber a partilha do WhatsApp (Web Share Target).
// A partilha chega como POST multipart para /partilhar; aqui guardamos os
// ficheiros numa cache temporária e reencaminhamos para a página /partilhar,
// que depois deixa escolher o equipamento e carrega as fotos.

const CACHE_PARTILHA = 'partilha-temp'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === '/partilhar') {
    event.respondWith(tratarPartilha(event.request))
  }
})

async function tratarPartilha(request) {
  try {
    const formData = await request.formData()
    const ficheiros = formData.getAll('fotos').filter((f) => f && f.size > 0)
    const cache = await caches.open(CACHE_PARTILHA)

    // limpar qualquer partilha anterior
    for (const chave of await cache.keys()) await cache.delete(chave)

    await cache.put(
      '/__partilha/meta',
      new Response(JSON.stringify({ total: ficheiros.length }))
    )
    for (let i = 0; i < ficheiros.length; i++) {
      const f = ficheiros[i]
      await cache.put(
        `/__partilha/${i}`,
        new Response(f, {
          headers: {
            'content-type': f.type || 'application/octet-stream',
            'x-nome': encodeURIComponent(f.name || `ficheiro-${i}`),
          },
        })
      )
    }
  } catch {
    // se falhar, seguimos para a página na mesma (sem ficheiros)
  }
  return Response.redirect('/partilhar?partilhado=1', 303)
}
