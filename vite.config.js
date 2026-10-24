import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function loadTenant(id) {
  const path = fileURLToPath(new URL(`./tenants/${id}.json`, import.meta.url))
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Error(`Unknown tenant "${id}" — expected tenants/${id}.json (${e.message})`)
  }
}

// Replaces %TENANT_*% placeholders in index.html so each build ships its own
// title, description and theme colour without touching React code.
function tenantHtmlPlugin(tenant) {
  return {
    name: 'tenant-html',
    transformIndexHtml(html) {
      return html
        .replaceAll('%TENANT_NAME%', tenant.name)
        .replaceAll('%TENANT_SHORT_NAME%', tenant.shortName)
        .replaceAll('%TENANT_DESCRIPTION%', tenant.description)
        .replaceAll('%TENANT_THEME_COLOR%', tenant.branding.themeColor)
        .replaceAll('%TENANT_LANG%', tenant.locale.language.split('-')[0])
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const tenantId = process.env.VITE_TENANT || 'spi'
  const tenant = loadTenant(tenantId)

  return {
    plugins: [react(), tenantHtmlPlugin(tenant)],
    define: {
      __TENANT__: JSON.stringify(tenant),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-motion': ['framer-motion'],
            'vendor-ui': ['lucide-react', 'sonner'],
            'vendor-charts': ['recharts'],
            'vendor-xlsx': ['xlsx'],
            'vendor-utils': ['jszip', '@google/generative-ai'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./vitest.setup.ts'],
      include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
      css: false,
      mode,
    },
  }
})
