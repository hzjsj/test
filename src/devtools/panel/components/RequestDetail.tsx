import type { FC } from 'react';
import { useState } from 'react';
import type { CapturedRequest } from '@shared/types';

interface RequestDetailProps {
  request: CapturedRequest | null;
  onLogToConsole: (request: CapturedRequest) => void;
}

type Tab = 'headers' | 'payload' | 'response' | 'timing';

function formatJson(str: string | null): string {
  if (!str) return '';
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function headersDisplay(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

const TimingBar: FC<{ label: string; value: number; total: number; color: string }> = ({
  label,
  value,
  total,
  color,
}) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="timing-row">
      <span className="timing-label">{label}</span>
      <div className="timing-bar-track">
        <div className="timing-bar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="timing-value">{value}ms</span>
    </div>
  );
};

export const RequestDetail: FC<RequestDetailProps> = ({ request, onLogToConsole }) => {
  const [activeTab, setActiveTab] = useState<Tab>('headers');

  if (!request) {
    return <div className="request-detail empty">点击请求查看详情</div>;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'headers', label: 'Headers' },
    { key: 'payload', label: 'Payload' },
    { key: 'response', label: 'Response' },
    { key: 'timing', label: 'Timing' },
  ];

  const totalTiming = request.timing?.total ?? 0;

  return (
    <div className="request-detail">
      <div className="detail-header">
        <div className="detail-title">
          <span className="method-badge" style={{ color: '#4285f4' }}>
            {request.method}
          </span>
          <span className="detail-url" title={request.url}>
            {request.url}
          </span>
          <span className="detail-status" style={{ color: request.status < 300 ? '#0d904f' : '#db4437' }}>
            {request.status} {request.statusText}
          </span>
        </div>
        <button type="button" className="log-btn" onClick={() => onLogToConsole(request)}>
          Log to Console
        </button>
      </div>

      <div className="detail-tabs">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="detail-content">
        {activeTab === 'headers' && (
          <div className="headers-view">
            <div className="headers-section">
              <h4>General</h4>
              <pre>{`Request URL: ${request.url}\nMethod: ${request.method}\nStatus: ${request.status} ${request.statusText}`}</pre>
            </div>
            <div className="headers-section">
              <h4>Request Headers</h4>
              <pre>{headersDisplay(request.requestHeaders)}</pre>
            </div>
            <div className="headers-section">
              <h4>Response Headers</h4>
              <pre>{headersDisplay(request.responseHeaders)}</pre>
            </div>
          </div>
        )}

        {activeTab === 'payload' && (
          <div className="payload-view">
            {request.requestBody ? (
              <pre className="json-content">{formatJson(request.requestBody)}</pre>
            ) : (
              <span className="no-content">无请求体</span>
            )}
          </div>
        )}

        {activeTab === 'response' && (
          <div className="response-view">
            {request.responseBody ? (
              <pre className="json-content">{formatJson(request.responseBody)}</pre>
            ) : (
              <span className="no-content">无响应体</span>
            )}
          </div>
        )}

        {activeTab === 'timing' && request.timing && (
          <div className="timing-view">
            <TimingBar label="DNS" value={request.timing.dns} total={totalTiming} color="#4285f4" />
            <TimingBar label="Connect" value={request.timing.connect} total={totalTiming} color="#f4b400" />
            <TimingBar label="Send" value={request.timing.send} total={totalTiming} color="#0d904f" />
            <TimingBar label="Wait" value={request.timing.wait} total={totalTiming} color="#db4437" />
            <TimingBar label="Total" value={request.timing.total} total={totalTiming} color="#ab47bc" />
          </div>
        )}

        {activeTab === 'timing' && !request.timing && <span className="no-content">无时间数据</span>}
      </div>
    </div>
  );
};
