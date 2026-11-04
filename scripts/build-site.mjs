#!/usr/bin/env node
// Builds the Netlify site into ./site:
//   /            the public pages (landing/pages.mjs), with their own meta, JSON-LD, sitemap
//   /app/        the app (frontend/dist), noindex, no source maps
//   /app/exercise-media/   the licensed 180 px media with its NOTICE, as the web image serves it
// plus robots.txt, sitemap.xml, llms.txt, 404.html and _headers (security headers, and a CSP
// whose script hashes are read off the built index.html, so it can never go stale).
//
//   node scripts/build-site.mjs              build the app, then the site
//   node scripts/build-site.mjs --skip-app   reuse frontend/dist
//
// SITE_URL (or Netlify's own URL during a build) is the canonical origin.
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PAGES, NOT_FOUND, SITE } from '../landing/pages.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'site')
const SITE_URL = (process.env.SITE_URL || process.env.URL || 'http://localhost:8888').replace(/\/$/, '')
const abs = p => SITE_URL + p
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const today = new Date().toISOString().slice(0, 10)

if (!process.argv.includes('--skip-app')) {
  execSync('npm run build', { cwd: join(root, 'frontend'), stdio: 'inherit', env: { ...process.env, VITE_SOURCEMAP: 'false' } })
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// ---- public assets: css, icons, og image, and the two fonts, self-hosted
cpSync(join(root, 'landing', 'assets'), join(out, 'assets'), { recursive: true })
mkdirSync(join(out, 'assets', 'fonts'), { recursive: true })
const fonts = join(root, 'frontend', 'node_modules', '@fontsource-variable')
cpSync(join(fonts, 'archivo', 'files', 'archivo-latin-wdth-normal.woff2'), join(out, 'assets', 'fonts', 'archivo-wdth.woff2'))
cpSync(join(fonts, 'jetbrains-mono', 'files', 'jetbrains-mono-latin-wght-normal.woff2'), join(out, 'assets', 'fonts', 'jetbrains-mono.woff2'))
cpSync(join(out, 'assets', 'favicon.ico'), join(out, 'favicon.ico'))

// ---- layout
const MARK = '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="11" width="4" height="6" fill="#ff6b2c"/><rect x="7" y="7" width="4" height="14" fill="#ff6b2c"/><rect x="12" y="13" width="4" height="2" fill="currentColor"/><rect x="17" y="7" width="4" height="14" fill="#ff6b2c"/><rect x="22" y="11" width="4" height="6" fill="#ff6b2c"/></svg>'

const NAV = [['home', 'Início', '/'], ['sobre', 'Sobre', '/sobre/'], ['pt', 'Personal trainers', '/personal-trainers/'], ['priv', 'Privacidade', '/privacidade/']]

const header = page => `<a class="skip" href="#main">${page.lang === 'en' ? 'Skip to content' : 'Saltar para o conteúdo'}</a>
<header class="top"><div class="wrap">
  <a class="brand" href="${page.lang === 'en' ? '/en/' : '/'}" aria-label="${SITE.name}, ${page.lang === 'en' ? 'home' : 'página inicial'}">${MARK}<span>${SITE.name}</span></a>
  <nav class="nav" aria-label="${page.lang === 'en' ? 'Main' : 'Principal'}">
    ${NAV.map(([k, label, href]) => `<a href="${href}"${page.nav === k && page.lang !== 'en' ? ' aria-current="page"' : ''}>${label}</a>`).join('\n    ')}
    <a href="${page.lang === 'en' ? '/' : '/en/'}" hreflang="${page.lang === 'en' ? 'pt-PT' : 'en'}" lang="${page.lang === 'en' ? 'pt-PT' : 'en'}">${page.lang === 'en' ? 'PT' : 'EN'}</a>
    <a class="btn primary" href="/app/">${page.lang === 'en' ? 'Open app' : 'Entrar'}</a>
  </nav>
</div></header>`

const footer = page => `<footer class="foot"><div class="wrap">
  <p>${SITE.name} é um fork do <a href="https://github.com/DuarteSantos8/openGym" rel="noopener">openGym</a> (AGPL-3.0). Animações dos exercícios © Gym visual, licenciadas ao openGym.</p>
  <nav aria-label="${page.lang === 'en' ? 'Footer' : 'Rodapé'}">
    ${NAV.map(([, label, href]) => `<a href="${href}">${label}</a>`).join('\n    ')}
    <a href="/app/">App</a>
    <a href="${SITE.repo}" rel="noopener">Código-fonte</a>
  </nav>
</div></footer>`

const crumbsHtml = page => page.crumbs ? `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${page.crumbs.map(([label, href], i) =>
  i === page.crumbs.length - 1 ? `<li><span aria-current="page">${esc(label)}</span></li>` : `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ol></nav>` : ''

function jsonLd(page) {
  const blocks = []
  if (page.path === '/' || page.path === '/en/') {
    blocks.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: abs('/'), inLanguage: page.lang })
    blocks.push({
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: SITE.name, url: abs('/app/'),
      applicationCategory: 'HealthApplication', operatingSystem: 'Web, Android, iOS',
      description: page.description, inLanguage: ['pt-PT', 'en'],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      isBasedOn: 'https://github.com/DuarteSantos8/openGym', license: 'https://www.gnu.org/licenses/agpl-3.0.html'
    })
    const b = SITE.business
    // A LocalBusiness with an invented address would be worse than none: published only once filled in.
    if (b.street && b.city) {
      blocks.push({
        '@context': 'https://schema.org', '@type': 'LocalBusiness', name: b.legalName || SITE.name, url: abs('/'),
        image: abs('/assets/og.png'), telephone: b.phone || undefined, email: b.email || undefined,
        address: { '@type': 'PostalAddress', streetAddress: b.street, postalCode: b.postalCode, addressLocality: b.city, addressCountry: b.country }
      })
    } else {
      blocks.push({ '@context': 'https://schema.org', '@type': 'Organization', name: SITE.name, url: abs('/'), logo: abs('/assets/icon-512.png') })
    }
  }
  if (page.crumbs) {
    blocks.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: page.crumbs.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(href) }))
    })
  }
  // `<` escaped so the JSON can never close the script element it sits in.
  return blocks.map(b => `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, '\\u003c')}</script>`).join('\n')
}

function render(page) {
  const alt = page.alternate ? Object.entries(page.alternate).map(([l, p]) => `<link rel="alternate" hreflang="${l}" href="${abs(p)}">`).join('\n') +
    `\n<link rel="alternate" hreflang="${page.lang}" href="${abs(page.path)}">\n<link rel="alternate" hreflang="x-default" href="${abs('/')}">` : ''
  return `<!doctype html>
