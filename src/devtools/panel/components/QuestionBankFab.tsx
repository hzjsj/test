import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Affix, Button, Drawer, Select, Space, Input, Table, Tag, Tooltip, Badge } from 'antd';
import { BookOutlined, PlusSquareOutlined, MinusSquareOutlined, FileTextOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import katex from 'katex';
import type { CapturedRequest } from '@shared/types';
import TurndownService from 'turndown';

/* ---------- Types ---------- */

interface QuestionPoint { id: string; name: string }

interface QuestionDetail {
  id: string; subQuestionNo: number; questionAnswer: string;
  questionAnalysis: string; famousTeacherGuide: string;
  difficultyName: string; questionCapacityName: string;
  questionDifficultyCode: string; pointIds: string[];
}

interface QuestionItem {
  id: string; questionNo: number; questionTypeName: string;
  courseTypeName: string; questionContent: string;
  difficultyName: string; questionCapacityName: string;
  tagNames: string[]; detailList: QuestionDetail[];
  pointList: QuestionPoint[]; updateTime: string; fullContent?: string;
}

/* ---------- Parse ---------- */

const QB_URL_PATTERN = 'yihui100.com/api/question/bank/list';

function parseQuestionBankResponse(responseBody: string | null): QuestionItem[] {
  if (!responseBody) return [];
  try {
    const json = JSON.parse(responseBody);
    const data = json.data ?? json.result ?? json;
    const list: unknown[] = data.list ?? data.records ?? data.items ?? (Array.isArray(data) ? data : []);
    return list.filter((q: any) => q && q.id) as QuestionItem[];
  } catch { return []; }
}

/* ---------- KaTeX rendering ---------- */

function renderFormulaSpans(html: string): string {
  if (!html) return '';
  return html.replace(
    /<span[^>]*data-w-e-type="formula"[^>]*data-value="([^"]*)"[^>]*><\/span>/g,
    (_match, formula) => {
      try { return katex.renderToString(formula, { throwOnError: false, displayMode: false }); }
      catch { return `<code>${formula}</code>`; }
    }
  );
}

function renderHtmlWithKatex(html: string): string {
  if (!html) return '';
  let r = renderFormulaSpans(html);
  r = r.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  r = r.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  r = r.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  return r;
}

function stripHtml(html: string): string {
  if (!html) return '';
  return renderFormulaSpans(html)
    .replace(/<img[^>]*>/g, '[图片]')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .trim();
}

