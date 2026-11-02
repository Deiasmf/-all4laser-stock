import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_unit_test', NEXT_PUBLIC_VERCEL_ENV: 'development' },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
