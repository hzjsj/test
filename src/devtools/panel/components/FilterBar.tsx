import type { FC } from 'react';
import { useState, useCallback } from 'react';
import type { FilterRule, ApiPattern } from '@shared/types';
import { extractApiPatterns, patternToFilterRule } from '@shared/filter-engine';
import type { CapturedRequest } from '@shared/types';

interface FilterBarProps {
  requests: CapturedRequest[];
  filterRules: FilterRule[];
  onAddRule: (rule: FilterRule) => void;
  onRemoveRule: (id: string) => void;
  onToggleRule: (id: string) => void;
  searchText: string;
  onSearchChange: (text: string) => void;
}

export const FilterBar: FC<FilterBarProps> = ({
  requests,
  filterRules,
  onAddRule,
  onRemoveRule,
  onToggleRule,
  searchText,
  onSearchChange,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const patterns = extractApiPatterns(requests);
  const activeRulePatterns = new Set(filterRules.map((r) => r.pattern));

  const handleAddPattern = useCallback(
    (pattern: ApiPattern) => {
      const rule = patternToFilterRule(pattern.pattern);
      onAddRule(rule);
      setShowSuggestions(false);
    },
    [onAddRule]
  );

  const availablePatterns = patterns.filter((p) => !activeRulePatterns.has(p.pattern));

  return (
    <div className="filter-bar">
      <div className="filter-bar-row">
        <input
          type="text"
          className="search-input"
          placeholder="搜索请求 URL..."
          value={searchText}
          onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
        />
        <button
          type="button"
          className="suggestions-btn"
          onClick={() => setShowSuggestions(!showSuggestions)}
          disabled={availablePatterns.length === 0}
          title="自动识别的接口模式"
        >
          接口模式 {availablePatterns.length > 0 ? `(${availablePatterns.length})` : ''}
        </button>
      </div>

      {filterRules.length > 0 && (
        <div className="filter-pills">
          {filterRules.map((rule) => (
            <span
              className={`filter-pill ${rule.enabled ? 'active' : 'disabled'} ${rule.mode}`}
              key={rule.id}
            >
              <span className="pill-toggle" onClick={() => onToggleRule(rule.id)} title={rule.enabled ? '点击禁用' : '点击启用'}>
                {rule.mode === 'include' ? '+' : '-'}
              </span>
              <span className="pill-pattern">{rule.pattern}</span>
              <span className="pill-remove" onClick={() => onRemoveRule(rule.id)}>
                x
              </span>
            </span>
          ))}
        </div>
      )}

      {showSuggestions && availablePatterns.length > 0 && (
        <div className="suggestions-dropdown">
          {availablePatterns.map((p) => (
            <div className="suggestion-item" key={p.pattern} onClick={() => handleAddPattern(p)}>
              <span className="suggestion-pattern">{p.displayName}</span>
              <span className="suggestion-count">{p.count} 个请求</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
