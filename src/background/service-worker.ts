import { MSG_TYPES, STORAGE_KEYS } from '@shared/constants';
import type { CapturedRequest, CaptureState, FilterRule } from '@shared/types';

const PORT_NAME = 'api-inspector';

const tabRequests = new Map<number, CapturedRequest[]>();
const tabCaptureState = new Map<number, CaptureState>();
const inspectorPortsByTab = new Map<number, chrome.runtime.Port[]>();

function addInspectorPort(tabId: number, port: chrome.runtime.Port) {
  const list = inspectorPortsByTab.get(tabId) ?? [];
  list.push(port);
  inspectorPortsByTab.set(tabId, list);
}

function removeInspectorPort(port: chrome.runtime.Port) {
  for (const [tid, list] of [...inspectorPortsByTab.entries()]) {
    const next = list.filter((p) => p !== port);
    if (next.length) inspectorPortsByTab.set(tid, next);
    else inspectorPortsByTab.delete(tid);
  }
}

function broadcastToInspectors(tabId: number, message: unknown) {
  for (const p of inspectorPortsByTab.get(tabId) ?? []) {
    try {
      p.postMessage(message);
    } catch {
      /* port closed */
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  const onFirst = (msg: { type?: string; tabId?: number }) => {
    if (msg.type === 'register' && typeof msg.tabId === 'number') {
      addInspectorPort(msg.tabId, port);
      port.onMessage.removeListener(onFirst);
    }
  };
  port.onMessage.addListener(onFirst);

  port.onDisconnect.addListener(() => {
    port.onMessage.removeListener(onFirst);
    removeInspectorPort(port);
  });
});

function getTabRequests(tabId: number): CapturedRequest[] {
  return tabRequests.get(tabId) ?? [];
}

function getCaptureState(tabId: number): CaptureState {
  return tabCaptureState.get(tabId) ?? { isCapturing: true, requestCount: 0, filteredCount: 0 };
}

async function getFilterRules(): Promise<FilterRule[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FILTER_RULES);
  return result[STORAGE_KEYS.FILTER_RULES] ?? [];
}

async function saveFilterRules(rules: FilterRule[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.FILTER_RULES]: rules });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case MSG_TYPES.CAPTURED_REQUEST: {
      const { tabId, request } = payload as { tabId: number; request: CapturedRequest };
      const existing = tabRequests.get(tabId) ?? [];
      existing.push(request);
      tabRequests.set(tabId, existing);

      const state = getCaptureState(tabId);
      state.requestCount = existing.length;
      tabCaptureState.set(tabId, state);

      broadcastToInspectors(tabId, { type: 'request', request });

      chrome.tabs.sendMessage(tabId, {
        type: MSG_TYPES.REQUEST_FOR_CONTENT,
        payload: { request },
      }).catch(() => {});

      sendResponse({ ok: true });
      break;
    }

    case MSG_TYPES.GET_STATE: {
      const { tabId } = payload as { tabId: number };
      const state = getCaptureState(tabId);
      const requests = getTabRequests(tabId);
      sendResponse({ state, requestCount: requests.length });
      break;
    }

    case MSG_TYPES.UPDATE_FILTERS: {
      const { rules } = payload as { rules: FilterRule[] };
      saveFilterRules(rules);
      sendResponse({ ok: true });
      break;
    }

    case MSG_TYPES.GET_FILTERED_REQUESTS: {
      const { tabId } = payload as { tabId: number };
      const requests = getTabRequests(tabId);
      sendResponse({ requests });
      break;
    }

    case MSG_TYPES.LOG_TO_CONSOLE: {
      const { tabId: msgTabId, request } = payload as { tabId?: number; request: CapturedRequest };
      const targetTabId = msgTabId ?? sender.tab?.id;
      if (targetTabId) {
        chrome.tabs.sendMessage(targetTabId, {
          type: MSG_TYPES.LOG_TO_CONSOLE,
          payload: { request },
        }).catch(() => {});
      }
      sendResponse({ ok: true });
      break;
    }

    case MSG_TYPES.CLEAR_REQUESTS: {
      const { tabId } = payload as { tabId: number };
      tabRequests.set(tabId, []);
      const state = getCaptureState(tabId);
      state.requestCount = 0;
      tabCaptureState.set(tabId, state);
      broadcastToInspectors(tabId, { type: 'cleared' });
      sendResponse({ ok: true });
      break;
    }

    case MSG_TYPES.TOGGLE_CAPTURE: {
      const { tabId } = payload as { tabId: number };
      const state = getCaptureState(tabId);
      state.isCapturing = !state.isCapturing;
      tabCaptureState.set(tabId, state);
      sendResponse({ state });
      break;
    }

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // keep sendResponse channel open for async
});

chrome.runtime.onInstalled.addListener(() => {
  saveFilterRules([]);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabRequests.delete(tabId);
  tabCaptureState.delete(tabId);
});
