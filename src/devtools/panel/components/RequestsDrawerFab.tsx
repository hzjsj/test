/**
 * Ant Design 组件用法与 API 约定参考官方文档索引：
 * https://ant.design/llms-full.txt
 * （Affix / Drawer / Table / Input.Search / Select 等）
 */
import { useMemo, useState } from 'react';
import { Affix, Button, Drawer, Input, Select, Space, Table, Tag, Tooltip } from 'antd';
import { TableOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { CapturedRequest } from '@shared/types';

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

/** 与 Table 列筛选思路一致：按 HTTP 状态大类过滤 */
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

export function RequestsDrawerFab({ requests }: { requests: CapturedRequest[] }) {
  const [open, setOpen] = useState(false);
  const [urlKeyword, setUrlKeyword] = useState('');
  const [method, setMethod] = useState<string>('ALL');
  const [statusBucket, setStatusBucket] = useState<string>('ALL');

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
        <Tooltip title={text}>
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
    <>
      <Affix offsetBottom={20} style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1050 }}>
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<TableOutlined />}
          onClick={() => setOpen(true)}
          title="以表格查看全部捕获请求"
        />
      </Affix>
      <Drawer
        title="已捕获请求（表格）"
        placement="right"
        width="90%"
        open={open}
        onClose={() => setOpen(false)}
        destroyOnClose={false}
        rootStyle={{ zIndex: 1100 }}
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
    </>
  );
}
