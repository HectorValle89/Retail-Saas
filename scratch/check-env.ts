
import { readRuntimeEnv } from './src/lib/runtime/env';

console.log('NEXT_PUBLIC_SITE_URL:', readRuntimeEnv('NEXT_PUBLIC_SITE_URL'));
console.log('USUARIOS_FROM_EMAIL:', readRuntimeEnv('USUARIOS_FROM_EMAIL'));
