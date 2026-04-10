import { networkInterfaces } from 'node:os'
import type { NextConfig } from 'next'

function getAllowedDevOrigins() {
  const interfaces = networkInterfaces()
  const allowedHosts = new Set<string>(['localhost', '127.0.0.1'])

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== 'IPv4') {
        continue
      }

      allowedHosts.add(entry.address)
    }
  }

  return Array.from(allowedHosts)
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
