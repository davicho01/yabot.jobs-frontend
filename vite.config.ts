import { existsSync, readFileSync, statSync } from 'node:fs'
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

// The backend's static SEO pages (/job/<id>, /jobs/us/..., their sitemaps) live in
// the S3 bucket in production, where CloudFront serves a real object if one exists
// and the SPA otherwise. Locally, generate_static_job_pages.py writes them to
// .seo-pages/ instead (SEO_PAGES_OUTPUT_DIR in the backend's .env), storing an
// extensionless key like jobs/us as jobs/us/index.html; this serves them the same
// way. Runs ahead of appShellFallback, so a path with no generated page still
// reaches the app.
const SEO_PAGES_DIR = resolve(__dirname, '.seo-pages')

function seoPages(): Plugin {
  return {
    name: 'seo-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0])
        if (!/^\/(jobs?\/|sitemap-job)/.test(path) || path.includes('..')) return next()
        const file = path.includes('.')
          ? resolve(SEO_PAGES_DIR, '.' + path)
          : resolve(SEO_PAGES_DIR, '.' + path.replace(/\/+$/, ''), 'index.html')
        if (!existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', file.endsWith('.xml') ? 'application/xml' : 'text/html; charset=utf-8')
        res.end(readFileSync(file))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), seoPages(), appShellFallback()],
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
