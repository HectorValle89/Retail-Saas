
import { readAppUrl } from './src/lib/runtime/env';

// Simulate environment
process.env.NEXT_PUBLIC_SITE_URL = ' https://beteele-one.com/ ';
console.log('Test 1 (Trailing Slash):', readAppUrl() === 'https://beteele-one.com' ? 'PASS' : 'FAIL');

process.env.NEXT_PUBLIC_SITE_URL = '';
console.log('Test 2 (Fallback):', readAppUrl() === 'https://beteele-one.com' ? 'PASS' : 'FAIL');

// Note: Testing headers requires mocking the 'headers' import from next/headers, 
// which is harder in a simple script. 
// But the logic for split(',')[0] is straightforward.
