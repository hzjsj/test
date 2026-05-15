# API Inspector - Chrome 网络请求捕获插件

## 项目简介

Chrome 浏览器扩展，用于捕获用户网络请求数据，支持按接口自动识别和筛选；捕获在 **DevTools 后台页** 进行（打开 F12 即生效），数据可输出到**页面 Console**与插件内置控制台。

## 技术架构

### 整体方案：混合架构

- **DevTools 后台页**（`devtools/devtools.html` → `devtools.js`）：随 F12 打开即加载，在此注册 `chrome.devtools.network.onRequestFinished`，**无需切换到「API Inspector」标签**即可捕获当前被检查标签页的全部已完成请求；标准化后写入 Background，并触发页面 Console 输出。
- **DevTools 面板**：筛选、列表、详情与内置控制台；通过 `chrome.runtime.connect`（通道名 `api-inspector`）接收 Background 转发的实时请求，与后台页共用同一份捕获数据。
- **Popup 弹窗**：快捷控制面板（查看统计、快速筛选规则等）。
- **Background Service Worker**：按 `tabId` 存储请求、转发 `LOG_TO_CONSOLE`、维护与面板的 Port 广播。
- **Content Script**：在页面上下文中向浏览器 Console 输出每条请求的格式化日志（含单行摘要与完整对象）；同时在页面右下角渲染 **Affix 固钉 + Drawer 抽屉 + Table 表格** 浮窗，实时展示和筛选请求数据。

### 技术选型

