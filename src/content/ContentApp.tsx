import { useState, useMemo, useCallback, useRef } from 'react';
import { ConfigProvider, theme, Button, Drawer, Input, Select, Space, Table, Tag, Tooltip, Badge } from 'antd';
import { StyleProvider, createCache } from '@ant-design/cssinjs';
import zhCN from 'antd/locale/zh_CN';
import { TableOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { CapturedRequest } from '@shared/types';
import { onRequestPush } from './content-script';
import QuestionBankPanel, { parseQuestionBankResponse, type QuestionItem } from './QuestionBankPanel';

function formatSize(bytes: number): string {
  if (bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
}

const METHOD_OPTIONS = [
  { value: 'ALL', label: '全部方法' },
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'HEAD', label: 'HEAD' },
  { value: 'OPTIONS', label: 'OPTIONS' },
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: '全部状态' },
  { value: '2xx', label: '2xx 成功' },
  { value: '3xx', label: '3xx 重定向' },
  { value: '4xx', label: '4xx 客户端错误' },
  { value: '5xx', label: '5xx 服务端错误' },
];

function matchStatusBucket(status: number, bucket: string): boolean {
  if (bucket === 'ALL') return true;
  if (bucket === '2xx') return status >= 200 && status < 300;
  if (bucket === '3xx') return status >= 300 && status < 400;
  if (bucket === '4xx') return status >= 400 && status < 500;
  if (bucket === '5xx') return status >= 500 && status < 600;
  return true;
}

const QUESTION_BANK_URL_PATTERN = 'yihui100.com/api/question/bank/list';

export default function ContentApp({ shadowRoot }: { shadowRoot: ShadowRoot }) {
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [urlKeyword, setUrlKeyword] = useState('');
  const [method, setMethod] = useState<string>('ALL');
  const [statusBucket, setStatusBucket] = useState<string>('ALL');
  const [questionBankItems, setQuestionBankItems] = useState<QuestionItem[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const pushRequest = useCallback((r: CapturedRequest) => {
    setRequests((prev) => [...prev, r]);
    // Check if this is a question bank API response
    if (r.url && r.url.includes(QUESTION_BANK_URL_PATTERN) && r.responseBody) {
      const items = parseQuestionBankResponse(r.responseBody);
      if (items.length > 0) {
        setQuestionBankItems((prev) => {
          const existingIds = new Set(prev.map((q) => q.id));
          const newItems = items.filter((q) => !existingIds.has(q.id));
          return [...newItems, ...prev];
        });
      }
    }
  }, []);

  useMemo(() => { onRequestPush(pushRequest); }, [pushRequest]);

  const cache = useMemo(() => createCache(), []);

  const getPopupContainer = useCallback(() => {
    return wrapperRef.current || document.body;
  }, []);

  const filtered = useMemo(() => {
    const kw = urlKeyword.trim().toLowerCase();
    return requests.filter((r) => {
      if (method !== 'ALL' && r.method !== method) return false;
      if (!matchStatusBucket(r.status, statusBucket)) return false;
      if (kw && !r.url.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [requests, urlKeyword, method, statusBucket]);

  const columns: ColumnsType<CapturedRequest> = [
    {
      title: 'Method',
      dataIndex: 'method',
      width: 88,
      render: (m: string) => <Tag color="blue">{m}</Tag>,
    },
    {
      title: 'URL',
      dataIndex: 'url',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text} getPopupContainer={getPopupContainer}>
          <span style={{ cursor: 'default' }}>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 88,
      render: (s: number) => {
        const color = s >= 500 ? 'red' : s >= 400 ? 'volcano' : s >= 300 ? 'gold' : 'green';
        return <Tag color={color}>{s}</Tag>;
      },
    },
    {
      title: 'Size',
      dataIndex: 'size',
      width: 96,
      render: (n: number) => formatSize(n),
    },
    {
      title: 'Time',
      dataIndex: 'timestamp',
      width: 108,
      render: (ts: number) => formatTime(ts),
    },
  ];

  return (
    <StyleProvider container={shadowRoot} cache={cache}>
      <ConfigProvider locale={zhCN} theme={{ algorithm: theme.darkAlgorithm }} getPopupContainer={getPopupContainer}>
        {/* Request capture button */}
        <div ref={wrapperRef} style={{ position: 'fixed', right: 20, bottom: 24, zIndex: 1050, pointerEvents: 'auto' }}>
          <Badge count={requests.length} size="small" offset={[-4, 4]}>
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<TableOutlined />}
              onClick={() => setOpen(true)}
              title="以表格查看全部捕获请求"
            />
          </Badge>
        </div>

        {/* Request capture drawer */}
        <Drawer
          title={`已捕获请求（${filtered.length} / ${requests.length}）`}
          placement="right"
          width="80%"
          open={open}
          onClose={() => setOpen(false)}
          destroyOnClose={false}
          getContainer={false}
          rootStyle={{ position: 'fixed' }}
          styles={{ body: { paddingTop: 12 } }}
        >
          <Space wrap style={{ marginBottom: 16 }}>
            <Input.Search
              allowClear
              placeholder="按 URL 关键词筛选…"
              value={urlKeyword}
              onChange={(e) => setUrlKeyword(e.target.value)}
              style={{ width: 280 }}
            />
            <Select
              value={method}
              onChange={setMethod}
              style={{ width: 140 }}
              options={METHOD_OPTIONS}
              placeholder="HTTP 方法"
            />
            <Select
              value={statusBucket}
              onChange={setStatusBucket}
              style={{ width: 160 }}
              options={STATUS_OPTIONS}
              placeholder="HTTP 状态"
            />
          </Space>
          <Table<CapturedRequest>
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={filtered}
            scroll={{ x: 720, y: 'calc(100vh - 220px)' }}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
            locale={{ emptyText: '暂无数据（请先刷新页面并确保已打开 DevTools）' }}
          />
        </Drawer>

        {/* Question bank panel */}
        <QuestionBankPanel questions={questionBankItems} getPopupContainer={getPopupContainer} />
      </ConfigProvider>
    </StyleProvider>
  );
}
