import { useState, useEffect, useCallback } from 'react';
import type { CapturedRequest } from '@shared/types';
import { MSG_TYPES, STORAGE_KEYS } from '@shared/constants';
import { sendMessage, sendMessageWithResponse } from '@shared/message-bus';

const PORT_NAME = 'api-inspector';

interface TabInspectorEntry {
  preserveLog?: boolean;
  capturePaused?: boolean;
}

async function readTabInspectorEntry(tabId: number): Promise<TabInspectorEntry> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.TAB_INSPECTOR_SETTINGS);
  const map = (r[STORAGE_KEYS.TAB_INSPECTOR_SETTINGS] ?? {}) as Record<string, TabInspectorEntry>;
  return map[String(tabId)] ?? {};
}

async function writeTabInspectorEntry(tabId: number, partial: Partial<TabInspectorEntry>) {
  const r = await chrome.storage.local.get(STORAGE_KEYS.TAB_INSPECTOR_SETTINGS);
  const map = { ...(r[STORAGE_KEYS.TAB_INSPECTOR_SETTINGS] ?? {}) } as Record<string, TabInspectorEntry>;
  const key = String(tabId);
  map[key] = { ...map[key], ...partial };
  await chrome.storage.local.set({ [STORAGE_KEYS.TAB_INSPECTOR_SETTINGS]: map });
}

export function useInspectorRequests() {
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [preserveLog, setPreserveLog] = useState(false);
  const [capturePaused, setCapturePaused] = useState(false);
  const [pendingConsoleRequest, setPendingConsoleRequest] = useState<CapturedRequest | null>(null);

  const clearPendingConsole = useCallback(() => {
    setPendingConsoleRequest(null);
  }, []);

  useEffect(() => {
    const tabId = chrome.devtools.inspectedWindow.tabId;

    void readTabInspectorEntry(tabId).then((e) => {
      setPreserveLog(!!e.preserveLog);
      setCapturePaused(!!e.capturePaused);
    });

    void sendMessageWithResponse(MSG_TYPES.GET_FILTERED_REQUESTS, { tabId }).then((res) => {
      const r = res as { requests?: CapturedRequest[] } | undefined;
      if (r?.requests) setRequests(r.requests);
    });

    const port = chrome.runtime.connect({ name: PORT_NAME });
    port.postMessage({ type: 'register', tabId });

    const onPortMessage = (msg: { type?: string; request?: CapturedRequest }) => {
      if (msg.type === 'request' && msg.request) {
        setRequests((prev) => [...prev, msg.request!]);
        setPendingConsoleRequest(msg.request);
      } else if (msg.type === 'cleared') {
        setRequests([]);
      }
    };
    port.onMessage.addListener(onPortMessage);

    return () => {
      port.onMessage.removeListener(onPortMessage);
      port.disconnect();
    };
  }, []);

  const clearRequests = useCallback(() => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    void sendMessage(MSG_TYPES.CLEAR_REQUESTS, { tabId });
    setRequests([]);
  }, []);

  const toggleCapture = useCallback(() => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    setCapturePaused((prev) => {
      const next = !prev;
      void writeTabInspectorEntry(tabId, { capturePaused: next });
      return next;
    });
  }, []);

  const togglePreserveLog = useCallback(() => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    setPreserveLog((prev) => {
      const next = !prev;
      void writeTabInspectorEntry(tabId, { preserveLog: next });
      return next;
    });
  }, []);

  return {
    requests,
    isCapturing: !capturePaused,
    preserveLog,
    clearRequests,
    toggleCapture,
    togglePreserveLog,
    pendingConsoleRequest,
    clearPendingConsole,
  };
}
