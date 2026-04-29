import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';

function readFromCloudflareEnv(name: string) {
  try {
    const context = getCloudflareContext();
    const value = (context.env as unknown as Record<string, unknown> | undefined)?.[name];
    return value;
  } catch {
    return undefined;
  }
}

export function readRuntimeEnv(name: string) {
  const processValue = process.env[name];
  if (typeof processValue === 'string' && processValue.trim()) return processValue;

  const cloudflareValue = readFromCloudflareEnv(name);
  if (typeof cloudflareValue === 'string' && cloudflareValue.trim()) {
    return cloudflareValue;
  }

  return undefined;
}

export function readRuntimeBinding<T>(name: string) {
  const cloudflareValue = readFromCloudflareEnv(name);

  if (typeof cloudflareValue !== 'undefined') {
    return cloudflareValue as T;
  }

  return undefined;
}

export function requireRuntimeEnv(name: string) {
  const value = readRuntimeEnv(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}
export function readAppUrl() {
  const url = readRuntimeEnv('NEXT_PUBLIC_SITE_URL') || 'https://beteele-one.com';
  return url.replace(/\/$/, '');
}
