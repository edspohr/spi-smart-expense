import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const NODE_MODULES = fileURLToPath(new URL('./node_modules/', import.meta.url))
const pkgVersion = (name) => JSON.parse(readFileSync(join(NODE_MODULES, name, 'package.json'), 'utf8')).version

// On-device receipt reading (Ola 8) needs the OCR engine, its Spanish model
// and the barcode reader's WebAssembly served from our own origin so they
// work offline. They are served from node_modules in dev and emitted at
// fixed, versioned paths in the build (never committed). The service worker
// caches them on first use (too large for the install precache) and
// "Listo para terreno" warms them ahead of time.
const OCR_VERSION = `${pkgVersion('tesseract.js')}-${pkgVersion('zxing-wasm')}`
const OCR_BASE = `/ocr/${OCR_VERSION}`
const OCR_ASSETS = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'lang/spa.traineddata.gz': '@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz',
  'zxing_reader.wasm': 'zxing-wasm/dist/reader/zxing_reader.wasm',
}
const OCR_TYPES = { js: 'text/javascript', gz: 'application/gzip', wasm: 'application/wasm' }

const resolveModuleFile = (spec) => join(NODE_MODULES, spec)

function ocrAssetsPlugin() {
  return {
    name: 'ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (!url.startsWith(OCR_BASE + '/')) return next()
        const spec = OCR_ASSETS[url.slice(OCR_BASE.length + 1)]
        if (!spec) return next()
        res.setHeader('Content-Type', OCR_TYPES[url.split('.').pop()] || 'application/octet-stream')
        res.end(readFileSync(resolveModuleFile(spec)))
      })
    },
    generateBundle() {
      for (const [file, spec] of Object.entries(OCR_ASSETS)) {
        this.emitFile({ type: 'asset', fileName: `${OCR_BASE.slice(1)}/${file}`, source: readFileSync(resolveModuleFile(spec)) })
      }
    },
  }
}

function loadTenant(id) {
  const path = fileURLToPath(new URL(`./tenants/${id}.json`, import.meta.url))
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Error(`Unknown tenant "${id}" — expected tenants/${id}.json (${e.message})`)
  }
}

// Replaces %TENANT_*% placeholders in index.html so each build ships its own
// title, description, icons and theme colour without touching React code.
function tenantHtmlPlugin(tenant) {
  return {
    name: 'tenant-html',
    transformIndexHtml(html) {
      return html
        .replaceAll('%TENANT_ID%', tenant.id)
        .replaceAll('%TENANT_NAME%', tenant.name)
        .replaceAll('%TENANT_SHORT_NAME%', tenant.shortName)
        .replaceAll('%TENANT_DESCRIPTION%', tenant.description)
        .replaceAll('%TENANT_THEME_COLOR%', tenant.branding.themeColor)
        .replaceAll('%TENANT_LANG%', tenant.locale.language.split('-')[0])
    },
  }
}

function pwaPlugin(tenant) {
  const icons = `icons/${tenant.id}`
  return VitePWA({
    // 'prompt' + UpdateToast: a new build is applied only when the user
    // taps "Recargar", never silently under an open session.
    registerType: 'prompt',
    injectRegister: 'auto',
    includeAssets: ['logo.png', `${icons}/*.png`],
    workbox: {
      // App shell only. Firestore has its own offline cache; Storage images
      // and Gemini calls are fetched live.
      globPatterns: ['**/*.{js,css,html,ico,svg,webmanifest}'],
      // OCR assets are large: cached on first use, not at install.
      globIgnores: ['ocr/**'],
      runtimeCaching: [
        {
          urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'),
          handler: 'CacheFirst',
          options: { cacheName: 'ocr-assets', expiration: { maxEntries: 12 }, cacheableResponse: { statuses: [0, 200] } },
        },
      ],
      navigateFallback: '/index.html',
      cleanupOutdatedCaches: true,
      // Share target + push handlers (public/sw-extras.js).
      importScripts: ['sw-extras.js'],
    },
    manifest: {
      id: '/',
      name: tenant.name,
      short_name: tenant.shortName,
      description: tenant.description,
      lang: tenant.locale.language,
      dir: 'ltr',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      background_color: '#ffffff',
      theme_color: tenant.branding.themeColor,
      icons: [
        { src: `/${icons}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `/${icons}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `/${icons}/icon-512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      // Installed app appears in the OS share sheet for photos and PDFs.
      share_target: {
        action: '/share-target',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: { files: [{ name: 'receipt', accept: ['image/*', 'application/pdf'] }] },
      },
    },
  })
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `vite --mode demo` loads .env.demo (that tenant's Firebase project) and
  // VITE_TENANT from it; an explicit VITE_TENANT in the shell still wins.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const tenantId = process.env.VITE_TENANT || env.VITE_TENANT || 'spi'
  const tenant = loadTenant(tenantId)

  return {
    plugins: [react(), tenantHtmlPlugin(tenant), ocrAssetsPlugin(), pwaPlugin(tenant)],
    define: {
      __TENANT__: JSON.stringify(tenant),
      __OCR_BASE__: JSON.stringify(OCR_BASE),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions', 'firebase/app-check', 'firebase/messaging'],
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-motion': ['framer-motion'],
            'vendor-ui': ['lucide-react', 'sonner'],
            'vendor-charts': ['recharts'],
            'vendor-xlsx': ['xlsx'],
            'vendor-utils': ['jszip'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./vitest.setup.ts'],
      include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}', 'functions/src/**/*.test.ts'],
      css: false,
      mode,
    },
  }
})
