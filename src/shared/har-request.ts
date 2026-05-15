import type { CapturedRequest, RequestTiming } from './types';
import { MAX_RESPONSE_SIZE } from './constants';

interface HarHeader {
  name: string;
  value: string;
}

interface HarTiming {
  dnsStart: number;
  dnsEnd: number;
  connectStart: number;
  connectEnd: number;
  sendStart: number;
  sendEnd: number;
  receiveHeadersEnd: number;
  [key: string]: number;
}

function harHeadersToRecord(headers: HarHeader[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const h of headers) {
    record[h.name] = h.value;
  }
  return record;
}

function harTiming(timing: HarTiming | undefined): RequestTiming | null {
  if (!timing) return null;
  return {
    dns: Math.max(0, (timing.dnsEnd || 0) - (timing.dnsStart || 0)),
    connect: Math.max(0, (timing.connectEnd || 0) - (timing.connectStart || 0)),
    send: Math.max(0, (timing.sendEnd || 0) - (timing.sendStart || 0)),
    wait: Math.max(0, (timing.receiveHeadersEnd || 0) - (timing.sendEnd || 0)),
    receive: 0,
    total: timing.receiveHeadersEnd || 0,
  };
}

function normalizeHarEntry(entry: chrome.devtools.network.Request, body: string | null): CapturedRequest {
  const req = entry.request;
  const res = entry.response;
  const timing = harTiming(entry.timings as unknown as HarTiming | undefined);

  return {
    id: `${req.url}-${entry.startedDateTime}`,
    method: req.method,
    url: req.url,
    status: res.status,
    statusText: res.statusText,
    requestHeaders: harHeadersToRecord(req.headers as unknown as HarHeader[]),
    responseHeaders: harHeadersToRecord(res.headers as unknown as HarHeader[]),
    requestBody: req.postData?.text ?? null,
    responseBody: body,
    responseMimeType: (res as unknown as { mimeType: string }).mimeType ?? '',
    contentType: (res as unknown as { mimeType: string }).mimeType ?? '',
    size:
      (res as unknown as { bodySize: number }).bodySize ??
      (entry as unknown as { contentSize: number }).contentSize ??
      0,
    timing,
    timestamp: new Date(entry.startedDateTime).getTime(),
  };
}

/** Read response body (may be empty for opaque / cached / some resource types). */
export async function captureFromNetworkRequest(
  entry: chrome.devtools.network.Request
): Promise<CapturedRequest> {
  let body: string | null = null;
  try {
    body = await new Promise<string | null>((resolve) => {
      entry.getContent((content: string, _encoding: string) => {
        if (content) {
          if (content.length > MAX_RESPONSE_SIZE) {
            resolve(content.substring(0, MAX_RESPONSE_SIZE) + '\n... [truncated]');
          } else {
            resolve(content);
          }
        } else {
          resolve(null);
        }
      });
    });
  } catch {
    body = null;
  }

  return normalizeHarEntry(entry, body);
}
