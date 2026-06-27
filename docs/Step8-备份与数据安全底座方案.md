# Step 8 备份与数据安全底座方案

## 当前最新稳定节点

- **Commit**: `23eef87 docs: add step 7 account security checklist`
- **分支**: `main`
- **状态**: 与 `origin/main` 同步，工作区干净

---

## 一、本轮审计范围

| 审计项 | 方法 | 结果 |
|---|---|---|
| 项目中是否有 backup/restore 相关代码 | grep 搜索 `backup\|备份\|restore\|恢复\|dump` | 见第二节 |
| 后端是否有备份 API 端点 | 检查 `apps/api/routers/` 目录 | 无 |
| Settings 页面是否有备份入口 | 阅读 `src/pages/Settings.jsx` | 有占位按钮，无实际功能 |
| `.gitignore` 是否覆盖 db 和备份文件 | 阅读 `.gitignore` | db 已覆盖，备份未覆盖 |
| `apps/api/inventory.db` 是否存在 | 目录列表 | 存在，45 KB |
| 现有文档是否提及备份能力 | 搜索 `docs/` 目录 | 仅 Step7 提到需要做 |
| 旧系统备份能力 | 不在本项目范围内 | 未审计 |

---

## 二、当前项目备份能力现状

### 2.1 后端（apps/api）

**结论：无任何备份功能。**

- 路由文件共 6 个：`products.py`, `transactions.py`, `audit_logs.py`, `dashboard.py`, `users.py`, `auth.py`
- 无 `backup.py` 路由、无 backup/dump/restore API 端点
- `database.py` 仅包含 ORM 模型定义和表创建/迁移逻辑，无数据导出能力
- `main.py` 仅注册了业务路由，无备份相关端点
- `seed.py` 是种子数据导入脚本，不是备份工具

### 2.2 前端（src）

**结论：仅有 UI 占位，无实际功能。**

- `src/pages/Settings.jsx` 第 290-300 行有一个"数据备份"区域，包含"立即备份"按钮
- 该按钮无任何 `onClick` 事件处理函数
- 点击后不会触发任何 API 调用或操作
- 这是 UI 占位，不是功能实现

### 2.3 数据导出功能

**结论：CSV 导出 ≠ 数据库备份。**

- `src/utils/exportHelpers.js` 提供了三个 CSV 导出函数：
  - `exportTransactionsToCSV` — 交易记录 CSV 导出
  - `exportAuditLogsToCSV` — 审计日志 CSV 导出
  - `exportProductsToCSV` — 产品列表 CSV 导出
- 这些功能导出的是**前端筛选后的视图数据**，不是数据库完整快照
- CSV 导出的目标是**数据分发/报表**，不是**灾备恢复**
- **不可用于数据库恢复**

### 2.4 数据重置功能

**结论：resetStorageData 仅作用于 localStorage，不接触 inventory.db。**

- `src/services/productService.js` 第 582 行的 `resetStorageData()` 函数
- 仅在 mock 模式下清空浏览器 localStorage
- 不影响 `apps/api/inventory.db`
- 在 API 模式下（当前真实数据模式）该功能不可用

### 2.5 审计总评

| 能力 | 状态 | 说明 |
|---|---|---|
| 数据库备份（完整快照） | ❌ 不存在 | 无任何后端备份逻辑 |
| 数据库恢复 | ❌ 不存在 | 无 restore 功能 |
| 定时自动备份 | ❌ 不存在 | 无 cron/调度机制 |
| 备份文件管理（列表/下载/删除） | ❌ 不存在 | 无备份文件存储和浏览 |
| 手动触发备份（UI） | ⚠️ 仅占位 | Settings 页面有按钮，无功能 |
| CSV 数据导出 | ✅ 已实现 | 仅视图数据导出，非数据库备份 |
| 重置为初始数据 | ⚠️ 仅 mock | 不影响 inventory.db |
| `.gitignore` 覆盖 db 文件 | ✅ 已配置 | `apps/api/inventory.db` 已忽略 |
| `.gitignore` 覆盖备份文件 | ❌ 未配置 | 见第十一节 |

---

## 三、当前数据库与数据安全边界

### 3.1 数据库文件

- **路径**: `apps/api/inventory.db`
- **类型**: SQLite 3 单文件数据库
- **大小**: 约 45 KB（当前）
- **引擎**: SQLAlchemy ORM
- **表结构**（4 张业务表）：

