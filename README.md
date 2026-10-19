# Txt2Epub

## 这是什么

一个纯前端的网页小工具（PWA），把网文 txt 或目录混乱的 epub 整理成干净的 EPUB3，适合导入微信读书。所有处理都在浏览器里完成，没有后端。

## 功能

- **txt → epub**：自动识别编码（UTF-8 / GBK 等）、书名作者、卷与章，生成带目录的 EPUB3。
- **修复 epub 目录**：重新识别卷章结构，可在预览中把任意一行设为卷 / 章 / 正文。
- **去广告**：清理“本章未完，请点击下一页继续阅读”之类的站点广告（规则可在设置中编辑）和开头的重复目录，合并被错误断开的段落。
- **去和谐**：
  - 谐音词典：自动还原拼音、谐音替字（如 jing察 → 警察），词典可在设置中编辑；
  - 被屏蔽的 `***`、`□□` 会列在“和谐词”面板，可手动填写；
  - 可选 DeepSeek：用你自己的 API Key 根据上下文推断被屏蔽的词。

## 本地运行

需要 Node.js 22.12 或更高版本。

```bash
npm i
npm run dev      # 本地开发服务器
npm test         # 单元测试（Vitest）
npm run e2e      # 端到端冒烟测试（Playwright，使用本机已安装的 Chrome）
npm run e2e:pwa  # 生产构建：检查安装条件、子目录部署和离线导入/导出
npm run build    # 构建到 dist/
```

## 部署到 GitHub Pages

1. 在仓库 Settings → Pages 的 Source 中选择 **GitHub Actions**；
2. push 到 `main` 分支，`.github/workflows/pages.yml` 会运行测试、构建并发布。

也可以在 Actions 页面手动触发该工作流。

## 手机使用

用手机浏览器打开部署后的网址，选择“添加到主屏幕”，之后就能像 App 一样离线打开。转换好的 epub 下载后，用微信读书导入即可。

## DeepSeek 说明

- API Key 只保存在本机浏览器中，请求由浏览器直接发给 DeepSeek，不经过任何第三方服务器；
- 默认模型为 `deepseek-flash`，可在设置中修改；
- 涉政等敏感词可能被模型拒答，这类位置需要在“和谐词”面板手动填写。

## 隐私

文件转换在本机浏览器中完成。只有主动使用 DeepSeek 推断时，待还原位置及其附近正文才会发送给 DeepSeek。
