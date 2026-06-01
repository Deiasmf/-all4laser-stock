'use client'

import { useEffect } from 'react'

// Regista o service worker (necessário para a partilha do WhatsApp funcionar).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // sem service worker a app continua a funcionar (só não há partilha)
      })
    }
  }, [])
  return null
}