| 表名 | 用途 | 关键字段 |
|---|---|---|
| `products` | 产品主数据 | id, sku, name, category, current_stock, min_stock |
| `transactions` | 出入库交易记录 | id, product_id, type, quantity, operator, status |
| `audit_logs` | 操作审计日志 | id, action_type, product_name, operator, details |
| `users` | 用户账户 | id, username, password_hash, role, is_active |

### 3.2 数据安全边界（不可逾越）

```
╔══════════════════════════════════════════════════════════╗
║  禁止操作                                              ║
╠══════════════════════════════════════════════════════════╣
║  ❌ 禁止删除 inventory.db                              ║
║  ❌ 禁止重置 inventory.db（DROP TABLE / DELETE ALL）    ║
║  ❌ 禁止将 inventory.db 提交到 Git                     ║
║  ❌ 禁止将备份文件提交到 Git                           ║
║  ❌ 禁止在未备份的情况下执行数据库结构迁移             ║
║  ❌ 禁止将 inventory.db 复制/移动到非安全位置          ║
╚══════════════════════════════════════════════════════════╝
```

- `inventory.db` 是**生产数据库**，即使当前数据量小，也必须按生产标准对待
- `.gitignore` 已配置 `apps/api/inventory.db`，确认不会被提交

---

## 四、最小可用备份方案设计

### 4.1 设计原则

1. **手动触发优先** — 先不做自动定时备份，降低首次实现复杂度
2. **单文件复制** — SQLite 是单文件数据库，备份 = 安全复制该文件
3. **备份前检查** — 确保数据库完整性后再备份
4. **备份后校验** — 确保备份文件可读、大小合理
5. **不可覆盖原文件** — 备份操作永远不写入 inventory.db
6. **Git 隔离** — 备份文件目录不进入版本控制

### 4.2 手动触发备份流程

```
用户点击"立即备份"（Settings 页面）
        │
        ▼
┌─────────────────────┐
│ 1. 备份前检查       │
│ - API 服务是否在线   │
│ - inventory.db 存在  │
│ - 数据库可读         │
│ - 磁盘空间充足       │
└──────┬──────────────┘
       │ 通过
       ▼
┌─────────────────────┐
│ 2. 执行备份         │
│ - 后端读取 db 文件   │
│ - 写入备份目录       │
│ - 按命名规则命名     │
│ - 记录元数据         │
└──────┬──────────────┘
       │ 成功
       ▼
┌─────────────────────┐
│ 3. 备份后校验       │
│ - 文件存在且非空     │
│ - SQLite 文件头校验  │
│ - 大小合理           │
│ - 记录备份日志       │
└──────┬──────────────┘
       │ 通过
       ▼
┌─────────────────────┐
│ 4. 反馈用户         │
│ - 备份文件名         │
│ - 备份时间           │
│ - 文件大小           │
│ - 成功/失败状态      │
└─────────────────────┘
```

### 4.3 后端 API 设计（概要，不实现）

```
POST /api/system/backup
  → 触发手动备份
  → 返回: { success, filename, size, timestamp, checksum }

GET /api/system/backups
  → 列出所有备份文件
  → 返回: [{ filename, size, timestamp, checksum }]

GET /api/system/backups/{filename}/download
  → 下载指定备份文件
  → 返回: FileResponse

DELETE /api/system/backups/{filename}
  → 删除指定备份文件（需要二次确认）
  → 返回: { success }
```

### 4.4 实现优先级

| 优先级 | 接口 | 说明 |
|---|---|---|
| P0 | POST `/api/system/backup` | 最小可用：手动触发备份 |
| P1 | GET `/api/system/backups` | 备份文件列表 |
| P2 | GET `/api/system/backups/{filename}/download` | 备份文件下载 |
| P3 | DELETE `/api/system/backups/{filename}` | 备份清理 |

---

## 五、备份文件命名规则

### 规则

```
inventory-backup-{YYYY-MM-DD}-{HHmmss}.db
```

### 示例

```
inventory-backup-2026-06-27-143052.db
inventory-backup-2026-06-27-180015.db
inventory-backup-2026-06-28-090000.db
```

### 说明

- 前缀 `inventory-backup-` 明确标识为备份文件
- 时间戳格式 `YYYY-MM-DD-HHmmss` 便于排序和人工识别
- 扩展名 `.db` 与原始文件一致，便于用 SQLite 工具直接打开验证
- 按文件名排序即可得到时间顺序

### 元数据文件（可选）

每个备份可附带一个同名 `.json` 元数据文件：

