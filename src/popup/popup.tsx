import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { MSG_TYPES, STORAGE_KEYS } from '@shared/constants';
import { extractApiPatterns, patternToFilterRule } from '@shared/filter-engine';
import type { FilterRule, CaptureState, CapturedRequest, ApiPattern, CaptureScopeRule } from '@shared/types';
import './popup.css';

function App() {
  const [state, setState] = useState<CaptureState>({
    isCapturing: true,
    requestCount: 0,
    filteredCount: 0,
  });
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [patterns, setPatterns] = useState<ApiPattern[]>([]);
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [scopeRules, setScopeRules] = useState<CaptureScopeRule[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [newPath, setNewPath] = useState('');

  useEffect(() => {
    async function load() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      try {
        const response = await chrome.runtime.sendMessage({
          type: MSG_TYPES.GET_STATE,
          payload: { tabId: tab.id },
        });
        if (response?.state) {
          setState(response.state);
        }
        if (response?.requestCount !== undefined) {
          setState((s) => ({ ...s, requestCount: response.requestCount }));
        }
      } catch {
        /* ignore */
      }

      try {
        const response = await chrome.runtime.sendMessage({
          type: MSG_TYPES.GET_FILTERED_REQUESTS,
          payload: { tabId: tab.id },
        });
        if (response?.requests) {
          setRequests(response.requests);
          setPatterns(extractApiPatterns(response.requests));
        }
      } catch {
        /* ignore */
      }

      chrome.storage.local.get([STORAGE_KEYS.FILTER_RULES, STORAGE_KEYS.CAPTURE_SCOPE], (result) => {
        if (result[STORAGE_KEYS.FILTER_RULES]) {
          setFilterRules(result[STORAGE_KEYS.FILTER_RULES]);
        }
        if (result[STORAGE_KEYS.CAPTURE_SCOPE]) {
          setScopeRules(result[STORAGE_KEYS.CAPTURE_SCOPE]);
        }
      });
    }
    void load();
  }, []);

  // Listen for scope changes from other contexts
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEYS.CAPTURE_SCOPE]) {
        setScopeRules(changes[STORAGE_KEYS.CAPTURE_SCOPE].newValue ?? []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const activeRulePatterns = new Set(filterRules.map((r) => r.pattern));
  const availablePatterns = patterns.filter((p) => !activeRulePatterns.has(p.pattern));

  const handleAddPattern = useCallback(
    (pattern: ApiPattern) => {
      const rule = patternToFilterRule(pattern.pattern);
      const next = [...filterRules, rule];
      setFilterRules(next);
      chrome.storage.local.set({ [STORAGE_KEYS.FILTER_RULES]: next });
    },
    [filterRules]
  );

  const handleRemoveRule = useCallback(
    (id: string) => {
      const next = filterRules.filter((r) => r.id !== id);
      setFilterRules(next);
      chrome.storage.local.set({ [STORAGE_KEYS.FILTER_RULES]: next });
    },
    [filterRules]
  );

  const handleToggleRule = useCallback(
    (id: string) => {
      const next = filterRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
      setFilterRules(next);
      chrome.storage.local.set({ [STORAGE_KEYS.FILTER_RULES]: next });
    },
    [filterRules]
  );

  // Capture scope handlers
  const saveScopeRules = useCallback((rules: CaptureScopeRule[]) => {
    setScopeRules(rules);
    chrome.storage.local.set({ [STORAGE_KEYS.CAPTURE_SCOPE]: rules });
  }, []);

  const handleAddScope = useCallback(() => {
    const domain = newDomain.trim();
    if (!domain) return;
    const rule: CaptureScopeRule = {
      id: crypto.randomUUID(),
      domain,
      path: newPath.trim(),
      enabled: true,
    };
    saveScopeRules([...scopeRules, rule]);
    setNewDomain('');
    setNewPath('');
  }, [newDomain, newPath, scopeRules, saveScopeRules]);

  const handleRemoveScope = useCallback(
    (id: string) => {
      saveScopeRules(scopeRules.filter((r) => r.id !== id));
    },
    [scopeRules, saveScopeRules]
  );

  const handleToggleScope = useCallback(
    (id: string) => {
      saveScopeRules(scopeRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    },
    [scopeRules, saveScopeRules]
  );

  return (
    <div className="popup">
      <div className="popup-header">
        <h1>API Inspector</h1>
        <span className={`status ${state.isCapturing ? 'active' : 'inactive'}`}>
          {state.isCapturing ? '捕获中' : '已暂停'}
        </span>
      </div>

      <div className="popup-stats">
        <div className="stat">
          <span className="stat-value">{state.requestCount}</span>
          <span className="stat-label">总请求</span>
        </div>
        <div className="stat">
          <span className="stat-value">{requests.length}</span>
          <span className="stat-label">已记录</span>
        </div>
      </div>

      {/* Capture Scope */}
      <div className="popup-section">
        <h2>捕获范围</h2>
        {scopeRules.length === 0 && (
          <div className="empty-hint">未配置域名，默认不捕获任何请求</div>
        )}
        {scopeRules.map((rule) => (
          <div className={`scope-item ${rule.enabled ? 'active' : 'disabled'}`} key={rule.id}>
            <span className="scope-toggle" onClick={() => handleToggleScope(rule.id)}>
              {rule.enabled ? '●' : '○'}
            </span>
            <span className="scope-domain">{rule.domain}</span>
            {rule.path && <span className="scope-path">{rule.path}</span>}
            <span className="scope-remove" onClick={() => handleRemoveScope(rule.id)}>
              x
            </span>
          </div>
        ))}
        <div className="scope-add">
          <input
            type="text"
            placeholder="域名 (如 yihui100.com)"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddScope()}
            className="scope-input"
          />
          <input
            type="text"
            placeholder="路径 (如 /api/，可选)"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddScope()}
            className="scope-input scope-input-path"
          />
          <button className="scope-add-btn" onClick={handleAddScope} disabled={!newDomain.trim()}>
            +
          </button>
        </div>
      </div>

      {/* Filter Rules */}
      <div className="popup-section">
        <h2>接口筛选</h2>
        {filterRules.length > 0 && (
          <div className="filter-pills">
            {filterRules.map((rule) => (
              <span className={`pill ${rule.enabled ? 'active' : 'disabled'} ${rule.mode}`} key={rule.id}>
                <span className="pill-toggle" onClick={() => handleToggleRule(rule.id)}>
                  {rule.mode === 'include' ? '+' : '-'}
                </span>
                <span className="pill-text">{rule.pattern}</span>
                <span className="pill-remove" onClick={() => handleRemoveRule(rule.id)}>
                  x
                </span>
              </span>
            ))}
          </div>
        )}

        {availablePatterns.length > 0 && (
          <div className="pattern-list">
            <h3>自动识别的接口</h3>
            {availablePatterns.slice(0, 10).map((p) => (
              <div className="pattern-item" key={p.pattern} onClick={() => handleAddPattern(p)}>
                <span className="pattern-name">{p.displayName}</span>
                <span className="pattern-count">{p.count}</span>
              </div>
            ))}
          </div>
        )}

        {patterns.length === 0 && (
          <div className="empty-hint">打开 DevTools (F12) 并刷新页面后，这里会显示自动识别的 API 接口</div>
        )}
      </div>
    </div>
  );
}

const rootEl = document.getElementById('app');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