function RichContent({ html, style }: { html: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useMemo(() => renderHtmlWithKatex(html), [html]);
  useEffect(() => {
    if (ref.current && !document.getElementById('katex-css-devtools')) {
      const link = document.createElement('link');
      link.id = 'katex-css-devtools';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
      ref.current.ownerDocument.head.appendChild(link);
    }
  }, []);
  return <div ref={ref} style={{ lineHeight: 1.8, fontSize: 13, ...style }} dangerouslySetInnerHTML={{ __html: rendered }} />;
}

/* ---------- Turndown ---------- */

function createTurndown(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  td.addRule('formula', {
    filter: (node) => node.nodeName === 'SPAN' && node.getAttribute('data-w-e-type') === 'formula',
    replacement(_c, node) { return `$${(node as HTMLElement).getAttribute('data-value') || ''}$`; },
  });
  td.addRule('removeStyle', { filter: 'style', replacement: () => '' });
  return td;
}

/* ---------- Filter options ---------- */

const DIFFICULTY_OPTIONS = [
  { value: 'ALL', label: '全部难度' },
  { value: '简单', label: '简单' },
  { value: '一般', label: '一般' },
  { value: '困难', label: '困难' },
];

/* ---------- Component ---------- */

export function QuestionBankFab({ requests }: { requests: CapturedRequest[] }) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [difficulty, setDifficulty] = useState<string>('ALL');
  const [questionType, setQuestionType] = useState<string>('ALL');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Parse question items from captured requests in real-time, newest first
  const questions = useMemo(() => {
    const items: QuestionItem[] = [];
    const seen = new Set<string>();
    for (let i = requests.length - 1; i >= 0; i--) {
      const r = requests[i];
      if (r.url && r.url.includes(QB_URL_PATTERN) && r.responseBody) {
        const parsed = parseQuestionBankResponse(r.responseBody);
        for (let j = parsed.length - 1; j >= 0; j--) {
          const q = parsed[j];
          if (!seen.has(q.id)) { seen.add(q.id); items.push(q); }
        }
      }
    }
    return items;
  }, [requests]);

  const questionTypeOptions = useMemo(() => {
    const types = new Set<string>();
    questions.forEach((q) => { if (q.questionTypeName) types.add(q.questionTypeName); });
    return [{ value: 'ALL', label: '全部题型' }, ...[...types].map((t) => ({ value: t, label: t }))];
  }, [questions]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return questions.filter((q) => {
      if (difficulty !== 'ALL' && q.difficultyName !== difficulty) return false;
      if (questionType !== 'ALL' && q.questionTypeName !== questionType) return false;
      if (kw) {
        const text = [q.questionContent, q.questionTypeName, q.courseTypeName, q.difficultyName, ...(q.tagNames || []), ...(q.pointList?.map((p) => p.name) || [])].join(' ').toLowerCase();
        if (!text.includes(kw)) return false;
      }
      return true;
    });
  }, [questions, keyword, difficulty, questionType]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const handleConvertQuestion = useCallback((record: QuestionItem) => {
    const td = createTurndown();
    const md = td.turndown(record.fullContent || record.questionContent);
    navigator.clipboard.writeText(md).then(() => {
      const msg = document.createElement('div');
      msg.textContent = `题号 ${record.questionNo} Markdown 已复制`;
      msg.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:6px 16px;background:#52c41a;color:#fff;border-radius:4px;z-index:9999;font-size:13px;';
      document.body.appendChild(msg);
      setTimeout(() => msg.remove(), 2000);
    });
  }, []);

  const columns: ColumnsType<QuestionItem> = [
    {
      title: '', width: 40,
      render: (_: unknown, r: QuestionItem) => {
        const exp = expandedIds.has(r.id);
        return <Button type="text" size="small" icon={exp ? <MinusSquareOutlined /> : <PlusSquareOutlined />} onClick={() => toggleExpand(r.id)} style={{ color: exp ? '#722ed1' : '#666' }} />;
      },
    },
    { title: '题号', dataIndex: 'questionNo', width: 64, sorter: (a, b) => a.questionNo - b.questionNo },
    { title: '题型', dataIndex: 'questionTypeName', width: 90, render: (t: string) => <Tag color="purple">{t}</Tag> },
    {
      title: '题目内容', dataIndex: 'questionContent',
      render: (html: string, record: QuestionItem) => {
        if (expandedIds.has(record.id)) return <RichContent html={record.fullContent || html} />;
        return <Tooltip title={stripHtml(html)} overlayStyle={{ maxWidth: 400 }}><span style={{ cursor: 'pointer' }} onClick={() => toggleExpand(record.id)}>{stripHtml(html).slice(0, 80)}{stripHtml(html).length > 80 ? '…' : ''}</span></Tooltip>;
      },
    },
    { title: '学科', dataIndex: 'courseTypeName', width: 100, render: (t: string) => <Tag color="cyan">{t}</Tag> },
    {
      title: '难度', dataIndex: 'difficultyName', width: 80,
      render: (t: string) => { const color = t === '困难' ? 'red' : t === '一般' ? 'gold' : 'green'; return <Tag color={color}>{t}</Tag>; },
    },
    { title: '能力', dataIndex: 'questionCapacityName', width: 100, ellipsis: true },
    {
      title: '知识点', width: 140, ellipsis: true,
      render: (_: unknown, r: QuestionItem) => <Tooltip title={r.pointList?.map((p) => p.name).join('、')}><span>{r.pointList?.map((p) => p.name).join('、') || '—'}</span></Tooltip>,
    },
    {
      title: '操作', width: 80,
      render: (_: unknown, record: QuestionItem) => <Button type="link" size="small" icon={<FileTextOutlined />} onClick={() => handleConvertQuestion(record)}>转MD</Button>,
    },
  ];

  return (
    <>
      <Affix offsetBottom={20} style={{ position: 'fixed', right: 56, bottom: 16, zIndex: 1050 }}>
        <Badge count={questions.length} size="small" offset={[-4, 4]}>
          <Button
            type="primary"
            shape="circle"
            size="large"
            style={{ background: '#722ed1', borderColor: '#722ed1' }}
            icon={<BookOutlined />}
            onClick={() => setOpen(true)}
            title="题库数据（实时监听）"
          />
        </Badge>
      </Affix>
      <Drawer
        title={`题库数据（${filtered.length} / ${questions.length}）`}
        placement="right"
        width="90%"
        open={open}
        onClose={() => setOpen(false)}
        destroyOnClose={false}
        rootStyle={{ zIndex: 1100 }}
        styles={{ body: { paddingTop: 12 } }}
      >
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search allowClear placeholder="关键词搜索（题目/知识点/标签…）" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 280 }} />
          <Select value={questionType} onChange={setQuestionType} style={{ width: 140 }} options={questionTypeOptions} placeholder="题型" />
          <Select value={difficulty} onChange={setDifficulty} style={{ width: 130 }} options={DIFFICULTY_OPTIONS} placeholder="难度" />
        </Space>
        <Table<QuestionItem>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1000, y: 'calc(100vh - 220px)' }}
          expandable={{
            expandedRowKeys: [...expandedIds],
            onExpandedRowsChange: (keys) => setExpandedIds(new Set(keys as string[])),
            rowExpandable: (r) => !!r.detailList?.length,
            expandedRowRender: (r) => (
              <div style={{ margin: '4px 0' }}>
                <div style={{ marginBottom: 12, padding: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 6, borderLeft: '3px solid #722ed1' }}>
                  <div style={{ marginBottom: 4, fontSize: 11, color: '#999' }}>题目内容</div>
                  <RichContent html={r.fullContent || r.questionContent} />
                </div>
                {r.pointList?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ color: '#999', fontSize: 11, marginRight: 6 }}>知识点：</span>
                    {r.pointList.map((p) => <Tag key={p.id} color="blue" style={{ marginBottom: 2 }}>{p.name}</Tag>)}
                  </div>
                )}
                {r.tagNames?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ color: '#999', fontSize: 11, marginRight: 6 }}>标签：</span>
                    {r.tagNames.map((n) => <Tag key={n} color="geekblue" style={{ marginBottom: 2 }}>{n}</Tag>)}
                  </div>
                )}
                {r.detailList?.map((d) => (
                  <div key={d.id} style={{ marginBottom: 10, padding: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                    <div style={{ marginBottom: 6 }}>
                      <Tag color="orange">子题 {d.subQuestionNo}</Tag>
                      <Tag>{d.difficultyName}</Tag>
                      {d.questionCapacityName && <Tag color="blue">{d.questionCapacityName}</Tag>}
                    </div>
                    {d.questionAnswer && d.questionAnswer !== '<p></p>' && (
                      <div style={{ marginBottom: 6 }}><div style={{ color: '#52c41a', fontSize: 11, marginBottom: 2, fontWeight: 'bold' }}>答案</div><RichContent html={d.questionAnswer} /></div>
                    )}
                    {d.famousTeacherGuide && (
                      <div style={{ marginBottom: 6 }}><div style={{ color: '#faad14', fontSize: 11, marginBottom: 2, fontWeight: 'bold' }}>名师指导</div><RichContent html={d.famousTeacherGuide} /></div>
                    )}
                    {d.questionAnalysis && (
                      <div><div style={{ color: '#40a9ff', fontSize: 11, marginBottom: 2, fontWeight: 'bold' }}>解析</div><RichContent html={d.questionAnalysis} /></div>
                    )}
                  </div>
                ))}
              </div>
            ),
          }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          locale={{ emptyText: '暂无题库数据（请访问 yihui100.com 并触发 /api/question/bank/list 接口）' }}
        />
      </Drawer>
    </>
  );
}