```
inventory-backup-2026-06-27-143052.json
```

内容示例：
```json
{
  "filename": "inventory-backup-2026-06-27-143052.db",
  "timestamp": "2026-06-27T14:30:52+08:00",
  "size_bytes": 45056,
  "sha256": "abc123...",
  "db_version": "sqlite 3.x",
  "table_count": 4,
  "trigger": "manual",
  "operator": "admin"
}
```

---

## 六、备份保存目录建议

### 推荐目录

```
apps/api/backups/
```

### 目录结构示例

```
apps/api/
├── backups/                                   ← 备份根目录
│   ├── .gitkeep                               ← 保持目录在 git 中
│   ├── inventory-backup-2026-06-27-143052.db   ← 备份文件（gitignore）
│   ├── inventory-backup-2026-06-27-143052.json ← 元数据（gitignore）
│   └── inventory-backup-2026-06-28-090000.db
├── inventory.db                                ← 生产数据库（gitignore）
├── database.py
├── main.py
└── ...
```

### 目录规则

- 备份文件统一存放在 `apps/api/backups/` 目录
- 该目录通过 `.gitignore` 忽略 `*.db` 和 `*.json` 备份文件
- 保留 `.gitkeep` 确保空目录在 git 中存在
- 不在项目根目录或 `src/` 下存放备份文件
- 备份目录路径在后端代码中可配置（环境变量 `BACKUP_DIR`，默认 `backups/`）

---

## 七、备份前检查清单

每次执行备份前，后端必须完成以下检查：

| # | 检查项 | 方法 | 失败处理 |
|---|---|---|---|
| 1 | `inventory.db` 文件存在 | `os.path.exists(db_path)` | 返回错误：数据库文件不存在 |
| 2 | 数据库文件可读 | `os.access(db_path, os.R_OK)` | 返回错误：数据库文件不可读 |
| 3 | 备份目录存在 | `os.path.isdir(backup_dir)` | 自动创建目录 |
| 4 | 备份目录可写 | `os.access(backup_dir, os.W_OK)` | 返回错误：备份目录不可写 |
| 5 | 磁盘空间充足 | `shutil.disk_usage(backup_dir)` | 返回警告：磁盘空间不足 |
| 6 | 数据库无其他进程写入 | 尝试获取 SQLite 共享锁 | 等待或返回错误 |
| 7 | SQLite 完整性检查 | `PRAGMA integrity_check` | 返回错误：数据库可能损坏 |

### 最低要求的检查（最小可用版）

1. `inventory.db` 存在且可读
2. 备份目录存在且可写
3. `PRAGMA integrity_check` 通过

---

## 八、备份后校验清单

备份文件写入完成后，后端必须完成以下校验：

| # | 校验项 | 方法 | 失败处理 |
|---|---|---|---|
| 1 | 备份文件存在 | `os.path.exists(backup_path)` | 返回错误：备份写入失败 |
| 2 | 备份文件非空 | `os.path.getsize(backup_path) > 0` | 返回错误：备份文件为空 |
| 3 | 文件大小合理 | 与原文件大小比较（±10% 容差） | 返回警告：备份大小异常 |
| 4 | SQLite 文件头 | 读取文件头 16 字节 = `SQLite format 3\000` | 返回错误：备份文件格式异常 |
| 5 | 备份可打开 | `sqlite3.connect(backup_path)` 成功 | 返回错误：备份文件无法打开 |
| 6 | 备份完整性 | 对备份执行 `PRAGMA integrity_check` | 返回错误：备份数据损坏 |
| 7 | 表数量一致 | 备份中的表数量 ≥ 原数据库表数量 | 返回警告：表数量不一致 |

### 最低要求的校验（最小可用版）

1. 备份文件存在且 > 0 字节
2. 备份文件头 = `SQLite format 3\000`
3. 备份可被 `sqlite3.connect()` 打开

---

## 九、恢复功能设计原则（仅设计，本轮不实现）

### 9.1 为什么本轮不实现恢复功能

- **恢复是破坏性操作** — 会覆盖当前 `inventory.db`，一旦出错数据不可逆
- **需要多层安全确认** — 不仅仅是"确认"按钮，需要操作者二次确认、备份文件校验、恢复前自动备份
- **需要恢复演练验证** — 不能等到灾难发生时才第一次使用恢复功能
- **与业务连续性耦合** — 恢复期间系统不可用，需要停机窗口、用户通知等

### 9.2 恢复功能设计原则（供后续参考）

