import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = (env.DEV_ALLOWED_HOSTS ?? '').split(',').filter(Boolean)
  return {
    server: { allowedHosts },
    preview: { allowedHosts },
  }
})