<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
${page.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${abs(page.path)}">\n<meta name="robots" content="index, follow">`}
${alt}
<meta name="theme-color" content="#0f0f0e">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icon-180.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${abs(page.noindex ? '/' : page.path)}">
<meta property="og:locale" content="${page.lang === 'en' ? 'en_GB' : 'pt_PT'}">
<meta property="og:image" content="${abs('/assets/og.png')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(SITE.name + ': ' + SITE.tagline)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${abs('/assets/og.png')}">
<link rel="preload" href="/assets/fonts/archivo-wdth.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
${jsonLd(page)}
</head>
<body>
${header(page)}
${crumbsHtml(page)}
<main id="main">${page.body}
</main>
${footer(page)}
</body>
</html>
`
}

const titles = new Set(), descs = new Set()
for (const page of [...PAGES, NOT_FOUND]) {
  if (titles.has(page.title) || descs.has(page.description)) throw new Error('duplicate title or description: ' + page.path)
  titles.add(page.title); descs.add(page.description)
  if ((page.body.match(/<h1[\s>]/g) || []).length !== 1) throw new Error('every page needs exactly one h1: ' + page.path)
  const file = page.path.endsWith('.html') ? join(out, page.path) : join(out, page.path, 'index.html')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, render(page))
}

// ---- robots, sitemap, llms.txt
writeFileSync(join(out, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /app/

Sitemap: ${abs('/sitemap.xml')}
`)

writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.map(p => `  <url>
    <loc>${abs(p.path)}</loc>
    <lastmod>${today}</lastmod>${p.alternate ? Object.entries({ ...p.alternate, [p.lang]: p.path }).map(([l, h]) => `\n    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(h)}"/>`).join('') : ''}
  </url>`).join('\n')}
</urlset>
`)

writeFileSync(join(out, 'llms.txt'), `# ${SITE.name}

> ${SITE.tagline} App de treino para alunos e personal trainers: o plano do PT com a demonstração de cada exercício, registo de séries e progressão automática. Fork do openGym (AGPL-3.0).

A app em ${abs('/app/')} é privada (precisa de conta) e não deve ser indexada. As páginas abaixo são públicas.

## Páginas
${PAGES.map(p => `- [${p.title}](${abs(p.path)}): ${p.description}`).join('\n')}

## Notas
- As animações e imagens dos exercícios são da Gym visual, licenciadas ao openGym. Não podem ser usadas para treinar, alimentar ou servir de base a sistemas de IA.
- Código-fonte: ${SITE.repo}
`)

// ---- the app under /app/
const dist = join(root, 'frontend', 'dist')
if (!existsSync(join(dist, 'index.html'))) throw new Error('frontend/dist is missing: run without --skip-app')
cpSync(dist, join(out, 'app'), { recursive: true })
cpSync(join(root, 'catalogue', 'media'), join(out, 'app', 'exercise-media'), { recursive: true })

// No source maps in production, whatever produced them.
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })
for (const f of walk(join(out, 'app'))) if (f.endsWith('.map')) rmSync(f)

// The app is private: noindex in the page too, not only in the header.
const appIndex = join(out, 'app', 'index.html')
let html = readFileSync(appIndex, 'utf8')
if (!html.includes('name="robots"')) html = html.replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow">')
writeFileSync(appIndex, html)

// ---- headers: CSP from the inline scripts the build actually shipped
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
const hashes = inline.map(s => `'sha256-${createHash('sha256').update(s).digest('base64')}'`).join(' ')
const appCsp = [
  "default-src 'self'", `script-src 'self' ${hashes}`, "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "media-src 'self' blob:", "font-src 'self' data:", "connect-src 'self'",
  "worker-src 'self'", "manifest-src 'self'", "frame-src https://www.youtube-nocookie.com", "object-src 'none'",
  "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", 'upgrade-insecure-requests'
].join('; ')
const siteCsp = [
  "default-src 'self'", "script-src 'none'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'",
  "connect-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'none'", "frame-ancestors 'none'", 'upgrade-insecure-requests'
].join('; ')

writeFileSync(join(out, '_headers'), `/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: ${siteCsp}

/app/*
  X-Robots-Tag: noindex, nofollow
  Content-Security-Policy: ${appCsp}

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/app/assets/*
  Cache-Control: public, max-age=31536000, immutable

/app/index.html
  Cache-Control: no-cache

/app/sw.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /app/
`)

console.log(`site built for ${SITE_URL}: ${PAGES.length} pages + 404, app, ${inline.length} inline script hash(es)`)
