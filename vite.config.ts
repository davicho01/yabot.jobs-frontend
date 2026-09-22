import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The site has two pages: index.html is the static landing page served at "/", and
// app.html is the React app (the job board lives at /jobs). In production the host
// decides which one a path gets; this does the same for `npm run dev`, where every
// page-like path other than "/" belongs to the app.
function appShellFallback(): Plugin {
  return {
    name: 'app-shell-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? ''
        const path = url.split('?')[0]
        const wantsPage = req.headers.accept?.includes('text/html')
        if (wantsPage && path !== '/' && !path.includes('.') && !path.startsWith('/@') && !path.startsWith('/src/')) {
          req.url = '/app.html' + url.slice(path.length)
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), appShellFallback()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
      },
    },
  },
  server: {
    host: "localhost",
    port: 3000,
  },
})