1. **恢复前强制自动备份** — 恢复操作前，先将当前 `inventory.db` 备份（"恢复前快照"）
2. **二次确认机制** — 需要输入确认短语（如"确认恢复数据"）而非仅点击按钮
3. **备份文件校验** — 恢复前校验目标备份文件完整性（PRAGMA integrity_check）
4. **操作者记录** — 记录谁在什么时间执行了恢复操作
5. **恢复后自动重启服务** — 确保所有数据库连接重新建立
6. **恢复日志持久化** — 恢复操作写入独立的恢复日志文件（不受数据库恢复影响）
7. **手动恢复为首选** — 优先支持通过命令行/脚本手动恢复，GUI 恢复为辅助

### 9.3 手动恢复流程（后续设计参考）

```bash
# 1. 停止 API 服务
# 2. 备份当前数据库（恢复前快照）
cp apps/api/inventory.db apps/api/backups/pre-restore-$(date +%Y-%m-%d-%H%M%S).db
# 3. 恢复目标备份
cp apps/api/backups/inventory-backup-2026-06-27-143052.db apps/api/inventory.db
# 4. 验证恢复结果
sqlite3 apps/api/inventory.db "PRAGMA integrity_check;"
# 5. 重启 API 服务
```

### 9.4 恢复风险等级

| 风险 | 等级 | 说明 |
|---|---|---|
| 覆盖当前数据 | 🔴 严重 | 恢复会将当前数据替换为备份时间点的数据，备份之后的新数据永久丢失 |
| 备份文件损坏 | 🔴 严重 | 如果备份文件本身已损坏，恢复后系统可能无法启动 |
| 表结构不兼容 | 🟡 中等 | 备份时的表结构可能与恢复时的代码版本不一致 |
| 用户表/密码哈希不兼容 | 🟡 中等 | 新旧密码哈希算法可能不同 |
| 操作失误 | 🟡 中等 | 选错备份文件、误操作等 |

---

## 十、Git 与备份文件边界

### 10.1 当前 `.gitignore` 状态

```gitignore
# 已配置 ✅
apps/api/inventory.db       # 生产数据库不提交
**/__pycache__/             # Python 缓存不提交
*.pyc                       # 编译文件不提交

# 需要补充 ❌
*.backup                    # （无）
backups/                    # （无）
*.backup.db                 # （无）
```

### 10.2 需要补充的 `.gitignore` 规则

```gitignore
# 备份文件（Step 8 新增）
apps/api/backups/*.db
apps/api/backups/*.json
*.backup
*.backup.db
```

### 10.3 备份相关文件的 Git 策略

| 文件/目录 | Git 策略 | 说明 |
|---|---|---|
| `apps/api/inventory.db` | ignore（已配置） | 生产数据库 |
| `apps/api/backups/*.db` | ignore（需新增） | 所有备份文件 |
| `apps/api/backups/*.json` | ignore（需新增） | 备份元数据 |
| `apps/api/backups/.gitkeep` | commit | 保持目录结构 |
| `docs/Step8-备份与数据安全底座方案.md` | commit | 本文档 |

---

## 十一、正式替换旧系统前必须完成的备份验收标准

### 11.1 验收门槛（全部必须通过）

```
🔴 强制执行：以下任一项未通过，不得替换旧系统
```

| # | 验收项 | 验收标准 | 验证方法 |
|---|---|---|---|
| 1 | 手动备份可执行 | 通过 Settings 页面或 API 触发备份，成功生成备份文件 | 实际执行一次备份 |
| 2 | 备份文件完整性 | 备份文件通过 `PRAGMA integrity_check` | sqlite3 命令行验证 |
| 3 | 备份文件可恢复 | 在独立测试环境用备份文件启动系统，功能正常 | 恢复测试 |
| 4 | 恢复前自动备份 | 恢复操作执行前，自动创建当前数据库的快照 | 观察恢复流程 |
| 5 | 备份文件不进入 Git | `git status` 不显示备份文件 | 备份后检查 git status |
| 6 | 备份保留策略可用 | 至少保留最近 5 次备份，自动清理旧备份 | 连续执行 6 次备份后检查 |
| 7 | 旧系统数据迁移完成 | 旧系统数据成功导入当前系统数据库 | 数据对账 |
| 8 | 恢复演练完成 | 模拟灾难场景，完整执行"备份 → 删除 → 恢复 → 验证"流程 | 演练记录 |
| 9 | 备份日志可审计 | 每次备份操作记录在审计日志中 | 查看审计日志 |

