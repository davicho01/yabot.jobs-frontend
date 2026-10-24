import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
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
  '/terms': '/terms.html',
}

// Blog posts are matched by pattern, not listed, so a new post needs no routing change:
// /blog is the index, /blog/<slug> is blog/<slug>.html. Same rule in the Function and
// index.html. Each post still needs its entry in build.rollupOptions.input below.
function blogPage(path: string): string | undefined {
  if (path === '/blog') return '/blog/index.html'
  if (/^\/blog\/[a-z0-9-]+$/.test(path)) return path + '.html'
  return undefined
}

// Every blog/*.html file is a build input, so publishing a post is adding its file.
const BLOG_INPUTS = Object.fromEntries(
  readdirSync(resolve(__dirname, 'blog'))
    .filter((name) => name.endsWith('.html'))
    .map((name) => ['blog-' + name.replace(/\.html$/, ''), resolve(__dirname, 'blog', name)]),
)

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
          const trimmed = path.replace(/\/+$/, '')
          const staticPage = STATIC_PAGES[trimmed] ?? blogPage(trimmed)
          req.url = staticPage ? staticPage : '/app.html' + url.slice(path.length)
        }
        next()
      })
    },
  }
}

// The backend's static SEO pages (/job/<id>, /jobs/us/..., their sitemaps) and
// crawled company logos (/logos/<domain>-<hash>.png) live in
// the S3 bucket in production, where CloudFront serves a real object if one exists
// and the SPA otherwise. Locally, generate_static_job_pages.py writes them to
// .seo-pages/ instead (SEO_PAGES_OUTPUT_DIR in the backend's .env), storing an
// extensionless key like jobs/us as jobs/us/index.html; this serves them the same
// way. Runs ahead of appShellFallback, so a path with no generated page still
// reaches the app.
const SEO_PAGES_DIR = resolve(__dirname, '.seo-pages')

// Dev only: logos fetched from the live site, kept in memory for the session.
const PRODUCTION_ORIGIN = 'https://yabot.jobs'
const productionLogos = new Map<string, Buffer | null>()

async function proxyProductionLogo(path: string, res: ServerResponse, next: () => void) {
  if (!productionLogos.has(path)) {
    try {
      const response = await fetch(PRODUCTION_ORIGIN + path)
      const isImage = response.ok && (response.headers.get('content-type') ?? '').startsWith('image/')
      productionLogos.set(path, isImage ? Buffer.from(await response.arrayBuffer()) : null)
    } catch {
      return next()
    }
  }
  const logo = productionLogos.get(path)
  if (!logo) return next()
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'max-age=3600')
  res.end(logo)
}

function seoPages(): Plugin {
  return {
    name: 'seo-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0])
        if (!/^\/(jobs?\/|logos\/|sitemap-(job|hubs))/.test(path) || path.includes('..')) return next()
        const file = path.includes('.')
          ? resolve(SEO_PAGES_DIR, '.' + path)
          : resolve(SEO_PAGES_DIR, '.' + path.replace(/\/+$/, ''), 'index.html')
        if (!existsSync(file) || !statSync(file).isFile()) {
          // A logo this machine never crawled (a copy of the production
          // database points at production's logos): show production's copy.
          if (path.startsWith('/logos/')) return void proxyProductionLogo(path, res, next)
          return next()
        }
        res.setHeader(
          'Content-Type',
          file.endsWith('.xml') ? 'application/xml' : file.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8',
        )
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
        terms: resolve(__dirname, 'terms.html'),
        ...BLOG_INPUTS,
      },
    },
  },
  server: {
    host: "localhost",
    port: 3000,
  },
})
