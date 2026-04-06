# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project Overview

本项目是“库存自动化管理系统 V2”，是一个独立于现有旧系统之外的全新版本。

目标：
- 不影响当前已上线使用的旧库存系统
- 先完成新版前端界面与后台 UI 重设计
- 提升系统界面专业度，减少传统后台土味感和 AI 拼装感
- 后续再逐步接入真实业务逻辑和数据

当前阶段：
- 第六阶段：开始接入真实数据底座
- 目标不是 demo，而是逐步做成真实可扩展的企业级库存自动化管理系统
- 优先保证真实业务闭环、数据一致性、页面可运行、可验证

历史阶段参考：
- 第一阶段：前端页面和交互框架，使用 mock 数据演示
- 暂不接入真实数据库、真实登录鉴权和复杂业务逻辑（第一阶段范围）

# Tech Stack

- React
- Vite
- Tailwind CSS
- React Router DOM (路由)
- Recharts (图表)

# Communication Protocol

每轮开发任务输出必须包含以下部分：

1. **本轮目标** - 简要说明本回合要完成的任务
2. **修改文件** - 列出所有修改的文件路径
3. **改动摘要** - 描述每个文件的改动内容和原因
4. **测试结果** - 说明自检结果或测试情况
5. **下一步** - 建议下一步操作或需要验证的内容
6. **开发记录简版** - 简洁总结本回合工作

# Common Commands

开发、构建、代码检查和预览命令：

```bash
# 安装依赖
npm install

# 启动开发服务器 (http://localhost:5173)
npm run dev

# 构建生产版本
npm run build

# 代码检查
npm run lint

# 预览生产构建 (需先运行 build)
npm run preview
```

注意：该项目使用 Vite 作为构建工具，ESLint 作为代码检查工具。目前没有配置单元测试或集成测试。

# High-level Architecture

## 项目结构
```
src/
├── assets/           # 静态资源（图片、图标）
├── components/       # 可复用组件
│   ├── common/       # 通用组件（如返回顶部按钮）
│   ├── dashboard/    # 仪表盘专用图表组件
│   └── layout/       # 布局组件（Header、Sidebar）
├── constants/        # 常量数据（mockData.js）
├── layouts/          # 页面布局（MainLayout）
├── pages/           # 页面组件（对应路由）
├── services/        # 数据服务层
├── utils/           # 工具函数（筛选、导出、历史记录等）
├── App.jsx          # 根组件，定义路由
├── App.css          # 应用样式
├── main.jsx         # 应用入口
└── index.css        # 全局样式与 Tailwind 主题配置
```

## 路由架构
- 使用 React Router DOM v7 进行客户端路由
- 路由定义在 `src/App.jsx` 中
- 登录页 (`/login`) 独立路由，不包含主布局
- 主布局 (`MainLayout`) 包装所有后台页面，包含 Header 和 Sidebar
- 默认路由重定向到 `/dashboard`
- 404 路由重定向到 `/login`

## 数据流与服务层
- **Mock 数据**：`src/constants/mockData.js` 包含仪表盘统计、产品、交易记录、预警等数据
- **本地存储**：`src/services/productService.js` 提供基于 localStorage 的数据持久化，支持产品、交易记录、审计日志的 CRUD 操作
- **统一数据服务**：`src/services/dataService.js` 提供抽象层，支持 mock 和 API 模式切换（当前默认 API 模式但会降级到 mock）
- **页面交互**：页面组件导入服务函数，通过 React state 管理数据，提供筛选、分页、表单操作

## 组件组织原则
- 页面 (`pages/`) 负责数据获取和用户交互
- 可复用 UI 组件 (`components/`) 保持无状态或最小状态
- 布局组件 (`layouts/`, `components/layout/`) 提供一致的结构
- 工具函数 (`utils/`) 封装业务逻辑，保持纯函数特性

## 样式系统
- Tailwind CSS v4 作为主要样式方案
- 主题配置在 `src/index.css` 中定义，使用 `@theme` 指令定制颜色、阴影、圆角等
- 采用蓝灰中性色调，符合企业后台风格
- 全局样式重置和滚动条定制
- 实用类 (`text-body`, `text-small`, `text-tiny`, 状态色类) 可在全站使用

# Project Rules

## 基础原则
1. 这是一个全新独立项目，不能影响旧系统。
2. 第一阶段只做前端页面，不做真实后端接入（历史参考）。
3. 暂时不做真实数据库、真实登录鉴权、权限系统、报表导出、备份恢复等复杂功能（历史参考）。
4. 页面开发优先使用 mock 数据。

## 开发流程
5. 一次只完成一个页面，不要一口气生成整个系统所有页面。
6. 先最小可行方案，再逐步增强。
7. 不做无意义重构。
8. 桌面端与移动端都要可读可用。
9. 接入真实数据时，优先保证旧功能不被破坏。

## 沟通规范
10. 每次改动后，都要明确说明（详见 Communication Protocol）：
   - 改了哪些文件
   - 为什么这样改  
   - 下一步我需要在 VS Code 终端执行什么命令
11. 如果发现需求需要调整，先解释原因，再改动。

# UI Style Rules

整体风格要求：
- 现代企业后台风格
- 简洁、专业、克制
- 少 AI 味
- 不要科技炫光风
- 不要蓝紫渐变大面积使用
- 不要过度卡片化
- 不要厚重阴影
- 不要为了“高级感”堆太多装饰

界面规范：
- 以蓝灰、中性色为主
- 强调清晰层级、留白、对齐和信息密度控制
- 登录页、仪表盘、产品页、出入库页、预警页都要保持统一设计语言
- 图标风格统一
- 按钮样式层级统一
- 表格、表单、卡片、侧边栏风格统一

# Page Scope (历史参考 - Phase 1)

第一阶段优先页面（已完成）：
1. 登录页
2. 仪表盘首页
3. 产品管理页
4. 出入库记录页
5. 低库存预警页

当前第六阶段扩展页面（逐步完善）：
- 用户管理页
- 审计日志页
- 设置页
- 其他业务页面

# Not In Scope (历史参考 - Phase 1)

第一阶段暂不做（部分已在后续阶段实现）：
- 真实数据库接入（第六阶段开始接入）
- 真实登录鉴权（后续阶段考虑）
- 用户权限系统（后续阶段考虑）
- Excel 导入导出（已有导出功能）
- 报表生成（已有基础功能）
- 自动备份恢复（后续阶段考虑）
- 多仓库支持（后续阶段考虑）

# Working Style

请按小步快跑方式协助开发：
- 先做结构
- 再做样式
- 再做页面细化
- 再做页面之间统一
- 最后再考虑交互完善

如果当前任务只是登录页，就不要提前扩展到其他所有页面。
优先保证当前页面完成度，而不是贪多。

# Detailed Rules

更详细的操作规则请参考 `.claude/rules/` 目录下的文件：

- **执行规则** (`.claude/rules/execution.md`) - 代码开发流程、技术决策原则
- **自检清单** (`.claude/rules/checklist.md`) - 开发完成后的检查项目
- **上下文管理** (`.claude/rules/context.md`) - 会话管理、文件读取优化

这些规则提供了更具体的操作指导，应与本文件中的高层原则结合使用。