import { useState, useCallback, useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useInspectorRequests } from './hooks/useInspectorRequests';
import { FilterBar } from './components/FilterBar';
import { RequestList } from './components/RequestList';
import { RequestDetail } from './components/RequestDetail';
import { ConsolePanel } from './components/ConsolePanel';
import { RequestsDrawerFab } from './components/RequestsDrawerFab';
import { applyFilters } from '@shared/filter-engine';
import { MSG_TYPES, STORAGE_KEYS } from '@shared/constants';
import { sendMessage } from '@shared/message-bus';
import type { FilterRule, ConsoleEntry, CapturedRequest } from '@shared/types';
import './panel.css';

function App() {
  const {
    requests,
    isCapturing,
    preserveLog,
    clearRequests,
    toggleCapture,
    togglePreserveLog,
    pendingConsoleRequest,
    clearPendingConsole,
  } = useInspectorRequests();
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [showConsole, setShowConsole] = useState(true);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEYS.FILTER_RULES, (result) => {
      if (result[STORAGE_KEYS.FILTER_RULES]) {
        setFilterRules(result[STORAGE_KEYS.FILTER_RULES]);
      }
    });

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEYS.FILTER_RULES]) {
        setFilterRules(changes[STORAGE_KEYS.FILTER_RULES].newValue ?? []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!pendingConsoleRequest) return;
    const entry: ConsoleEntry = {
      id: crypto.randomUUID(),
      request: pendingConsoleRequest,
      timestamp: Date.now(),
    };
    setConsoleEntries((prev) => [...prev, entry]);
    clearPendingConsole();
  }, [pendingConsoleRequest, clearPendingConsole]);

  useEffect(() => {
    if (requests.length === 0) {
      setConsoleEntries([]);
    }
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let result = applyFilters(requests, filterRules);
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter((r) => r.url.toLowerCase().includes(lower));
    }
    return result;
  }, [requests, filterRules, searchText]);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId]
  );

  const handleAddRule = useCallback((rule: FilterRule) => {
    setFilterRules((prev) => {
      const next = [...prev, rule];
      chrome.storage.local.set({ [STORAGE_KEYS.FILTER_RULES]: next });
      return next;
    });
  }, []);

  const handleRemoveRule = useCallback((id: string) => {
    setFilterRules((prev) => {
      const next = prev.filter((r) => r.id !== id);
      chrome.storage.local.set({ [STORAGE_KEYS.FILTER_RULES]: next });
      return next;
    });
  }, []);

  const handleToggleRule = useCallback((id: string) => {
    setFilterRules((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
      chrome.storage.local.set({ [STORAGE_KEYS.FILTER_RULES]: next });
      return next;
    });
  }, []);

  const handleLogToConsole = useCallback((request: CapturedRequest) => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    sendMessage(MSG_TYPES.LOG_TO_CONSOLE, { tabId, request }).catch(() => {});
  }, []);

  const handleExportConsole = useCallback(() => {
    const data = consoleEntries.map((e) => ({
      method: e.request.method,
      url: e.request.url,
      status: e.request.status,
      requestBody: e.request.requestBody,
      responseBody: e.request.responseBody,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-inspector-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [consoleEntries]);

  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.darkAlgorithm }}>
      <div className="panel">
        <div className="toolbar">
          <button
            type="button"
            className={`capture-btn ${isCapturing ? 'active' : ''}`}
            onClick={toggleCapture}
            title={isCapturing ? '停止捕获' : '开始捕获'}
          >
            {isCapturing ? '⏺ 捕获中' : '⏹ 已暂停'}
          </button>
          <button type="button" className="toolbar-btn" onClick={clearRequests} title="清空请求">
            🗑 清空
          </button>
          <label className="preserve-label" title="切换保留日志">
            <input type="checkbox" checked={preserveLog} onChange={togglePreserveLog} />
            保留日志
          </label>
          <span className="request-count">
            {filteredRequests.length} / {requests.length} 个请求
          </span>
          <button
            type="button"
            className={`toolbar-btn console-toggle ${showConsole ? 'active' : ''}`}
            onClick={() => setShowConsole(!showConsole)}
          >
            控制台 {consoleEntries.length > 0 ? `(${consoleEntries.length})` : ''}
          </button>
        </div>

        <FilterBar
          requests={requests}
          filterRules={filterRules}
          onAddRule={handleAddRule}
          onRemoveRule={handleRemoveRule}
          onToggleRule={handleToggleRule}
          searchText={searchText}
          onSearchChange={setSearchText}
        />

        <div className="main-content">
          <div className="list-section">
            <RequestList requests={filteredRequests} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div className="detail-section">
            <RequestDetail request={selectedRequest} onLogToConsole={handleLogToConsole} />
          </div>
        </div>

        {showConsole && (
          <div className="console-section">
            <ConsolePanel
              entries={consoleEntries}
              onClear={() => setConsoleEntries([])}
              onExport={handleExportConsole}
            />
          </div>
        )}
      </div>
      <RequestsDrawerFab requests={requests} />
    </ConfigProvider>
  );
}

const el = document.getElementById('app');
if (el) {
  createRoot(el).render(<App />);
}
