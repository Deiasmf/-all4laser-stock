// Gera os ícones da PWA a partir do logo (public/logo.jpg).
// Correr com: node scripts/gen-icons.js
const sharp = require('sharp')

const LOGO = 'public/logo.jpg'
const BRANCO = { r: 255, g: 255, b: 255, alpha: 1 }
const NAVY = { r: 22, g: 41, b: 77, alpha: 1 } // --primary

async function gerar(tamanho, saida, fundo, margem) {
  const interno = Math.round(tamanho * (1 - margem))
  const logoRedim = await sharp(LOGO)
    .resize(interno, interno, { fit: 'contain', background: fundo })
    .toBuffer()
  await sharp({
    create: { width: tamanho, height: tamanho, channels: 4, background: fundo },
  })
    .composite([{ input: logoRedim, gravity: 'center' }])
    .png()
    .toFile(saida)
  console.log('criado', saida)
}

;(async () => {
  await gerar(192, 'public/icon-192.png', BRANCO, 0.12)
  await gerar(512, 'public/icon-512.png', BRANCO, 0.12)
  // maskable precisa de margem maior (zona segura) — fundo navy da marca
  await gerar(512, 'public/icon-maskable-512.png', NAVY, 0.3)
  console.log('Ícones gerados.')
})()
