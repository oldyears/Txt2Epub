# Chapter Review Implementation Plan

**Goal:** 以用户确认的预览流程，为异常长章节提供通用 DeepSeek 分章复查。

**Architecture:** 规则流水线保留合并前 Book 和行映射；纯函数负责异常检测、分块与建议校验；共享 DeepSeek JSON 请求；独立对话框负责选择、进度、预览和确认；状态转换负责应用并保留编辑。

**Tech Stack:** TypeScript、现有 DOM UI、Vitest、Playwright。

## Task 1: 异常检测与验证

- 新建 `src/core/chapterReview.ts`、`tests/core/chapterReview.test.ts`。
- 先写失败测试：长前言、相对异常长章、分章不足、正常章节、分块覆盖与重叠、无效或伪造行号、改写标题、冲突建议。
- 实现 `findReviewTargets(book)`、`buildReviewBatches(book, targets)`、`validateReviewSuggestions(payload, batch)`、`mergeReviewSuggestions(items)`；每函数最多 20 行、最多 2 参数。
- 运行 `npm test -- tests/core/chapterReview.test.ts`。

## Task 2: DeepSeek 复查

- 将现有 JSON 请求抽为 `src/llm/client.ts`，保留原去和谐行为测试。
- 新建 `src/llm/chapterReview.ts` 和单测：串行分块、取消、进度、空/截断响应、HTTP 失败、部分结果保留。
- API Key 仅使用浏览器设置，不进入源码或构建。

## Task 3: 流水线与状态

- 移除尚未发布的合集自动晋升规则，保留无编号标题作为 LLM 可见的原始行。
- 在 `src/core/splitter.ts` 返回合并行的起点映射；`src/core/pipeline.ts` 暴露合并前 Book 及映射。
- 在 `src/ui/state.ts` 保存复查基础文本，支持建议批量应用和失效检查，并通过行文本/绝对文本位置迁移和谐词替换。
- 测试段落合并前标题可定位、手动目录编辑、已填替换和元信息保留。

## Task 4: 选择与预览 UI

- 目录面板添加复查按钮；新建章节复查对话框及配套样式，沿用现有纸色/绿色界面。
- 选择异常章节 → 明示发送正文 → 开始/取消 → 查看建议上下文 → 选择并应用。
- 用户确认前不修改当前目录；API 失败不影响导出；旧结果不能用于新文件。

## Task 5: 验证与交付

- 完整单测、类型检查、构建、桌面/手机浏览器、PWA 离线测试。
- 浏览器 mock DeepSeek 验证真实交互；使用私人文件仅做本地结构定位，不上传内容到测试服务器。
- 独立代码审查通过后提交到 GitHub，等待 Pages 成功并验证线上新入口与确认流程。

## 本地验收结果

- 249 个单元测试通过；10 个桌面/手机浏览器用例与 1 个生产 PWA 离线用例通过。
- 类型检查、生产构建、源码函数约束及 `git diff --check` 通过。
- 一次真实 DeepSeek 中性样例复查返回 2 处有效原文锚点建议；未发送私人小说原文。
- 私人文件本地检查发现 14 个待复查区段，第一篇标题位于可复查的原始行中；模拟确认对应标题后，分篇成功且完整文本流不变。
- 独立规格及质量审查通过。发现的跨行词典还原风险通过应用前文本流一致性校验阻止；取消、过期结果和失败保留现有目录。
- 未发布的合集目录自动晋升规则已移除。书名元信息仅读取正文开始前的连续元信息行，避免误吞篇名。
