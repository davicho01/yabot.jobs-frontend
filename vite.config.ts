import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Static pages served at a clean URL. In production a CloudFront Function does this
// rewrite (deploy/cloudfront-pretty-urls.js); this keeps `npm run dev` matching it.
// Keep the three lists in step: here, that Function, and index.html's STATIC_PAGES.
const STATIC_PAGES: Record<string, string> = {
  '/questions': '/questions.html',
  '/privacy': '/privacy.html',
  '/about': '/about.html',
}

// The site is a static landing page (index.html) at "/", a couple of static content
// pages, and the React app (app.html) for everything else — the job board lives at
// /jobs. In production the host decides which one a path gets; this does the same for
// `npm run dev`, where every remaining page-like path belongs to the app.
function appShellFallback(): Plugin {
  return {
    name: 'app-shell-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? ''
        const path = url.split('?')[0]
        const wantsPage = req.headers.accept?.includes('text/html')
        if (wantsPage && path !== '/' && !path.includes('.') && !path.startsWith('/@') && !path.startsWith('/src/')) {
          const staticPage = STATIC_PAGES[path.replace(/\/+$/, '')]
          req.url = staticPage ? staticPage : '/app.html' + url.slice(path.length)
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
        questions: resolve(__dirname, 'questions.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        about: resolve(__dirname, 'about.html'),
      },
    },
  },
  server: {
    host: "localhost",
    port: 3000,
  },
})
