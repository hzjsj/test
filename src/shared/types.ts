export interface CapturedRequest {
  id: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string | null;
  responseBody: string | null;
  responseMimeType: string;
  contentType: string;
  size: number;
  timing: RequestTiming | null;
  timestamp: number;
}

export interface RequestTiming {
  dns: number;
  connect: number;
  send: number;
  wait: number;
  receive: number;
  total: number;
}

export interface FilterRule {
  id: string;
  pattern: string;
  type: 'substring' | 'glob' | 'regex';
  enabled: boolean;
  mode: 'include' | 'exclude';
  createdAt: number;
}

export interface ApiPattern {
  pattern: string;
  displayName: string;
  count: number;
  sampleUrls: string[];
}

export interface CaptureState {
  isCapturing: boolean;
  requestCount: number;
  filteredCount: number;
}

export interface ConsoleEntry {
  id: string;
  request: CapturedRequest;
  timestamp: number;
}
