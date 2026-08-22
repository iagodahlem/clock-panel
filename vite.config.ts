import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = (env.DEV_ALLOWED_HOSTS ?? '').split(',').filter(Boolean)
  return {
    // Relative base so the build's asset URLs work whether it's served from
    // a subpath (GitHub Pages project site) or the root of a custom domain.
    base: './',
    server: { allowedHosts },
    preview: { allowedHosts },
  }
})
