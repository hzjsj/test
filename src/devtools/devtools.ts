import { captureFromNetworkRequest } from '@shared/har-request';
import { MSG_TYPES, STORAGE_KEYS } from '@shared/constants';
import type { CaptureScopeRule } from '@shared/types';
import { sendMessage } from '@shared/message-bus';

chrome.devtools.panels.create(
  'API Inspector',
  'icons/icon16.png',
  'devtools/panel/panel.html'
);

interface TabInspectorEntry {
  preserveLog?: boolean;
  capturePaused?: boolean;
}

async function readTabInspectorEntry(tabId: number): Promise<TabInspectorEntry> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.TAB_INSPECTOR_SETTINGS);
  const map = (r[STORAGE_KEYS.TAB_INSPECTOR_SETTINGS] ?? {}) as Record<string, TabInspectorEntry>;
  return map[String(tabId)] ?? {};
}

let cachedScope: CaptureScopeRule[] | null = null;

async function getCaptureScope(): Promise<CaptureScopeRule[]> {
  if (cachedScope !== null) return cachedScope;
  const r = await chrome.storage.local.get(STORAGE_KEYS.CAPTURE_SCOPE);
  cachedScope = (r[STORAGE_KEYS.CAPTURE_SCOPE] ?? []) as CaptureScopeRule[];
  return cachedScope;
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.CAPTURE_SCOPE]) {
    cachedScope = changes[STORAGE_KEYS.CAPTURE_SCOPE].newValue ?? [];
  }
});

function matchesCaptureScope(url: string, rules: CaptureScopeRule[]): boolean {
  const enabled = rules.filter((r) => r.enabled);
  if (enabled.length === 0) return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  return enabled.some((rule) => {
    if (rule.domain) {
      if (rule.domain.startsWith('*.')) {
        const suffix = rule.domain.slice(1);
        if (!parsed.hostname.endsWith(suffix) && parsed.hostname !== rule.domain.slice(2)) return false;
      } else {
        if (parsed.hostname !== rule.domain && !parsed.hostname.endsWith('.' + rule.domain)) return false;
      }
    }
    if (rule.path && !parsed.pathname.startsWith(rule.path)) return false;
    return true;
  });
}

async function onRequestFinished(entry: chrome.devtools.network.Request) {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  const { capturePaused } = await readTabInspectorEntry(tabId);
  if (capturePaused) return;

  const scope = await getCaptureScope();
  if (!matchesCaptureScope(entry.request.url, scope)) return;

  try {
    const request = await captureFromNetworkRequest(entry);
    await sendMessage(MSG_TYPES.CAPTURED_REQUEST, { tabId, request });
    await sendMessage(MSG_TYPES.LOG_TO_CONSOLE, { tabId, request });
  } catch {
    /* ignore */
  }
}

chrome.devtools.network.onRequestFinished.addListener((entry) => {
  void onRequestFinished(entry);
});

chrome.devtools.network.onNavigated.addListener(() => {
  void (async () => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    const { preserveLog } = await readTabInspectorEntry(tabId);
    if (!preserveLog) {
      await sendMessage(MSG_TYPES.CLEAR_REQUESTS, { tabId });
    }
  })();
});
