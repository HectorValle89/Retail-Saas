import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import type { NextConfig } from 'next'

function getAllowedDevOrigins() {
  // En producción (Cloudflare) no necesitamos inspeccionar la red local
  return ['localhost', '127.0.0.1']
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
  // Reduce the server bundle that OpenNext has to ship to Workers.
  // These packages stay on the server side and are resolved separately
  // from the main worker runtime when possible.
  serverExternalPackages: [
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    'exceljs',
    'pdf-lib',
    'resend',
    'sharp',
    'xlsx',
  ],
  // Activa el MCP server en /_next/mcp (Next.js 16+)
  experimental: {
    mcpServer: true,
    serverActions: {
      bodySizeLimit: '15mb',
    },
    proxyClientMaxBodySize: '15mb',
  },
}

initOpenNextCloudflareForDev()

export default nextConfig
