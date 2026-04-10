import type { NextConfig } from 'next'

function getAllowedDevOrigins() {
  // En producción (Cloudflare) no necesitamos inspeccionar la red local
  return ['localhost', '127.0.0.1']
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
  // Activa el MCP server en /_next/mcp (Next.js 16+)
  experimental: {
    mcpServer: true,
    serverActions: {
      bodySizeLimit: '15mb',
    },
    proxyClientMaxBodySize: '15mb',
  },
}

export default nextConfig
