import { createRoot } from 'react-dom/client';
import { MSG_TYPES } from '@shared/constants';
import type { CapturedRequest } from '@shared/types';
import ContentApp from './ContentApp';

const HOST_ID = 'api-inspector-host';

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return '#0d904f';
  if (status >= 300 && status < 400) return '#f4b400';
  return '#db4437';
}

function logToConsole(request: CapturedRequest) {
  const sc = statusColor(request.status);
  console.info('[API Inspector]', request.method, request.status, request.url);
  console.groupCollapsed(
    `%c[API Inspector] %c${request.method} %c${request.url} %c${request.status} ${request.statusText}`,
    'color: #4285f4; font-weight: bold',
    'color: #81c784; font-weight: bold',
    'color: #cccccc',
    `color: ${sc}; font-weight: bold`
  );
  console.log('%cRequest Headers:', 'color: #f4b400; font-weight: bold', request.requestHeaders);
  if (request.requestBody) {
    try { console.log('%cRequest Body:', 'color: #f4b400; font-weight: bold', JSON.parse(request.requestBody)); }
    catch { console.log('%cRequest Body:', 'color: #f4b400; font-weight: bold', request.requestBody); }
  }
  console.log('%cResponse Headers:', 'color: #29b6f6; font-weight: bold', request.responseHeaders);
  if (request.responseBody) {
    try { console.log('%cResponse Body:', 'color: #0d904f; font-weight: bold', JSON.parse(request.responseBody)); }
    catch { console.log('%cResponse Body:', 'color: #0d904f; font-weight: bold', request.responseBody); }
  } else {
    console.log('%cResponse Body:', 'color: #78909c; font-weight: bold', '(empty or unavailable)');
  }
  if (request.timing) {
    console.log('%cTiming:', 'color: #ab47bc; font-weight: bold', {
      dns: `${request.timing.dns}ms`, connect: `${request.timing.connect}ms`,
      send: `${request.timing.send}ms`, wait: `${request.timing.wait}ms`, total: `${request.timing.total}ms`,
    });
  }
  console.log('%cFull record (object):', 'color: #90a4ae; font-weight: bold', request);
  console.groupEnd();
}

let _pushRequest: ((r: CapturedRequest) => void) | null = null;
export function onRequestPush(fn: (r: CapturedRequest) => void) { _pushRequest = fn; }

chrome.runtime.onMessage.addListener((message: { type: string; payload: { request: CapturedRequest } }) => {
  if (message.type === MSG_TYPES.LOG_TO_CONSOLE) {
    logToConsole(message.payload.request);
  }
  if (message.type === MSG_TYPES.REQUEST_FOR_CONTENT) {
    logToConsole(message.payload.request);
    _pushRequest?.(message.payload.request);
  }
});

export function mount() {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  container.style.cssText = 'pointer-events:auto;';
  shadow.appendChild(container);

  createRoot(container).render(<ContentApp shadowRoot={shadow} />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
