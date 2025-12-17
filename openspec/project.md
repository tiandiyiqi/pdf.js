# Project Context

## Purpose

本仓库基于 Mozilla 的 PDF.js：一个使用 Web 标准（HTML5/JS/CSS）实现的 PDF 解析与渲染平台，提供通用的 PDF 查看器（viewer）与可复用的渲染/解析库能力。

本项目在上游基础上包含与“印前/分色/专色/颜色过滤”等相关的定制与修复（例如颜色过滤、专色信息传递、注释/编辑器相关改造等）。

## Tech Stack

- **语言/运行时**：JavaScript（ESM，`"type": "module"`），部分 TypeScript（见 `tsconfig.json`，主要用于类型/校验）
- **构建/任务**：Gulp（`gulpfile.mjs`），Webpack（用于打包构建产物）
- **代码规范**：ESLint（`eslint.config.mjs`），Prettier（`.prettierrc`）
- **测试**：Jasmine（单元/集成），Puppeteer（浏览器端/回归测试），大量测试资源在 `test/`
- **平台要求**：Node.js `>=20.16.0 || >=22.3.0`（见 `package.json#engines`）

## Project Conventions

### Code Style

- **格式化**：以 Prettier 为准（`.prettierrc`）。在提交前优先跑格式化/自动修复，避免纯格式噪音混入功能提交。
- **ESM 优先**：代码以 ESM 方式组织（`import/export`），避免引入 CommonJS 写法。
- **命名习惯**：文件/目录使用小写与下划线或既有约定；新增模块尽量与相邻目录风格一致（如 `src/display/*`、`src/core/*`、`web/*`）。
- **修改原则**：优先最小改动、保持与上游 PDF.js 代码风格一致；涉及大块重构需先走 OpenSpec proposal。

### Architecture Patterns

- **分层**：
  - `src/core/`：PDF 解析与核心数据结构/算法
  - `src/display/`：渲染与显示层（Canvas/SVG/Worker 交互、annotation/编辑器等）
  - `web/`：通用 Viewer 与 UI 逻辑
  - `web_overprint/`：与叠印/印前相关的 viewer 变体（如存在并使用）
  - `test/`：测试框架、回归用 PDF/资源、自动化脚本
- **编辑器/注释体系**：注释与编辑器逻辑集中在 `src/display/editor/`，与渲染/层管理（如 `DrawLayer`）协同。
- **兼容性**：存在 modern 与 legacy 构建目标（例如 `generic` 与 `generic-legacy`），改动需注意不同构建路径的兼容。

### Testing Strategy

- **单元/集成**：优先补充或更新 `test/` 下对应测试；修改核心解析/渲染逻辑时，至少确保相关测试不回退。
- **浏览器回归**：涉及 viewer/交互/渲染表现的改动，尽量覆盖到 Puppeteer/浏览器侧测试或提供可复现实例（如新增/更新 `test_*.html`/脚本）。
- **手工验证**：对渲染与颜色相关改动，通常需要用代表性 PDF 进行人工目视对比（含专色/分色/叠印等用例）。

### Git Workflow

- **分支策略**：在功能/修复分支上工作（feature/fix），避免直接在主分支堆叠未验证改动；变更较大时配合 OpenSpec change 目录追踪。
- **提交粒度**：一次提交聚焦一个目的（修复/重构/提案文档），避免混杂无关格式化。
- **消息风格**：简洁描述“为什么 + 做了什么”，必要时带上影响面（如 `display/editor:`、`web:` 等前缀可选，遵循仓库现有习惯）。

## Domain Context

- **核心领域**：PDF 解析/渲染（文字、图像、颜色空间、透明度/叠印、可选内容层 OCG 等）。
- **印前相关**：专色（Spot Color）、分色预览、颜色过滤/转换链路、油墨/图层信息传递等，常涉及 `src/display/` 的渲染管线与 viewer 展示逻辑。
- **注释/编辑器**：注释渲染与编辑器交互在 `src/display/editor/` 与 `web/` 中协作完成；改动需关注序列化、撤销重做、坐标变换与缩放行为一致性。

## Important Constraints

- **Node 版本约束**：必须满足 `package.json#engines`，否则构建/测试可能失败。
- **上游对齐**：尽量保持与 Mozilla/pdf.js 结构与编码风格一致，便于后续合并与维护；大改动优先通过 OpenSpec 提案明确范围与破坏性影响。
- **性能敏感**：渲染与交互路径（viewer、draw/annotation layer、颜色过滤）对性能高度敏感，避免无必要的 DOM 膨胀、频繁重排或过度拷贝大像素数据。
- **测试资源巨大**：`test/` 目录资源多，改动需尽量通过现有测试框架验证，避免引入脆弱的用例依赖。

## External Dependencies

- **浏览器运行环境**：依赖现代浏览器能力（并提供 legacy 构建以兼容旧环境）。
- **构建/工具链依赖**：Gulp、Webpack、Babel、ESLint、Prettier、Jasmine、Puppeteer（均在 `package.json` 中定义）。
- **上游项目**：Mozilla PDF.js（本仓库基于其演进；涉及 API/行为差异时需在 OpenSpec 记录）。
