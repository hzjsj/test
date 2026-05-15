import type { FC } from 'react';
import { useState, useMemo } from 'react';
import type { CapturedRequest } from '@shared/types';

interface RequestListProps {
  requests: CapturedRequest[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type SortKey = 'method' | 'url' | 'status' | 'contentType' | 'size' | 'timestamp';
type SortDir = 'asc' | 'desc';

const METHOD_COLORS: Record<string, string> = {
  GET: '#4285f4',
  POST: '#f4b400',
  PUT: '#db4437',
  DELETE: '#db4437',
  PATCH: '#ab47bc',
  HEAD: '#00bcd4',
  OPTIONS: '#00bcd4',
};

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return '#0d904f';
  if (status >= 300 && status < 400) return '#f4b400';
  if (status >= 400 && status < 500) return '#db4437';
  if (status >= 500) return '#db4437';
  return '#666';
}

function formatSize(bytes: number): string {
  if (bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
}

export const RequestList: FC<RequestListProps> = ({ requests, selectedId, onSelect }) => {
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const copy = [...requests];
    copy.sort((a, b) => {
      let va: string | number = a[sortKey];
      let vb: string | number = b[sortKey];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [requests, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th onClick={() => toggleSort(field)} className="sortable">
      {label}
      {sortKey === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="request-list">
      <table>
        <thead>
          <tr>
            <SortHeader label="Method" field="method" />
            <SortHeader label="URL" field="url" />
            <SortHeader label="Status" field="status" />
            <SortHeader label="Type" field="contentType" />
            <SortHeader label="Size" field="size" />
            <SortHeader label="Time" field="timestamp" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((req) => (
            <tr
              key={req.id}
              className={selectedId === req.id ? 'selected' : ''}
              onClick={() => onSelect(req.id)}
            >
              <td>
                <span className="method-badge" style={{ color: METHOD_COLORS[req.method] || '#666' }}>
                  {req.method}
                </span>
              </td>
              <td className="url-cell" title={req.url}>
                {req.url}
              </td>
              <td>
                <span style={{ color: statusColor(req.status) }}>{req.status}</span>
              </td>
              <td>{req.contentType}</td>
              <td>{formatSize(req.size)}</td>
              <td>{formatTime(req.timestamp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {requests.length === 0 && (
        <div className="empty-state">暂无捕获的请求，请确保 DevTools 已打开并刷新页面</div>
      )}
    </div>
  );
};
