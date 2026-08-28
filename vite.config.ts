import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = (env.DEV_ALLOWED_HOSTS ?? '').split(',').filter(Boolean)
  return {
    // Relative base so the build's asset URLs work whether it's served from
    // a subpath (GitHub Pages project site) or the root of a custom domain.
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: { allowedHosts },
    preview: { allowedHosts },
  }
})
