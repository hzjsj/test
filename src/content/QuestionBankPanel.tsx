import { useState, useMemo, useCallback } from 'react';
import { Drawer, Table, Select, Space, Input, Tag, Badge, Button, Upload, Tabs, Tooltip, Typography, message, Spin, Alert } from 'antd';
import { BookOutlined, UploadOutlined, CopyOutlined, DownloadOutlined, FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import mammoth from 'mammoth';
import TurndownService from 'turndown';

/* ---------- Types ---------- */

interface QuestionPoint {
  id: string;
  name: string;
}

interface QuestionDetail {
  id: string;
  subQuestionNo: number;
  questionAnswer: string;
  questionAnalysis: string;
  famousTeacherGuide: string;
  difficultyName: string;
  questionCapacityName: string;
  questionDifficultyCode: string;
  pointIds: string[];
}

export interface QuestionItem {
  id: string;
  questionNo: number;
  questionTypeName: string;
  courseTypeName: string;
  questionContent: string;
  difficultyName: string;
  questionCapacityName: string;
  tagNames: string[];
  detailList: QuestionDetail[];
  pointList: QuestionPoint[];
  updateTime: string;
  fullContent?: string;
}

/* ---------- Utils ---------- */

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<span[^>]*data-w-e-type="formula"[^>]*data-value="([^"]*)"[^>]*><\/span>/g, ' $$$1$$ ')
    .replace(/<img[^>]*>/g, '[图片]')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}

const QUESTION_BANK_URL = 'yihui100.com/api/question/bank/list';

export function parseQuestionBankResponse(responseBody: string | null): QuestionItem[] {
  if (!responseBody) return [];
  try {
    const json = JSON.parse(responseBody);
    const data = json.data ?? json.result ?? json;
    const list: unknown[] = data.list ?? data.records ?? data.items ?? (Array.isArray(data) ? data : []);
    return list.filter((q: any) => q && q.id) as QuestionItem[];
  } catch {
    return [];
  }
}

/* ---------- Filter options ---------- */

const DIFFICULTY_OPTIONS = [
  { value: 'ALL', label: '全部难度' },
  { value: '简单', label: '简单' },
  { value: '一般', label: '一般' },
  { value: '困难', label: '困难' },
];

/* ---------- Turndown setup ---------- */

function createTurndown(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  td.addRule('formula', {
    filter: (node) => node.nodeName === 'SPAN' && node.getAttribute('data-w-e-type') === 'formula',
    replacement(_content, node) {
      const value = (node as HTMLElement).getAttribute('data-value') || '';
      return `$${value}$`;
    },
  });
  td.addRule('removeStyle', {
    filter: 'style',
    replacement: () => '',
  });
  return td;
}

/* ---------- Image upload ---------- */

