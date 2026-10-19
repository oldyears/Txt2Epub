# Txt2Epub 设计文档

日期：2026-10-19

## 背景

1. txt 小说导入微信读书后目录解析混乱，需要转成规范 epub。
2. 现有 epub 小说同样存在目录识别错误、卷章层级混乱、正文排版脏的问题，并且有被平台和谐的词（`***`、`□□`、拼音、谐音）。

## 目标

- 多端可用：纯前端网页 + PWA，手机/iPad/电脑浏览器均可，支持添加到主屏幕、离线使用。
- 文件默认只在本地处理，不上传。
- 修复范围：目录识别错、卷/章层级乱、正文排版脏、和谐词还原。
- 不做：章节顺序修复/去重/缺章检测；epub 正文插图保留（仅保留封面）。

## 技术选型

Vite + TypeScript，不使用 UI 框架。依赖：JSZip（读写 epub）、vite-plugin-pwa（离线）、Vitest（单测）、Playwright（冒烟测试）。

## 处理流水线

```
txt / epub
  → ① Reader    txt：自动识别 GBK/UTF-8；epub：按 spine 顺序抽出正文行，丢弃原目录，提取封面和元数据
  → ② Cleaner   去广告水印、合并断行段落、统一缩进与空行
  → ③ Splitter  正则规则识别 卷/章/番外/序章，结合长度、句末标点校验，避免正文句子被误判；
                 删除「后面紧跟同级或更高级标题」的空标题（即 txt 开头的目录列表）
  → ④ Unharmonizer  词典替换；未能还原的位置输出为待处理清单
  → ⑤ UI 预览   目录树（行级切换：卷/章/正文）+ 和谐清单（手填 / LLM 推断）
  → ⑥ Writer    EPUB3，同时生成 nav.xhtml 与 toc.ncx，兼容微信读书和 Apple Books
```

## 数据模型

```ts
type Line = { text: string; kind: 'volume' | 'chapter' | 'body' };
type Book = { title: string; author: string; cover?: Blob; lines: Line[] };
type CensorHit = { lineIndex: number; start: number; end: number; raw: string; replacement?: string };
```

目录树由 `lines` 中 `kind !== 'body'` 的行派生，用户在 UI 中的修改只改变 `kind`，保证单一数据源。

## 去和谐

- 词典条目：`{ from: string; to: string }`，按字面、忽略大小写替换。内置默认词典，用户在设置中以「原文=替换」每行一条编辑（复制粘贴即可导入导出），存于 localStorage。
- 检测器识别 `*{2,}`、`□+`、`口口+`、`×+` 等占位符，产出 `CensorHit`。
- LLM 推断（可选）：用户填入 DeepSeek API Key（仅存本地），浏览器直接调用 `https://api.deepseek.com/chat/completions`（已验证 CORS 放行），默认模型 `deepseek-flash`，`response_format: json_object`。命中位置连同前后行上下文按 40 条一批发送，结果仅作为建议填入输入框，需用户确认。
- 已知风险：DeepSeek 自身有内容审核，涉政类词可能拒答或返回空；此时保留未还原状态，由用户手填。

## 规则配置

章节识别正则可在 UI 中编辑，存 localStorage。

## 错误处理

- 编码识别失败：允许用户手动选择编码重新读取。
- epub 结构损坏：显示明确错误信息，不抛未处理异常。
- LLM 调用失败：保留未还原状态，提示原因，不影响导出。

## 测试

①②③④⑥ 均为纯函数，Vitest 单测覆盖；UI 用 Playwright 做一次导入→导出冒烟测试。

## 部署

GitHub Pages 静态托管。
