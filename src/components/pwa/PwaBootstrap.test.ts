import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaBootstrap } from './PwaBootstrap';

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>);
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => effects.push(effect),
}));

function mountBootstrap() {
  expect(PwaBootstrap()).toBeNull();
  const cleanups = effects.map((effect) => effect());
  return () => cleanups.forEach((cleanup) => cleanup?.());
}

describe('PwaBootstrap browser lifecycle', () => {
  let browser: EventTarget & {
    location: { hostname: string };
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  };
  const register = vi.fn<() => Promise<unknown>>();

  beforeEach(() => {
    effects.length = 0;
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'production');
    register.mockReset().mockResolvedValue({});
    browser = Object.assign(new EventTarget(), {
      location: { hostname: 'example.com' },
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal('window', browser);
    vi.stubGlobal('navigator', { serviceWorker: { register } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('defers registration until idle and cancels the scheduled callback on cleanup', async () => {
    const idle = vi.fn<(callback: () => void) => number>().mockReturnValue(42);
    const cancel = vi.fn();
    browser.requestIdleCallback = idle;
    browser.cancelIdleCallback = cancel;
    const unmount = mountBootstrap();
    expect(register).not.toHaveBeenCalled();
    idle.mock.calls[0][0]();
    await Promise.resolve();
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js');
    unmount();
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it('uses a two-second delay when idle callbacks are unavailable', async () => {
    mountBootstrap();
    await vi.advanceTimersByTimeAsync(1999);
    expect(register).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js');
  });

  it('cancels the fallback timer when unmounted before registration', async () => {
    mountBootstrap()();
    await vi.runAllTimersAsync();
    expect(register).not.toHaveBeenCalled();
  });

  it.each(['localhost', '127.0.0.1'])('does not register on %s', async (hostname) => {
    browser.location.hostname = hostname;
    mountBootstrap();
    await vi.runAllTimersAsync();
    expect(register).not.toHaveBeenCalled();
  });

  it('does not register during development or without browser support', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mountBootstrap();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('navigator', {});
    effects.length = 0;
    mountBootstrap();
    await vi.runAllTimersAsync();
    expect(register).not.toHaveBeenCalled();
  });

  it('preserves install prompt suppression and removes its listener on cleanup', () => {
    const unmount = mountBootstrap();
    const prompt = new Event('beforeinstallprompt', { cancelable: true });
    browser.dispatchEvent(prompt);
    expect(prompt.defaultPrevented).toBe(true);
    unmount();
    const laterPrompt = new Event('beforeinstallprompt', { cancelable: true });
    browser.dispatchEvent(laterPrompt);
    expect(laterPrompt.defaultPrevented).toBe(false);
  });

  it('records a registration failure without an unhandled rejection', async () => {
    const error = new Error('registration unavailable');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    register.mockRejectedValueOnce(error);
    mountBootstrap();
    await vi.runAllTimersAsync();
    expect(log).toHaveBeenCalledWith('[PWA] No se pudo registrar el service worker.', error);
  });
});