| 项目 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript | 类型安全，复杂 HAR 数据结构和消息传递需要类型约束 |
| 构建工具 | Vite | 快速 HMR，原生 TS 支持，多入口 rollup 配置适配扩展 |
| UI | React 18 + Ant Design 5 | DevTools 面板与页面浮窗使用 Ant Design（`Affix` / `Drawer` / `Table` / `Upload` / `Tabs` 等）；与 [Ant Design 组件说明](https://ant.design/llms-full.txt) 对齐写法 |
| 样式 | CSS Custom Properties + antd 主题 | 原有面板布局样式保留；antd 使用 `ConfigProvider` 暗色算法适配 DevTools |
| 文档转换 | mammoth + Turndown | Word（.docx）→ HTML → Markdown；公式 span 转 LaTeX 语法；图片自动上传服务器 |
| 扩展规范 | Manifest V3 | Chrome 最新扩展标准 |

## 文件结构

```
yihui100/
├── manifest.json                    # 扩展配置文件
├── package.json
├── tsconfig.json
├── vite.config.ts                   # 多步构建配置（IIFE 格式）
├── scripts/
│   └── postbuild.js                 # 构建后处理：生成 HTML、整理文件结构
├── icons/                           # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/
│   │   └── service-worker.ts        # Background Service Worker
│   ├── devtools/
│   │   ├── devtools.html            # DevTools 页面入口
│   │   ├── devtools.ts              # 注册自定义面板
│   │   └── panel/
│   │       ├── panel.html           # 面板 HTML 入口
│   │       ├── panel.tsx            # 面板主组件
│   │       ├── panel.css            # 面板样式
│   │       ├── components/
│   │       │   ├── FilterBar.tsx
│   │       │   ├── RequestList.tsx
│   │       │   ├── RequestDetail.tsx
│   │       │   ├── ConsolePanel.tsx
│   │       │   ├── RequestsDrawerFab.tsx  # 右下角 Affix + Drawer 内 Table 请求表
│   │       │   └── QuestionBankFab.tsx    # 题库悬浮按钮（实时监听请求数据）
│   │       └── hooks/
│   │           └── useInspectorRequests.ts  # 与 Background/Port 同步的请求列表
│   ├── popup/
│   │   ├── popup.html               # Popup HTML 入口
│   │   ├── popup.tsx                # Popup 主组件
│   │   └── popup.css                # Popup 样式
│   ├── content/
│   │   ├── content-script.tsx       # Shadow DOM + React 挂载 + Console 输出 + 请求转发
│   │   ├── ContentApp.tsx           # 页面浮窗 UI（请求捕获 + 题库数据两个入口）
│   │   └── QuestionBankPanel.tsx    # 题库数据面板 + Word→Markdown 转换
│   └── shared/
│       ├── types.ts                 # 共享类型定义
│       ├── constants.ts             # 消息类型和存储键常量
│       ├── filter-engine.ts         # 筛选引擎（自动识别 + 筛选逻辑）
│       ├── har-request.ts           # HAR 标准化与 getContent 响应体读取
│       └── message-bus.ts           # 类型安全消息传递工具
└── dist/                            # 构建输出目录
    ├── manifest.json
    ├── service-worker.js            # IIFE 格式
    ├── content-script.js            # IIFE 格式
    ├── devtools/
    │   ├── devtools.html
    │   ├── devtools.js
    │   └── panel/
    │       ├── panel.html           # CSS 内联
    │       └── panel.js             # IIFE 格式
    ├── popup/
    │   ├── popup.html               # CSS 内联
    │   └── popup.js                 # IIFE 格式
    └── icons/
```

## 数据流

```
chrome.devtools.network.onRequestFinished
        │
        ▼
  DevTools 后台页 (dist/devtools/devtools.js，由 src/devtools/devtools.ts 构建)
  - 读取 tab_inspector_settings：是否暂停捕获、是否保留日志
  - 检查捕获范围白名单（chrome.storage.local → capture_scope）：白名单为空或不匹配则跳过
  - captureFromNetworkRequest() → CapturedRequest（含 entry.getContent 响应体）
        │
        ├─ sendMessage(CAPTURED_REQUEST) → Background（落库 + Port 广播 request + 转发到 Content Script 页面浮窗）
        ├─ sendMessage(LOG_TO_CONSOLE)  → Background → tabs.sendMessage → Content Script → 页面 Console
        └─ onNavigated：未勾选「保留日志」时 sendMessage(CLEAR_REQUESTS)（并 Port 广播 cleared）
        │
        ▼
  Background Service Worker
  - 按 tabId 存储请求列表
  - CAPTURED_REQUEST / CLEAR_REQUESTS 后向 connect 名 api-inspector 的 Port 推送
  - 转发 LOG_TO_CONSOLE 到被检查页所在 tab 的 Content Script
  - 转发 REQUEST_FOR_CONTENT 到被检查页所在 tab 的 Content Script（页面浮窗实时更新）
  - FilterRule 等仍用 chrome.storage.local
        │
    ┌───┴───┐
    ▼       ▼
  Panel   Popup / Content Script
  (Port   (Popup 读存储；Content：console.info + group 详情 + 页面浮窗 Table)
   同步列表)
```

筛选规则同步：Panel 和 Popup 都通过 `chrome.storage.local` 读写 FilterRule，通过 `chrome.storage.onChanged` 监听变更实时同步。暂停捕获与「保留日志」按被检查 `tabId` 存在 `tab_inspector_settings` 中，由面板与 DevTools 后台页共同读取。

## 核心功能

### 1. 网络请求捕获 + 自动输出

- 监听点在 **DevTools 后台页**（只要打开 F12，不依赖是否点开「API Inspector」面板），`onRequestFinished` 覆盖该被检查页签的**全部已完成请求**（含静态资源、XHR、fetch 等）。
- 通过 `entry.getContent()` 尽量读取响应体；大于 1MB 截断；部分资源（opaque、缓存、非文本等）可能无 body。
- 工具栏可暂停捕获、保留日志（与 `chrome.storage` 中 `tab_inspector_settings` 同步）；未保留日志时，页面导航会清空该 tab 的已存请求并同步面板。
- **每个请求**在捕获后自动经 Background 转发到 **页面 Console**（Content Script）及 **面板内置控制台**（仅实时新请求，避免初次拉取历史时刷屏）。

### 1.1 使用前提与限制

- 必须对目标页打开 **开发者工具**，Chrome 才会向扩展暴露 `chrome.devtools.network`。
- Content Script 无法注入 `chrome://`、应用商店等受限页面，这些页面上**没有**页面 Console 输出；普通 https/http 页面正常。

### 2. 题库数据面板

- **自动监听** `yihui100.com/api/question/bank/list` 接口响应，解析 JSON 提取题目列表并去重合并。
- **最新题目优先**：新捕获的题目排在列表最前面，确保最新数据始终在第一页。
- **KaTeX 公式渲染**：题目中的数学公式（`<span data-w-e-type="formula">` 标签）实时渲染为数学排版，需要时自动注入 KaTeX CSS。
- **可展开行详情**：点击每行前的 `+` 图标展开查看完整题目内容（富文本渲染）和子题详情（答案、名师指导、解析）。
- 页面右下角显示**紫色圆形按钮**（Badge 角标显示题目数量），点击弹出 Drawer 抽屉。
- **题库数据 Tab**：
  - **Table 列**：展开按钮 / 题号 / 题型（Tag） / 题目内容（HTML 脱敏显示 + Tooltip 完整内容；点击展开完整渲染） / 学科 / 难度（颜色标签） / 能力 / 知识点 / 标签 / 操作。
  - 可展开行查看子题详情（名师指导、解析等），子题内容同样使用 KaTeX 渲染公式。
  - **筛选栏**：关键词搜索（题目/知识点/标签）+ 题型下拉（从数据自动提取）+ 难度下拉（简单/一般/困难）。
  - 每行「转 MD」按钮，可将单题 HTML 转为 Markdown 追加到 Word 转换 Tab。
- **Word 转换 Tab**：
  - 上传 `.docx` 文件，通过 `mammoth` 转 HTML → `Turndown` 转 Markdown。
  - 公式 `<span data-w-e-type="formula" data-value="π">` 自动转为 `$π$`。
  - 图片自动上传到 `yihui100.com` 服务器（`/api/resource/file/upload`），替换为线上 URL。
  - 上传结果统计：共 N 张，成功 X 张，失败 Y 张。
  - 支持**复制 Markdown**到剪贴板、**下载 `.md` 文件**。
- **DevTools 面板题库按钮**：DevTools「API Inspector」面板右下角也有紫色悬浮按钮，从面板内的请求数据实时解析题库，与页面浮窗逻辑一致。

### 3. 自动识别接口模式

筛选引擎会自动分析已捕获的请求 URL：

1. 解析每个 URL 的 pathname，按 `/` 分割
2. 识别 ID 段（UUID、纯数字、16+位 hex 字符串）
3. 将 ID 段替换为 `*`，生成模式（如 `/api/v1/users/*`）
4. 按模式分组统计请求数量
5. 用户点击推荐模式即可添加为筛选规则

### 4. 筛选逻辑

```
原始请求 → 应用包含规则（OR 逻辑）→ 应用排除规则（AND 逻辑）→ 筛选结果
```

- 包含规则：请求必须匹配至少一条（显示匹配的）
- 排除规则：请求不得匹配任何一条（隐藏匹配的）
- 支持启用/禁用单条规则而不删除

### 5. 域名/路径白名单（捕获范围）

- **默认不捕获任何请求**：白名单为空时，扩展静默运行，不拦截任何网络请求。
- 在 **Popup 弹窗** 中配置域名 + 路径白名单规则（可添加多条）。
- 每条规则包含：**域名**（如 `yihui100.com`）、**路径前缀**（可选，如 `/api/`）、**启用/禁用**开关。
- URL 匹配逻辑：请求 URL 的 hostname 包含规则域名 且 pathname 以路径前缀开头（路径为空则匹配全路径）。
- DevTools 后台页在 `onRequestFinished` 中检查白名单，不匹配的请求直接跳过，不进入捕获流水线。
- Service Worker 转发 `REQUEST_FOR_CONTENT` 时也受白名单约束。

### 6. 双控制台输出

**浏览器 Console**（页面上下文）：

- 每条请求先输出一行 **`console.info('[API Inspector]', method, status, url)`**，便于过滤与检索。
- 折叠组内输出：请求头、请求体（若有）、**响应头**、响应体（JSON 尝试解析；无 body 时说明原因）、Timing、**完整 `CapturedRequest` 对象**。

**插件内置控制台**：DevTools 面板内区域，仅追加**实时捕获**的请求，支持导出 JSON；清空列表或导航清空时会与请求列表一并重置（见面板逻辑）。

### 6. 右下角请求表（Ant Design）

#### DevTools 面板内

- 面板右下角 **蓝色圆形按钮**（请求表）+ **紫色圆形按钮**（题库数据），点击分别打开 Drawer 抽屉。
- 请求表抽屉：以 **`Table`** 展示当前已捕获的**全量请求**，筛选支持 URL 关键词和 HTTP 方法。
- 题库数据抽屉：实时从面板请求数据中解析 `question/bank/list` 响应，展示题库表格（含 KaTeX 公式渲染、子题展开），最新题目排在第一页。
- 遵循 [Ant Design 文档索引 / llms-full](https://ant.design/llms-full.txt) 中的组件约定。

#### DevTools 面板内

- 面板右下角 **`Affix` 固钉** + 圆形按钮；点击打开 **`Drawer` 抽屉**。
- 抽屉内以 **`Table`** 展示当前已捕获的**全量请求**（`requests`，与工具栏「筛选后数 / **总数**」中的**总数**一致；**不含**左侧「接口筛选规则」与搜索框的过滤）。
- 提供筛选：**URL 关键词**（`Input.Search`）、**HTTP 方法**（`Select`，含「全部方法」）。
- 遵循 [Ant Design 文档索引 / llms-full](https://ant.design/llms-full.txt) 中的组件约定（如 `Table` 的 `columns` / `dataSource`、`Drawer` 的 `open` / `onClose` 等）。

#### 页面浮窗（Content Script）

- 在**页面右下角**显示一个蓝色圆形 **固定按钮**（`position: fixed`），Badge 角标显示已捕获请求数量。
- 点击按钮弹出 **`Drawer` 抽屉**（宽度 80%，暗色主题），内嵌 **`Table`** 表格展示请求列表。
- Table 列：**Method**（Tag） / **URL**（ellipsis + Tooltip） / **Status**（Tag，按状态码着色） / **Size** / **Time**。
- 筛选栏：**URL 关键词搜索**（`Input.Search`）+ **HTTP 方法**（`Select`）+ **状态码分类**（`Select`：2xx/3xx/4xx/5xx）。
- 使用 **Shadow DOM** 挂载，`StyleProvider` + `ConfigProvider`（暗色主题 + 中文 locale），样式完全隔离不影响宿主页面。
- 通过 `REQUEST_FOR_CONTENT` 消息实时接收 Service Worker 转发的请求数据，与控制台打印同步。

## 构建和安装

### 本地 UI 预览（非扩展环境）

项目根目录已提供 `index.html` + `preview/chrome-mock.ts`，用 **Mock 的 `chrome.*` API** 在浏览器中渲染 DevTools 面板 UI（含右下角 Affix / Drawer / Table），便于快速看布局与交互：

```bash
npm run dev
```

浏览器访问终端输出的地址（默认 **http://127.0.0.1:5173/**）。真实网络捕获与 `chrome.devtools.network` 仍须在 Chrome 中加载 `dist/` 扩展验证。

### 构建

```bash
npm install --legacy-peer-deps
npm run build
```

若安装阶段出现 `EBUSY`（例如 `node_modules` 下残留被锁定的目录），请关闭占用该路径的程序后删除整个 `node_modules` 再执行安装。

构建过程：**一次主构建（抽取 CSS）** + **5 次按 `BUILD_TARGET` 的 IIFE 子构建** + **后处理**：

1. **主构建**：提取 CSS 资源（panel.css、popup.css）
2. **Service Worker 构建**：`service-worker.js`
3. **DevTools 后台页构建**：`devtools.iife.js` → 后处理重命名为 `devtools/devtools.js`（注册面板 + 网络监听）
4. **Panel 构建**：`panel.js` → `devtools/panel/panel.js`
5. **Popup 构建**：`popup.js`
6. **Content Script 构建**：根目录 `content-script.js`
7. **后处理**（`scripts/postbuild.js`）：
   - 生成 `devtools.html`、`devtools/panel/panel.html`、`popup.html`（CSS 内联）
   - 移动/重命名各 IIFE 产物到约定路径
   - 读取根目录 `manifest.json`，将 **patch 版本号 +1** 后写回**根目录与 `dist/manifest.json`**（便于每次打包后 Chrome 识别为新版本；提交前请留意 Git 中的版本变更）
   - **强制 UTF-8 无 BOM 编码**：对所有 JS 产物和 manifest.json 读取并去除 BOM → UTF-8 解码 → UTF-8 写回，确保 Windows 下不会因 GBK 编码导致 Chrome 加载失败
   - 确保 `dist` 目录存在；复制图标；清理中间文件

> **Windows 提示**：仓库内 `npm run build` 使用 Unix 风格命令（`rm -rf`、`BUILD_TARGET=...`）。在 PowerShell 下若失败，可在 Git Bash 中执行，或分段执行 `vite build` 与各 `BUILD_TARGET` 构建后再运行 `node scripts/postbuild.js`。

> **为什么全部用 IIFE 格式？** Chrome 扩展的 DevTools 面板、Popup、Content Script 对 ES Module 支持有限，使用 IIFE 格式将所有代码内联到单个 JS 文件，避免跨文件 import 导致的加载失败问题。

### 安装

1. Chrome 地址栏输入 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目中的 `dist/` 目录

更新代码后：请重新执行 `npm run build`，在扩展列表中对本扩展点击 **「重新加载」**，再打开或刷新 DevTools。

### 使用

1. 打开任意网页 + **F12** 打开 DevTools（**不必**先点开「API Inspector」即可开始捕获并输出到页面 Console）。
2. 需要筛选与详情时，在 DevTools 标签栏选择 **「API Inspector」** 面板。
3. 刷新页面（Ctrl+F5），请求列表会随捕获增长；筛选栏仅影响列表展示，不改变「是否捕获」。
4. 所有完成的请求会按上述数据流输出到浏览器 Console 与（实时）内置控制台。
5. 点击右下角 **蓝色圆形按钮**，可在 **Drawer** 中用 Ant Design **Table** 查看全量请求并做 URL / 方法 / 状态码筛选。
6. **题库数据**：访问 `yihui100.com` 时，右下角会出现**紫色圆形按钮**（Badge 显示题目数），点击可查看题库表格和筛选；也可上传 `.docx` 文件转换为 Markdown（图片自动上传到服务器）。
7. **页面浮窗**：即使不打开 DevTools 面板，页面右下角也会出现蓝色/紫色按钮，点击即可在页面内直接查看数据。

## 关键文件说明

- `src/devtools/devtools.ts` — DevTools 后台入口：注册 `panels.create`、网络监听、导航清空逻辑、**捕获范围白名单过滤**；**面板 HTML 路径须为相对扩展根的 `devtools/panel/panel.html`**
- `src/devtools/panel/components/RequestsDrawerFab.tsx` — Ant Design：`Affix` 固钉、`Drawer`、`Table` 与 URL / Method 筛选
- `src/devtools/panel/components/QuestionBankFab.tsx` — 题库悬浮按钮组件（从面板请求数据实时解析题库，KaTeX 渲染 + 子题展开）
- `src/devtools/panel/panel.tsx` — 根组件：`ConfigProvider`（暗色主题 + 中文 locale）+ 原有布局 + 挂载请求抽屉
- `src/devtools/panel/hooks/useInspectorRequests.ts` — 初始拉取 Background 请求列表、Port 实时同步、与存储联动的暂停/保留日志
- `src/shared/har-request.ts` — `captureFromNetworkRequest`，HAR 与响应体标准化
- `src/shared/filter-engine.ts` — 自动识别接口模式与筛选逻辑
- `src/background/service-worker.ts` — 消息路由、按 tab 存请求、Port 广播、`LOG_TO_CONSOLE` 转发
- `src/content/content-script.tsx` — 页面 Console 格式化输出 + Shadow DOM 挂载 React 应用 + 接收 REQUEST_FOR_CONTENT 消息驱动浮窗
- `src/content/ContentApp.tsx` — 页面浮窗 UI：请求捕获按钮 + 题库数据按钮 + 两个 Drawer
- `src/content/QuestionBankPanel.tsx` — 题库数据面板（Table + 筛选 + 子题展开）+ Word→Markdown 转换（mammoth + Turndown + 图片上传）
- `src/shared/constants.ts` — 消息类型（含 `REQUEST_FOR_CONTENT`、`GET_CAPTURE_SCOPE`、`UPDATE_CAPTURE_SCOPE`）、`STORAGE_KEYS`（含 `capture_scope` 等）
- `manifest.json` — 权限与入口；版本号在 `postbuild` 时自动 patch +1
- `scripts/postbuild.js` — HTML 生成、产物移动、**manifest 版本递增**、面板路径兜底、**强制 UTF-8 无 BOM 编码**
- `vite.config.ts` — 多入口构建（含 `BUILD_TARGET=devtools`）

## 更新日志

### v1.0.6 — 域名白名单 + KaTeX 渲染 + 面板题库按钮 + 最新排序

**新增功能**

- **域名/路径白名单配置**：默认不捕获任何请求，用户在 Popup 中配置指定域名和路径后才监听。
  - Popup 新增「捕获范围」区域：输入域名 + 路径（可选）+ 添加按钮。
  - 已有规则列表支持启用/禁用、删除。
  - 白名单为空时提示「未配置域名，默认不捕获任何请求」。
  - DevTools 后台页 `onRequestFinished` 检查白名单，不匹配的请求直接跳过。
  - Service Worker 转发 `REQUEST_FOR_CONTENT` 时也受白名单约束。
- **KaTeX 公式渲染**：题目内容和子题详情中的数学公式（`<span data-w-e-type="formula" data-value="...">` 标签）实时渲染为数学排版，自动注入 KaTeX CSS。
- **可展开行详情**：点击每行前的 `+`/`-` 图标，展开查看完整题目内容（富文本渲染）和子题详情（答案、名师指导、解析），子题内容同样使用 KaTeX 渲染。
- **DevTools 面板题库悬浮按钮**：面板右下角新增紫色圆形按钮，从面板内的请求数据实时解析 `question/bank/list` 响应，展示题库表格，与页面浮窗逻辑一致。
- **最新题目优先排序**：新捕获的题目排在列表最前面，确保最新数据始终在第一页。Content Script 和 DevTools 面板均已应用。

**文件变更**

- `src/shared/types.ts`：新增 `CaptureScopeRule` 接口（`{ id, domain, path, enabled }`）。
- `src/shared/constants.ts`：新增 `STORAGE_KEYS.CAPTURE_SCOPE`、`MSG_TYPES.GET_CAPTURE_SCOPE`、`MSG_TYPES.UPDATE_CAPTURE_SCOPE`。
- `src/devtools/devtools.ts`：新增 `matchesCaptureScope()` 白名单过滤函数，`onRequestFinished` 中检查白名单规则；缓存规则并监听 `chrome.storage.onChanged` 实时更新。
- `src/background/service-worker.ts`：新增 `GET_CAPTURE_SCOPE` / `UPDATE_CAPTURE_SCOPE` 消息处理；`onMessage` 监听器改为 async IIFE 包装。
- `src/popup/popup.tsx`：新增「捕获范围」配置 UI（域名 + 路径输入、添加/删除/启用禁用规则）。
- `src/popup/popup.css`：新增 `.scope-item`、`.scope-add`、`.scope-input` 等样式。
- `src/devtools/panel/components/QuestionBankFab.tsx`（新建）：面板题库悬浮按钮组件，从 `requests` prop 实时解析题库数据，含 KaTeX 渲染 + 子题展开 + 最新排序。
- `src/devtools/panel/panel.tsx`：集成 `QuestionBankFab` 组件。
- `src/content/ContentApp.tsx`：`pushRequest` 中新题目前置插入（`[...newItems, ...prev]`），最新题目优先。
- `src/content/QuestionBankPanel.tsx`：题目内容使用 `RichContent` 组件渲染（KaTeX），行展开查看子题详情。

**Bug 修复**

- **构建产物编码问题**：Chrome 加载扩展时报错「该文件采用的不是 UTF-8 编码」。原因是 Windows 下 Node.js `writeFileSync` 默认使用 GBK 编码写入含中文的文件，Chrome Manifest V3 要求所有文件必须是 UTF-8（无 BOM）。
  - `scripts/postbuild.js`：新增步骤 7，对所有 JS 构建产物强制重编码为 UTF-8 无 BOM（读取 → 去 BOM → UTF-8 解码 → UTF-8 写回）。
  - `scripts/postbuild.js`：所有 `writeFileSync` 调用显式指定 `'utf-8'` 编码（包括 manifest.json、HTML 文件），避免 Windows 默认 GBK 写入。
  - 之前尝试加 BOM 反而可能导致问题，现已改为**UTF-8 无 BOM**（Chrome 推荐格式）。

---

### v1.0.5 — 题库数据面板 + Word 转 Markdown

**新增功能**

- **题库数据面板**：自动监听 `yihui100.com/api/question/bank/list` 接口响应，解析 JSON 提取题目列表。
  - 页面右下角新增**紫色圆形按钮**（`BookOutlined` 图标），Badge 角标显示题目数量。
  - 点击弹出 Drawer 抽屉，内含两个 Tab：
    - **题库数据 Tab**：Table 展示题号/题型/内容/学科/难度/能力/知识点/标签/子题数，可展开查看子题详情（名师指导、解析）；筛选支持关键词搜索 + 题型下拉（从数据自动提取）+ 难度下拉；每行「转 MD」按钮可将单题追加到转换区。
    - **Word 转换 Tab**：上传 `.docx` 文件，`mammoth` 转 HTML → `Turndown` 转 Markdown；公式 `<span data-w-e-type="formula">` 自动转为 `$...$` LaTeX 语法；图片自动上传到 yihui100.com 服务器并替换为线上 URL；支持复制 Markdown 到剪贴板、下载 `.md` 文件。
- **请求捕获按钮与题库按钮并存**：蓝色按钮（请求捕获，`bottom: 24px`）+ 紫色按钮（题库数据，`bottom: 80px`），互不干扰。

**文件变更**

- `src/content/QuestionBankPanel.tsx`（新建）：题库数据面板组件，含 Table + 筛选 + 子题展开 + Word→Markdown 转换逻辑（mammoth + Turndown + 图片上传）。
- `src/content/ContentApp.tsx`：集成 `QuestionBankPanel`，在 `pushRequest` 回调中检测 `question/bank/list` 接口响应并解析题目数据。
- `package.json`：新增依赖 `mammoth`、`turndown`、`@types/turndown`。
- `vite.config.ts`：新增 `contentBuildShared` 配置，`mammoth` 别名指向浏览器版本 `mammoth.browser.min.js`。
- `src/mammoth-browser.d.ts`（新建）：mammoth 浏览器构建的类型声明。

**依赖说明**

- `mammoth`：将 `.docx` 文件转为 HTML（使用浏览器版本 `mammoth.browser.min.js`，无 Node.js 依赖）。
- `turndown`：将 HTML 转为 Markdown，自定义规则处理 wangEditor 公式 `<span>` 标签。
- 图片上传：调用 `https://yihui100.com/api/resource/file/upload`，需用户已登录 yihui100.com（`credentials: 'include'`）。

---

### v1.0.4 — 页面浮窗（Affix + Drawer + Table）

**新增功能**

- **页面右下角浮窗**：Content Script 使用 React + Ant Design 在页面中渲染固定按钮，点击弹出 Drawer 抽屉，以 Table 表格展示捕获的请求数据。
  - 固定按钮带 **Badge 角标**，实时显示已捕获请求数量。
  - **Table 列**：Method（Tag） / URL（ellipsis + Tooltip） / Status（Tag） / Size / Time。
  - **筛选栏**：URL 关键词搜索（`Input.Search`）+ HTTP 方法（`Select`）+ 状态码分类（`Select`：2xx/3xx/4xx/5xx）。
  - 分页：默认 20 条/页，支持切换每页条数。
- **Shadow DOM 隔离**：浮窗挂载在 Shadow DOM 内，`StyleProvider` + `ConfigProvider`（暗色主题 + 中文 locale），样式与宿主页面完全隔离。
- **实时数据同步**：Service Worker 在 `CAPTURED_REQUEST` 处理中新增 `REQUEST_FOR_CONTENT` 消息转发，将每个捕获的请求实时推送到 Content Script 浮窗。
- **控制台打印保留**：页面 Console 彩色输出功能不受影响，与浮窗同步工作。

**文件变更**

- `src/content/content-script.ts` → `src/content/content-script.tsx`：从纯 TS 改为 React 应用，创建 Shadow DOM 容器，监听 `REQUEST_FOR_CONTENT` 消息。
- `src/content/ContentApp.tsx`（新建）：页面浮窗 UI 组件，包含固定按钮 + Badge + Drawer + Table + 筛选。
- `src/shared/constants.ts`：新增 `REQUEST_FOR_CONTENT` 消息类型。
- `src/background/service-worker.ts`：`CAPTURED_REQUEST` 处理中新增 `chrome.tabs.sendMessage` 转发到 Content Script。
- `vite.config.ts`：Content Script 构建添加 React 插件；拆分 `buildShared` / `topShared` 配置，`define` 替换 `process.env.NODE_ENV` 修复浏览器环境报错。

**Bug 修复**

- 修复 IIFE 构建产物中 `process.env.NODE_ENV` 未替换导致浏览器报 `ReferenceError: process is not defined` 的问题。
- 修复 Shadow DOM 容器 `width:0;height:0` 导致 Drawer 无法正确显示（黑屏）的问题。

---

### v1.0.3 — Ant Design 请求表

- DevTools **面板 + Popup** 由 Preact 迁移为 **React 18**；面板集成 **Ant Design 5**（`antd` + `@ant-design/icons`）。
- 面板右下角 **`Affix` + 按钮**，点击打开 **`Drawer`**，内嵌 **`Table`** 展示全量捕获请求；支持 **URL 关键词**与 **HTTP 方法**筛选。
- 构建：`@vitejs/plugin-react`（与 Vite 6 匹配的 4.x）；`npm install` 建议使用 `--legacy-peer-deps`；若遇 `EBUSY` 需清理被锁定的 `node_modules` 后重装。

---

### v1.0.2（当前实现摘要）

**捕获与输出**

- 将 `chrome.devtools.network` 监听移至 **DevTools 后台页**（`src/devtools/devtools.ts` 打包为 `dist/devtools/devtools.js`），打开 F12 即可捕获，无需先进入「API Inspector」面板。
- 每条完成请求仍经 Background 转发到 Content Script，在**页面 Console** 输出；增强日志：单行 `console.info`、响应头、无 body 说明、完整对象。
- 抽取 `src/shared/har-request.ts` 统一 HAR 标准化与 `getContent`。
- 面板通过 `useInspectorRequests` + **`chrome.runtime.connect`（`api-inspector`）** 接收 Background 广播；内置控制台仅记录实时新请求，避免初次加载历史刷屏。

**Bug 修复**

- **`chrome.devtools.panels.create` 面板路径**：必须为相对**扩展根目录**的 `devtools/panel/panel.html`（原为 `panel/panel.html` 会导致「该文件可能已被移至别处、修改或删除」）。
- **构建产物**：`postbuild` 不再用内联占位覆盖 `devtools.js`，改为使用 Vite 构建的 DevTools 脚本（含监听逻辑）。

**构建与版本**

- `vite` 增加 `BUILD_TARGET=devtools`；`npm run build` 链中插入该步。
- `postbuild.js` 每次执行将根目录与 `dist` 的 **`manifest.json` 的 patch 版本 +1**（便于换包重载）；构建前保证 `dist` 目录存在。

---

### v1.0.1 - 自动控制台输出 + 构建修复

**功能优化：**
- 每个捕获的请求自动输出到浏览器 Console，无需手动点击
- 内置控制台面板默认展开，自动记录所有请求
- 详情面板 "Log to Console" 按钮保留，可用于手动重新输出

**Bug 修复：**
- 修复 LOG_TO_CONSOLE 消息缺少 tabId 导致无法转发到页面 Console 的问题
- 修复 DevTools 面板和 Popup 使用 ES Module 格式加载失败的问题，全部改为 IIFE 自包含格式
- 修复 Service Worker 依赖外部 chunk 文件导致加载失败的问题
- 修复 HTML 中 CSS 外部引用路径不正确的问题，改为内联到 `<style>` 标签

**构建系统重构：**
- 将构建从单步改为多步独立构建 + 后处理脚本
- 新增 `scripts/postbuild.js` 构建后处理脚本
- 所有 JS 产物统一为 IIFE 格式，无外部依赖
- CSS 内联到 HTML，消除路径引用问题
- manifest.json 中 service-worker 移除 `type: module`
