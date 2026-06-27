# Step 8 备份功能阶段验收清单

## 当前本地最新提交

- **Commit**: `4e56616 feat: add backup download action in settings`

## 当前 Git 状态

- **分支**: `main`，领先 `origin/main` **7 个提交**（`[ahead 7]`）
- **原因**: GitHub 因网络问题暂未同步
- **工作区**: 干净（`git status --short` 无输出）

## 当前未 push 的 7 个提交

| # | Commit | 说明 |
|---|--------|------|
| 1 | `b291b87` | chore: ignore inventory backup files |
| 2 | `ccce7df` | feat: add manual database backup API |
| 3 | `7a75242` | feat: connect settings backup action |
| 4 | `c51eb69` | feat: add backup file listing API |
| 5 | `c44908e` | feat: show backup files in settings |
| 6 | `1c47755` | feat: add backup file download API |
| 7 | `4e56616` | feat: add backup download action in settings |

---

## 已完成能力

### 1. 备份文件 Git 隔离
- `.gitignore` 新增 `apps/api/backups/`、`*.backup.db`、`*.backup.sqlite`、`inventory-backup-*.db`
- 所有备份文件与主数据库文件均被 Git 忽略

### 2. 后端手动备份
- `POST /api/backups/manual`
- 仅 admin 可调用，viewer 返回 403
- 执行数据库完整性校验（`PRAGMA integrity_check`）
- 生成 `inventory-backup-YYYYMMDD-HHMMSS.db` 备份文件
- 返回文件名、路径、大小、时间戳、校验结果

### 3. 前端立即备份按钮
- Settings 页面"数据备份"区域
- admin 可见/可操作"立即备份"按钮
- 备份中显示 spinner + "备份中..."
- 备份成功显示文件名、大小、时间、校验状态
- 备份失败显示红色错误提示
- viewer 按钮置灰 + 提示"仅管理员可操作"

### 4. 后端备份列表
- `GET /api/backups`
- 仅 admin 可调用，viewer 返回 403
- 扫描 `apps/api/backups/` 目录中 `inventory-backup-*.db` 文件
- 按创建时间倒序排列
- 返回文件列表及每条的大小、时间、校验结果

### 5. 前端备份记录列表
- Settings 页面"备份记录"区域
- admin 自动加载备份文件列表
- 每条记录显示：文件名（等宽字体）、大小、时间、校验标签（通过/异常）
- 列表可滚动，最大高度 192px
- 加载中显示"正在加载备份记录..."
- 加载失败显示红色错误提示
- 空列表显示"暂无备份记录"
- viewer 显示"仅管理员可查看备份记录"

### 6. 后端备份下载
- `GET /api/backups/{filename}/download`
- 仅 admin 可调用，viewer 返回 403
- 文件名格式与路径穿越防护
- 只允许下载 `inventory-backup-*.db` 文件
- 返回文件流（`FileResponse`）

### 7. 前端备份下载按钮
- 备份记录每条显示"下载"按钮
- 点击后通过 Blob 触发浏览器下载
- 下载文件名与备份文件名一致
- 下载中按钮显示"下载中..."并禁用，防止重复点击
- 下载失败显示红色错误提示
- 文件保存到系统下载目录，不在项目目录内
- viewer 不展示备份记录区域，无下载入口

---

## 接口清单

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/backups/manual` | 手动触发数据库备份 | admin |
| GET | `/api/backups` | 获取备份文件列表 | admin |
| GET | `/api/backups/{filename}/download` | 下载指定备份文件 | admin |

---

## 权限边界

| 操作 | admin | viewer |
|------|-------|--------|
| 手动备份 | ✅ 可操作 | ❌ 按钮置灰 + 提示 |
| 查看备份列表 | ✅ 自动加载 | ❌ 仅显示无权限提示 |
| 下载备份文件 | ✅ 可下载 | ❌ 无入口、不可见 |

- **后端防线**: 所有备份接口均通过 `require_admin` 依赖注入做权限控制，viewer 请求返回 403
- **前端体验**: 前端基于 `canWrite`（来自 `usePermission` hook）做按钮禁用和 UI 隐藏，作为体验补充，不作为安全边界

---

## 人工验收结果

| 验收项 | 结果 | 说明 |
|--------|------|------|
| admin 点击"立即备份"成功 | ✅ 通过 | 按钮进入 loading 状态，完成后显示备份详情 |
| 备份成功显示详情 | ✅ 通过 | 文件名、大小、时间、校验"通过"均正确显示 |
| 备份列表按时间倒序 | ✅ 通过 | 最新备份排在最前 |
| 下载按钮可下载 .db 文件 | ✅ 通过 | 浏览器弹出下载，文件名与备份文件名一致 |
| 下载文件不在项目目录 | ✅ 通过 | 文件保存到系统下载目录 |
| viewer 无备份列表 | ✅ 通过 | 显示"仅管理员可查看备份记录" |
| viewer 无下载入口 | ✅ 通过 | 备份记录区域完全不展示 |
| viewer 直接调用 API 被拒 | ✅ 通过 | 后端返回 403 |

---

## 数据安全结果

| 检查项 | 结果 |
|--------|------|
| `apps/api/inventory.db` 未进入 git status | ✅ |
| `apps/api/backups/` 未进入 git status | ✅ |
| 下载到本地下载目录的 .db 文件不在项目目录 | ✅ |
| `.gitignore` 已覆盖备份文件模式 | ✅ |

---

## 当前不做的功能

以下功能本轮明确不做，后续需单独设计：

| 功能 | 说明 |
|------|------|
| 恢复 | 直接覆盖真实数据库，风险极高 |
| 删除备份 | 保留所有历史备份，不提供删除入口 |
| 自动定时备份 | 当前仅支持手动触发 |
| 远程云备份 | 无远程存储对接 |

---

## 恢复功能风险说明

恢复功能为高风险操作，后续实施时必须遵循以下原则：

1. **恢复会直接覆盖真实数据库**，操作后不可撤销
2. **至少需要二次确认**（如输入"CONFIRM"或管理员密码）
3. **恢复前必须自动创建当前数据库的备份**，确保可回退
4. **停服或锁写策略**：恢复期间禁止其他写操作，防止数据不一致
5. **人工回滚流程**：恢复后如果数据异常，必须有明确的回退路径
6. 建议在非生产环境先行验证，确认恢复后数据完整性

---

## 下一阶段建议

1. **优先做部署前备份验收** — 确认生产环境备份文件可正常生成、可下载
2. **或做数据导入/导出与迁移方案** — 为旧系统数据迁移做准备
3. **不建议马上做恢复功能** — 等备份流程稳定运行一段时间后再设计恢复

---

## 相关文件索引

| 文件 | 说明 |
|------|------|
| `.gitignore` | 备份文件与主数据库 Git 隔离配置 |
| `apps/api/routers/backups.py` | 后端备份 API 路由（手动备份、列表、下载） |
| `apps/api/main.py` | FastAPI 应用入口，注册 backups router |
| `src/services/backupService.js` | 前端备份服务层（createManualBackup、getBackups、downloadBackup） |
| `src/pages/Settings.jsx` | Settings 页面（备份按钮、备份列表、下载按钮） |
| `docs/Step8-备份与数据安全底座方案.md` | Step 8 备份功能设计方案 |
