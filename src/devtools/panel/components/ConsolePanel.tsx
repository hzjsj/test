import type { FC } from 'react';
import type { ConsoleEntry } from '@shared/types';

interface ConsolePanelProps {
  entries: ConsoleEntry[];
  onClear: () => void;
  onExport: () => void;
}

function formatJson(str: string | null): string {
  if (!str) return '';
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

export const ConsolePanel: FC<ConsolePanelProps> = ({ entries, onClear, onExport }) => {
  return (
    <div className="console-panel">
      <div className="console-header">
        <span className="console-title">控制台输出</span>
        <div className="console-actions">
          <button type="button" className="console-btn" onClick={onExport} disabled={entries.length === 0}>
            导出
          </button>
          <button type="button" className="console-btn" onClick={onClear} disabled={entries.length === 0}>
            清空
          </button>
        </div>
      </div>
      <div className="console-content">
        {entries.length === 0 ? (
          <div className="console-empty">点击请求详情中的 &quot;Log to Console&quot; 按钮输出数据</div>
        ) : (
          entries.map((entry) => (
            <div className="console-entry" key={entry.id}>
              <div className="console-entry-header">
                <span className="console-method">{entry.request.method}</span>
                <span className="console-url">{entry.request.url}</span>
                <span className="console-status">{entry.request.status}</span>
              </div>
              <div className="console-entry-body">
                {entry.request.responseBody && (
                  <pre className="json-content">{formatJson(entry.request.responseBody)}</pre>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
