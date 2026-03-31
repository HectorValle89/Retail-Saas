import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ACTIVE_ACCOUNT_HEADER,
  SCOPED_TABLES,
  applyAccountFilterToRestUrl,
  createTenantScopedFetch,
} from './accountScope'

const ACCOUNT_ID = '123e4567-e89b-42d3-a456-426614174000'
const restTableNameArb = fc.stringMatching(/^[a-z0-9_]{1,12}$/)

function createBaseUrl(table: string) {
  return `https://example.supabase.co/rest/v1/${table}`
}

function appendParams(url: string, entries: Array<[string, string]>) {
  const nextUrl = new URL(url)

  for (const [key, value] of entries) {
    nextUrl.searchParams.append(key, value)
  }

  return nextUrl.toString()
}

async function captureScopedUrl(url: string) {
  let capturedUrl = ''
  const scopedFetch = createTenantScopedFetch(ACCOUNT_ID, async (input) => {
    const request = input instanceof Request ? input : new Request(input)
    capturedUrl = request.url
    return new Response(null, { status: 200 })
  })

  await scopedFetch(url, {
    headers: {
      [ACTIVE_ACCOUNT_HEADER]: ACCOUNT_ID,
    },
  })

  return capturedUrl
}

describe('tenant scope properties', () => {
  it('injects account filters for all scoped REST tables', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...Array.from(SCOPED_TABLES)),
        fc.array(
          fc.tuple(
            fc.stringMatching(/^[a-z0-9_]{1,8}$/).filter((key) => key !== 'cuenta_cliente_id'),
            fc.string({ minLength: 1, maxLength: 12 })
          ),
          { maxLength: 4 }
        ),
        async (table, queryEntries) => {
          const url = appendParams(createBaseUrl(table), queryEntries)
          const capturedUrl = await captureScopedUrl(url)
          const searchParams = new URL(capturedUrl).searchParams

          expect(searchParams.getAll('cuenta_cliente_id')).toEqual([`eq.${ACCOUNT_ID}`])
        }
      ),
      { numRuns: 100 }
    )
  })

  it('does not scope unregistered REST tables', async () => {
    await fc.assert(
      fc.asyncProperty(restTableNameArb, async (table) => {
        fc.pre(!SCOPED_TABLES.has(table))

        const url = createBaseUrl(table)
        expect(applyAccountFilterToRestUrl(new URL(url), ACCOUNT_ID).toString()).toBe(url)
      }),
      { numRuns: 100 }
    )
  })

  it('preserves explicit account filters without overwriting them', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...Array.from(SCOPED_TABLES)), async (table) => {
        const existingUrl = `${createBaseUrl(table)}?cuenta_cliente_id=eq.custom-account`
        const capturedUrl = await captureScopedUrl(existingUrl)

        expect(new URL(capturedUrl).searchParams.getAll('cuenta_cliente_id')).toEqual([
          'eq.custom-account',
        ])
      }),
      { numRuns: 100 }
    )
  })
})