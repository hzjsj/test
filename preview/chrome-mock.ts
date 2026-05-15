/**
 * 仅用于 `vite` 本地预览：在浏览器中模拟扩展 Chrome API。
 * 真机调试请加载 `dist/` 扩展。
 */
import { MSG_TYPES, STORAGE_KEYS } from '../src/shared/constants';
import type { CapturedRequest } from '../src/shared/types';

const timing = { dns: 2, connect: 5, send: 1, wait: 45, receive: 0, total: 53 };

const STATIC_SAMPLES: CapturedRequest[] = [
  {
    id: 'sample-1',
    method: 'GET',
    url: 'https://api.example.com/v1/users?page=1',
    status: 200,
    statusText: 'OK',
    requestHeaders: { accept: 'application/json' },
    responseHeaders: { 'content-type': 'application/json' },
    requestBody: null,
    responseBody: '{"items":[],"total":0}',
    responseMimeType: 'application/json',
    contentType: 'application/json',
    size: 128,
    timing,
    timestamp: Date.now() - 60_000,
  },
  {
    id: 'sample-2',
    method: 'POST',
    url: 'https://api.example.com/v1/auth/login',
    status: 201,
    statusText: 'Created',
    requestHeaders: { 'content-type': 'application/json' },
    responseHeaders: { 'content-type': 'application/json' },
    requestBody: '{"username":"demo"}',
    responseBody: '{"token":"..."}',
    responseMimeType: 'application/json',
    contentType: 'application/json',
    size: 512,
    timing,
    timestamp: Date.now() - 30_000,
  },
  {
    id: 'sample-3',
    method: 'GET',
    url: 'https://cdn.example.com/assets/logo.png',
    status: 404,
    statusText: 'Not Found',
    requestHeaders: {},
    responseHeaders: { 'content-type': 'text/plain' },
    requestBody: null,
    responseBody: null,
    responseMimeType: 'text/plain',
    contentType: 'text/plain',
    size: 0,
    timing,
    timestamp: Date.now() - 5_000,
  },
];

let previewRequests: CapturedRequest[] = STATIC_SAMPLES.map((r) => ({ ...r }));

type StorageChange = { newValue?: unknown; oldValue?: unknown };

const storageMem: Record<string, unknown> = {};
const onChangedListeners: Array<(c: Record<string, StorageChange>, area: string) => void> = [];

function emitStorageChange(key: string, newValue: unknown, oldValue: unknown) {
  const changes: Record<string, StorageChange> = {
    [key]: { newValue, oldValue },
  };
  for (const fn of onChangedListeners) {
    try {
      fn(changes, 'local');
    } catch {
      /* ignore */
    }
  }
}

const mockChrome = {
  devtools: {
    inspectedWindow: { tabId: 1 },
  },
  storage: {
    local: {
      get(
        keys: string | string[] | Record<string, unknown> | null,
        cb?: (items: Record<string, unknown>) => void
      ): Promise<Record<string, unknown>> {
        const out: Record<string, unknown> = {};
        if (keys == null) {
          Object.assign(out, storageMem);
        } else if (typeof keys === 'string') {
          if (keys in storageMem) out[keys] = storageMem[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) {
            if (k in storageMem) out[k] = storageMem[k];
          }
        } else if (typeof keys === 'object') {
          for (const k of Object.keys(keys)) {
            if (k in storageMem) out[k] = storageMem[k];
          }
        }
        const p = Promise.resolve(out);
        if (cb) void p.then(cb);
        return p;
      },
      set(items: Record<string, unknown>, cb?: () => void): Promise<void> {
        const old: Record<string, unknown> = {};
        for (const k of Object.keys(items)) {
          old[k] = storageMem[k];
          storageMem[k] = items[k];
          emitStorageChange(k, items[k], old[k]);
        }
        const p = Promise.resolve();
        if (cb) void p.then(cb);
        return p;
      },
    },
    onChanged: {
      addListener(fn: (c: Record<string, StorageChange>, area: string) => void) {
        onChangedListeners.push(fn);
      },
      removeListener(fn: (c: Record<string, StorageChange>, area: string) => void) {
        const i = onChangedListeners.indexOf(fn);
        if (i >= 0) onChangedListeners.splice(i, 1);
      },
    },
  },
  runtime: {
    sendMessage(
      message: { type: string; payload?: unknown },
      cb?: (response: unknown) => void
    ): Promise<unknown> {
      let response: unknown = { ok: true };
      if (message.type === MSG_TYPES.GET_FILTERED_REQUESTS) {
        response = { requests: previewRequests.map((r) => ({ ...r })) };
      } else if (message.type === MSG_TYPES.CLEAR_REQUESTS) {
        previewRequests = [];
        response = { ok: true };
      } else if (message.type === MSG_TYPES.LOG_TO_CONSOLE) {
        console.log('[preview mock] LOG_TO_CONSOLE', message.payload);
        response = { ok: true };
      }
      const p = Promise.resolve(response);
      if (cb) void p.then(cb);
      return p;
    },
    connect(_info: { name: string }) {
      const listeners: Array<(msg: unknown) => void> = [];
      return {
        postMessage() {},
        onMessage: {
          addListener(fn: (msg: unknown) => void) {
            listeners.push(fn);
          },
          removeListener(fn: (msg: unknown) => void) {
            const i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
          },
        },
        disconnect() {},
      };
    },
  },
};

(window as unknown as { chrome: typeof mockChrome }).chrome = mockChrome;

void mockChrome.storage.local.set({ [STORAGE_KEYS.FILTER_RULES]: [] });
void mockChrome.storage.local.set({ [STORAGE_KEYS.TAB_INSPECTOR_SETTINGS]: {} });