async function uploadImageToServer(base64Data: string, contentType: string): Promise<string> {
  const res = await fetch(`data:${contentType};base64,${base64Data}`);
  const blob = await res.blob();
  const formData = new FormData();
  formData.append('file', blob, `image_${Date.now()}.${contentType.split('/')[1] || 'png'}`);

  const resp = await fetch('https://yihui100.com/api/resource/file/upload', {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  if (!resp.ok) throw new Error(`上传失败: ${resp.status}`);
  const result = await resp.json();
  return result?.data?.url || result?.data?.id || result?.data || '';
}

/* ---------- Component ---------- */

interface Props {
  questions: QuestionItem[];
  getPopupContainer: () => HTMLElement;
}

export default function QuestionBankPanel({ questions, getPopupContainer }: Props) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [difficulty, setDifficulty] = useState<string>('ALL');
  const [questionType, setQuestionType] = useState<string>('ALL');

  // Word → Markdown
  const [markdown, setMarkdown] = useState('');
  const [converting, setConverting] = useState(false);
  const [imageUploadResults, setImageUploadResults] = useState<{ total: number; uploaded: number; failed: number } | null>(null);

  // Derive unique question types from data
  const questionTypeOptions = useMemo(() => {
    const types = new Set<string>();
    questions.forEach((q) => { if (q.questionTypeName) types.add(q.questionTypeName); });
    return [
      { value: 'ALL', label: '全部题型' },
      ...[...types].map((t) => ({ value: t, label: t })),
    ];
  }, [questions]);

  // Filtering
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

  // Table columns
  const columns: ColumnsType<QuestionItem> = [
    {
      title: '题号',
      dataIndex: 'questionNo',
      width: 64,
      sorter: (a, b) => a.questionNo - b.questionNo,
    },
    {
      title: '题型',
      dataIndex: 'questionTypeName',
      width: 90,
      render: (t: string) => <Tag color="purple">{t}</Tag>,
    },
    {
      title: '题目内容',
      dataIndex: 'questionContent',
      ellipsis: true,
      render: (html: string) => (
        <Tooltip title={stripHtml(html)} getPopupContainer={getPopupContainer} overlayStyle={{ maxWidth: 400 }}>
          <span style={{ cursor: 'default' }}>{stripHtml(html).slice(0, 80)}</span>
        </Tooltip>
      ),
    },
    {
      title: '学科',
      dataIndex: 'courseTypeName',
      width: 100,
      render: (t: string) => <Tag color="cyan">{t}</Tag>,
    },
    {
      title: '难度',
      dataIndex: 'difficultyName',
      width: 80,
      render: (t: string) => {
        const color = t === '困难' ? 'red' : t === '一般' ? 'gold' : 'green';
        return <Tag color={color}>{t}</Tag>;
      },
    },
    {
      title: '能力',
      dataIndex: 'questionCapacityName',
      width: 100,
      ellipsis: true,
    },
    {
      title: '知识点',
      width: 160,
      ellipsis: true,
      render: (_: unknown, r: QuestionItem) => (
        <Tooltip title={r.pointList?.map((p) => p.name).join('、')} getPopupContainer={getPopupContainer}>
          <span>{r.pointList?.map((p) => p.name).join('、') || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tagNames',
      width: 140,
      ellipsis: true,
      render: (names: string[]) => names?.map((n) => <Tag key={n} color="geekblue" style={{ marginBottom: 2 }}>{n}</Tag>),
    },
    {
      title: '子题',
      dataIndex: 'detailList',
      width: 60,
      render: (d: QuestionDetail[]) => d?.length || 0,
    },
  ];

  // Word file conversion handler
  const handleWordUpload = useCallback(async (file: File) => {
    setConverting(true);
    setMarkdown('');
    setImageUploadResults(null);

    try {
      const arrayBuffer = await file.arrayBuffer();

      // Collect images for upload
      const images: { base64: string; contentType: string; index: number }[] = [];
      let imageIndex = 0;

      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.imgElement(function (image) {
            const idx = imageIndex++;
            return image.read('base64').then(function (imageBuffer) {
              const contentType = image.contentType || 'image/png';
              images.push({ base64: imageBuffer, contentType, index: idx });
              return { src: `__IMG_PLACEHOLDER_${idx}__` };
            });
          }),
        }
      );

      const turndown = createTurndown();
      let md = turndown.turndown(result.value);

      // Upload images and replace placeholders
      if (images.length > 0) {
        let uploaded = 0;
        let failed = 0;
        for (const img of images) {
          try {
            const url = await uploadImageToServer(img.base64, img.contentType);
            const finalUrl = url.startsWith('http') ? url : `https://yihui100.com/api/resource/file/preSign/question/image/${url}`;
            md = md.replace(`__IMG_PLACEHOLDER_${img.index}__`, finalUrl);
            uploaded++;
          } catch {
            md = md.replace(`__IMG_PLACEHOLDER_${img.index}__`, `data:${img.contentType};base64,${img.base64.slice(0, 20)}...`);
            failed++;
          }
        }
        setImageUploadResults({ total: images.length, uploaded, failed });
      }

      setMarkdown(md);
      message.success(`转换完成：${images.length} 张图片`);
    } catch (err: any) {
      message.error(`转换失败: ${err.message || err}`);
    } finally {
      setConverting(false);
    }

    return false; // prevent antd default upload
  }, []);

  // Copy/Download markdown
  const handleCopyMarkdown = useCallback(() => {
    navigator.clipboard.writeText(markdown).then(() => message.success('已复制到剪贴板'));
  }, [markdown]);

  const handleDownloadMarkdown = useCallback(() => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `question-bank-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [markdown]);

  // Convert a single question's content to Markdown
  const handleConvertQuestion = useCallback((record: QuestionItem) => {
    const td = createTurndown();
    const html = record.fullContent || record.questionContent;
    const md = td.turndown(html);
    setMarkdown((prev) => (prev ? prev + '\n\n---\n\n' + md : md));
    message.success(`题号 ${record.questionNo} 已添加到转换区`);
  }, []);

  // Enhanced columns with action
  const columnsWithAction: ColumnsType<QuestionItem> = [
    ...columns,
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record: QuestionItem) => (
        <Button type="link" size="small" icon={<FileTextOutlined />} onClick={() => handleConvertQuestion(record)}>
          转MD
        </Button>
      ),
    },
  ];

  const drawerTitle = (
    <Space>
      <BookOutlined />
      题库数据（{filtered.length} / {questions.length}）
    </Space>
  );

  return (
    <>
      <div style={{ position: 'fixed', right: 20, bottom: 80, zIndex: 1050, pointerEvents: 'auto' }}>
        <Badge count={questions.length} size="small" offset={[-4, 4]}>
          <Button
            type="primary"
            shape="circle"
            size="large"
            style={{ background: '#722ed1', borderColor: '#722ed1' }}
            icon={<BookOutlined />}
            onClick={() => setOpen(true)}
            title="题库数据 — 监听 yihui100.com 接口"
          />
        </Badge>
      </div>

      <Drawer
        title={drawerTitle}
        placement="right"
        width="85%"
        open={open}
        onClose={() => setOpen(false)}
        destroyOnClose={false}
        getContainer={false}
        rootStyle={{ position: 'fixed' }}
        styles={{ body: { paddingTop: 12 } }}
      >
        <Tabs
          defaultActiveKey="questions"
          items={[
            {
              key: 'questions',
              label: '题库数据',
              children: (
                <>
                  <Space wrap style={{ marginBottom: 16 }}>
                    <Input.Search
                      allowClear
                      placeholder="关键词搜索（题目/知识点/标签…）"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      style={{ width: 280 }}
                    />
                    <Select value={questionType} onChange={setQuestionType} style={{ width: 140 }} options={questionTypeOptions} placeholder="题型" />
                    <Select value={difficulty} onChange={setDifficulty} style={{ width: 130 }} options={DIFFICULTY_OPTIONS} placeholder="难度" />
                  </Space>
                  <Table<QuestionItem>
                    rowKey="id"
                    size="small"
                    columns={columnsWithAction}
                    dataSource={filtered}
                    scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
                    expandable={{
                      rowExpandable: (r) => !!r.detailList?.length,
                      expandedRowRender: (r) => (
                        <div style={{ margin: '8px 0' }}>
                          {r.detailList?.map((d) => (
                            <div key={d.id} style={{ marginBottom: 12, padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                              <div><Tag color="orange">子题 {d.subQuestionNo}</Tag> <Tag>{d.difficultyName}</Tag> <Tag color="blue">{d.questionCapacityName}</Tag></div>
                              {d.famousTeacherGuide && (
                                <div style={{ marginTop: 6 }}><strong>名师指导：</strong>{stripHtml(d.famousTeacherGuide)}</div>
                              )}
                              {d.questionAnalysis && (
                                <div style={{ marginTop: 4 }}><strong>解析：</strong>{stripHtml(d.questionAnalysis).slice(0, 300)}{stripHtml(d.questionAnalysis).length > 300 ? '…' : ''}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      ),
                    }}
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
                    locale={{ emptyText: '暂无题库数据（请访问 yihui100.com 并触发 /api/question/bank/list 接口）' }}
                  />
                </>
              ),
            },
            {
              key: 'word-convert',
              label: 'Word 转换',
              children: (
                <>
                  <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
                    <Upload accept=".docx" showUploadList={false} beforeUpload={handleWordUpload}>
                      <Button icon={<UploadOutlined />} loading={converting} type="primary">
                        上传 Word 文件（.docx）
                      </Button>
                    </Upload>
                    {converting && <Spin tip="正在转换…"><div style={{ height: 40 }} /></Spin>}
                    {imageUploadResults && (
                      <Alert
                        type={imageUploadResults.failed === 0 ? 'success' : 'warning'}
                        showIcon
                        icon={<CheckCircleOutlined />}
                        message={`图片处理完成：共 ${imageUploadResults.total} 张，上传成功 ${imageUploadResults.uploaded} 张，失败 ${imageUploadResults.failed} 张`}
                        style={{ marginBottom: 8 }}
                      />
                    )}
                  </Space>
                  {markdown && (
                    <>
                      <Space style={{ marginBottom: 8 }}>
                        <Button icon={<CopyOutlined />} onClick={handleCopyMarkdown} size="small">复制 Markdown</Button>
                        <Button icon={<DownloadOutlined />} onClick={handleDownloadMarkdown} size="small">下载 .md</Button>
                      </Space>
                      <Typography.Paragraph>
                        <pre style={{
                          background: 'rgba(255,255,255,0.06)',
                          padding: 12,
                          borderRadius: 6,
                          maxHeight: 'calc(100vh - 380px)',
                          overflow: 'auto',
                          fontSize: 13,
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}>
                          {markdown}
                        </pre>
                      </Typography.Paragraph>
                    </>
                  )}
                </>
              ),
            },
          ]}
        />
      </Drawer>
    </>
  );
}
