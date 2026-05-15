import { captureFromNetworkRequest } from '@shared/har-request';
import { MSG_TYPES, STORAGE_KEYS } from '@shared/constants';
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

async function onRequestFinished(entry: chrome.devtools.network.Request) {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  const { capturePaused } = await readTabInspectorEntry(tabId);
  if (capturePaused) return;

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
