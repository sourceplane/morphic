import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by @opennextjs/cloudflare, which bundles `.next/standalone/**`
  // into the Worker; traced from the monorepo root so workspace dependencies
  // resolve from the root node_modules.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // The template depends on @opentelemetry/api, so pnpm links it to Next as
  // Next's optional peer, and Next's tracer requires it. Next's file tracing
  // copies only the CommonJS build it resolves (build/src); OpenNext's
  // Worker bundler resolves the package's `module` entry (build/esm), so the
  // whole package is traced.
  outputFileTracingIncludes: {
    '*': [
      '../../node_modules/.pnpm/@opentelemetry+api@*/node_modules/@opentelemetry/api/build/**'
    ]
  },
  skipTrailingSlashRedirect: true,
  experimental: {
    staleTimes: { dynamic: 300 }
  },
  async headers() {
    return [
      {
        // Only the auth pages carry one-time credentials in ?token=
        // (invitations, password resets, bootstrap). no-referrer on those
        // pages keeps the token-bearing URL out of Referer headers on
        // outbound and same-origin requests — including requests the
        // /relay PostHog proxy route makes upstream — while the rest of
        // the site keeps normal referrer data for analytics.
        source: '/auth/:path*',
        headers: [
          {
            key: 'Referrer-Policy',
            value: 'no-referrer'
          }
        ]
      }
    ]
  },
  images: {
    // Workers has no Next.js image optimizer: images are served as they are
    // (the remote patterns stay, the allow-list next/image checks).
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/vi/**'
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**' // Google user content often follows this pattern
      },
      {
        protocol: 'https',
        hostname: 'imgs.search.brave.com',
        port: '',
        pathname: '/**' // Brave search cached images
      }
    ]
  }
}

// `next dev` reaches the Worker's bindings through wrangler's platform proxy
// (wrangler.jsonc, committed): HYPERDRIVE on the Postgres its
// localConnectionString names. Only under `next dev`: the build touches no
// binding (nothing pre-renders against the database), so it needs no
// Cloudflare credential.
export default function config(phase) {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    initOpenNextCloudflareForDev()
  }
  return nextConfig
}
