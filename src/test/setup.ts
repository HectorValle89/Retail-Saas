import { vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
}))