### 11.2 验收执行顺序

```
备份功能验收
    │
    ▼
备份恢复测试（独立环境）
    │
    ▼
旧系统数据迁移验证
    │
    ▼
恢复演练（端到端）
    │
    ▼
正式替换旧系统
```

---

## 十二、Step 8 后续建议拆分

本方案设计完成后，建议按以下子步骤逐步实现：

| 步骤 | 内容 | 预估复杂度 | 依赖 |
|---|---|---|---|
| **Step 8-2** | 后端手动备份接口 | 🟡 中 | 本方案 |
| | - 新增 `routers/system.py`（备份/恢复相关系统路由） | | |
| | - 实现 `POST /api/system/backup` 接口 | | |
| | - 实现备份前检查 + 备份后校验 | | |
| | - 在 `main.py` 注册系统路由 | | |
| **Step 8-3** | Settings 页面备份入口 | 🟢 低 | Step 8-2 |
| | - 将 Settings 页面"立即备份"按钮连接到后端 API | | |
| | - 添加备份状态反馈（loading/success/error） | | |
| | - 显示最近备份时间 | | |
| **Step 8-4** | 备份文件列表与下载 | 🟡 中 | Step 8-2 |
| | - 实现 `GET /api/system/backups` 列表接口 | | |
| | - 实现 `GET /api/system/backups/{filename}/download` 下载接口 | | |
| | - Settings 页面展示备份文件列表 | | |
| | - 支持备份文件下载和删除 | | |
| **Step 8-5** | 恢复策略与人工恢复流程 | 🔴 高 | Step 8-4 |
| | - 编写人工恢复 SOP 文档 | | |
| | - 实现恢复前自动备份 | | |
| | - 实现恢复二次确认机制 | | |
| | - 恢复演练（独立测试环境） | | |
| **Step 8-6** | 部署前备份验收 | 🔴 高 | Step 8-5 |
| | - 按第十一节验收标准逐项检查 | | |
| | - 旧系统数据迁移 | | |
| | - 完整恢复演练 | | |
| | - 验收记录文档 | | |

---

## 十三、补充 `.gitignore` 规则（待 Step 8-2 实施时生效）

```gitignore
# === 备份文件（Step 8 新增）===
apps/api/backups/*.db
apps/api/backups/*.json
*.backup
*.backup.db
```

> **注意**: 本文件仅为设计文档。`.gitignore` 的修改和备份功能代码实现将在 Step 8-2 及后续步骤中执行。

---

## 十四、审计结论

1. 当前项目 **没有任何备份能力**（无后端接口、无脚本、无前端的实际功能）
2. `inventory.db` 已通过 `.gitignore` 保护，不会提交到 Git ✅
3. Settings 页面的"立即备份"按钮是 UI 占位，需要接入真实备份逻辑
4. 备份文件忽略规则未配置，需在 Step 8-2 实施时补充
5. **正式替换旧系统前，必须按第十一节标准完成全部验收**
6. 本方案为设计文档，**不包含任何代码实现**

---

## 附录 A：相关文件清单

| 文件 | 用途 | 本轮操作 |
|---|---|---|
| `apps/api/inventory.db` | 生产数据库（45KB，SQLite） | 未修改 |
| `apps/api/database.py` | ORM 模型 + 数据库初始化 | 未修改 |
| `apps/api/main.py` | FastAPI 应用入口 | 未修改 |
| `apps/api/routers/` | 6 个业务路由文件 | 未修改 |
| `src/pages/Settings.jsx` | 设置页面（含备份占位按钮） | 未修改 |
| `src/utils/exportHelpers.js` | CSV 导出（非备份） | 未修改 |
| `.gitignore` | Git 忽略规则 | 未修改（方案中建议补充） |
| `docs/Step8-备份与数据安全底座方案.md` | 本文件 | **新增** |

## 附录 B：关键字索引

- `inventory.db` — 生产数据库文件
- `apps/api/backups/` — 建议的备份目录
- `POST /api/system/backup` — 计划新增的备份 API
- `PRAGMA integrity_check` — SQLite 完整性校验 SQL
- `SQLite format 3\000` — SQLite 文件头魔数

---

> **文档状态**: 设计完成，等待人工审核确认  
> **本轮日期**: 2026-06-27  
> **下轮任务**: Step 8-2（后端手动备份接口）  
> **Git 状态**: 未提交（等待人工确认）
