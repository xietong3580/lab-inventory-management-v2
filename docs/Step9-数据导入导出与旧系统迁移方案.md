# Step 9 数据导入导出与旧系统迁移方案

## 当前稳定节点

- **Commit**: `bd945b2 docs: add step 8 backup feature checklist`
- **分支**: `main`，已同步 `origin/main`
- **工作区**: 干净（`git status --short` 无输出）

---

## 1. 本轮审计范围

本轮为 **Step 9-1：只读审计 + 方案文档**，不写任何业务功能代码。

审计范围：
- 前端所有导出按钮、CSV 工具函数、备份下载入口
- 后端所有导出/导入相关 API 端点
- 后端数据库模型（SQLAlchemy ORM）、业务表结构
- 现有文档中与导入导出、迁移、备份相关的说明
- `package.json` 中 CSV/Excel 相关依赖

本轮严格不涉及：
- 修改 `src/` 或 `apps/api/` 任何代码
- 写入 `apps/api/inventory.db`
- 删除/移动/重命名任何备份文件
- 实现导入功能、恢复功能
- `git add` 或 `git commit`

---

## 2. 当前已有导出能力

### 2.1 前端 CSV 导出（3 个页面）

所有 CSV 导出均通过 `src/utils/exportHelpers.js` 实现，纯前端 Blob 生成，**不依赖任何第三方库**（无 xlsx、papaparse、FileSaver）。

| 导出功能 | 页面文件 | 函数 | 导出字段 |
|----------|---------|------|---------|
| 产品导出 | `src/pages/Products.jsx` | `exportProductsToCSV()` | 产品名称、SKU、分类、当前库存、最低库存、状态、单位、存储位置、最后更新 |
| 交易导出 | `src/pages/Transactions.jsx` | `exportTransactionsToCSV()` | 时间、类型、产品名称、SKU、数量、单位、操作人、状态、备注 |
| 审计导出 | `src/pages/AuditLog.jsx` | `exportAuditLogsToCSV()` | 时间、操作类型、产品名称、操作人、摘要 |

**CSV 导出通用特征**：
- 使用 UTF-8 BOM（`﻿`）确保 Excel 正确显示中文
- 文件名格式：`{type}-export-YYYY-MM-DD-HH-MM.csv`
- 权限控制：仅 `canWrite`（admin）可用，viewer 按钮置灰
- 数据源：当前页面筛选后的数据（非全量数据库数据）
- 无数据时 `alert()` 提示，不导出空文件

### 2.2 后端数据库备份下载

Step 8 已实现完整的数据库备份闭环（非 CSV 导出，是 `.db` 文件下载）：

| API 端点 | 方法 | 功能 | 权限 |
|----------|------|------|------|
| `/api/backups/manual` | POST | 创建数据库备份（SQLite backup API） | admin |
| `/api/backups` | GET | 列出所有备份文件（含完整性校验） | admin |
| `/api/backups/{filename}/download` | GET | 下载指定备份文件 | admin |

**备份安全特性**：
- 文件名正则校验：`^inventory-backup-\d{4}-\d{2}-\d{2}-\d{6}\.db$`
- 路径穿越防护（拒绝 `..`、`/`、`\`）
- SQLite 原生 `backup()` API + 临时文件 + 原子重命名
- 备份前/后双重 `PRAGMA integrity_check`

### 2.3 缺失的导出能力

以下页面/数据类型 **没有** 导出功能：

| 缺失导出的页面/数据 | 状态 |
|---------------------|------|
| 仪表盘统计 | 无导出 |
| 低库存预警 | 无导出 |
| 用户管理 | 无导出 |
| 系统设置 | 无导出 |
| 库存快照（含当前库存数量的产品列表） | 无独立导出（产品导出已包含） |

**无 Excel（.xlsx）或 JSON 格式导出**，所有导出仅支持 CSV。

---

## 3. 当前缺失的导入能力

### 3.1 结论：系统完全不具备任何数据导入能力

经过全项目搜索（关键词：import、upload、csv、parse、FileReader、FormData、导入、migrate、batch、bulk），确认：

**无以下任何能力：**

| 缺失能力 | 详细说明 |
|----------|---------|
| CSV 文件上传解析 | 无 `<input type="file">`、无 FileReader API 使用、无 CSV 解析库 |
| 后端导入 API | 无 `POST /api/products/import`、无 `multipart/form-data` 处理 |
| 批量创建接口 | 所有 POST 端点每次仅处理单条记录 |
| 数据库备份恢复 | 备份可下载但不能通过系统界面或 API 恢复到数据库 |
| 旧系统数据迁移工具 | 无 ETL 脚本、无字段映射配置、无迁移流程 |
| 导入预览/确认 UI | 无 |
| 导入审计日志 | 无（审计日志中有 `SEED_DATA_IMPORT` 类型，但仅用于开发种子脚本） |

### 3.2 唯一存在的"导入"是开发工具

`apps/api/seed.py` — 开发者 CLI 脚本，从硬编码 Python 字典写入测试数据：
- `seed_database()` — 清空并重新填充 products + transactions
- `seed_users()` — 创建测试 admin/viewer 账号

这不是用户功能，不接收文件输入，不能用于旧系统迁移。

---

## 4. 当前核心数据表与业务对象

### 4.1 数据库概览

| 属性 | 值 |
|------|-----|
| 数据库引擎 | SQLite |
| 数据库文件 | `apps/api/inventory.db` |
| ORM | SQLAlchemy（`declarative_base()` 风格） |
| 迁移框架 | **无**（仅 `Base.metadata.create_all()` + ad-hoc `migrate_users()`） |
| 表数量 | 4 |
| 外键约束 | **无**（仅应用层 ID 关联） |
| ORM relationship | **无** |
| 模型定义文件 | `apps/api/database.py`（单文件，188 行） |
| Pydantic schema 文件 | `apps/api/schemas.py` |

### 4.2 数据表详情

#### 表 1：`products`（产品基础资料）

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | Integer | PK, 自增 | auto | |
| `sku` | String(50) | NOT NULL, UNIQUE | — | 产品 SKU 编码 |
| `name` | String(100) | NOT NULL | — | 产品名称 |
| `category` | String(50) | NOT NULL | "耗材" | 分类 |
| `current_stock` | Integer | NOT NULL | 0 | 当前库存数量 |
| `min_stock` | Integer | NOT NULL | 0 | 最低库存阈值 |
| `unit` | String(20) | NOT NULL | "个" | 单位 |
| `location` | String(100) | nullable | NULL | 存储位置 |
| `status` | String(20) | NOT NULL | "正常" | 运行时由 `to_dict()` 动态计算 |
| `last_updated` | String(20) | nullable | NULL | YYYY-MM-DD 字符串 |
| `created_at` | DateTime | — | now() | |
| `updated_at` | DateTime | — | now() (onupdate) | |

**注意**：`status` 列存储值在读取时被 `to_dict()` 覆盖为运行时计算值（`"低库存" if current_stock <= min_stock else "正常"`）。

#### 表 2：`transactions`（出入库记录）

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | Integer | PK, 自增 | auto | |
| `product_id` | Integer | NOT NULL | — | 关联 products.id（无 FK） |
| `product_name` | String(100) | NOT NULL | — | 冗余存储产品名称 |
| `type` | String(20) | NOT NULL | — | "入库" / "出库" |
| `quantity` | Integer | NOT NULL | — | 数量 |
| `unit` | String(20) | NOT NULL | — | 单位 |
| `date` | String(50) | NOT NULL | — | YYYY-MM-DD HH:MM 字符串 |
| `operator` | String(50) | NOT NULL | — | 操作人 |
| `status` | String(20) | NOT NULL | "completed" | completed / pending / reversed |
| `notes` | Text | nullable | NULL | 备注 |
| `reversed_at` | String(50) | nullable | NULL | 冲正时间 |
| `reversed_by` | String(50) | nullable | NULL | 冲正人 |
| `created_at` | DateTime | — | now() | |

**注意**：`product_id` 无外键约束，删除产品不会级联处理关联交易记录。

#### 表 3：`audit_logs`（审计日志）

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | Integer | PK, 自增 | auto | |
| `action_type` | String(50) | NOT NULL | — | 如 PRODUCT_ADD、PRODUCT_UPDATE 等 |
| `product_name` | String(100) | nullable | NULL | |
| `product_id` | String(50) | nullable | NULL | **字符串类型**，如 "prod-000001" |
| `operator` | String(50) | NOT NULL | "系统" | |
| `timestamp` | String(50) | NOT NULL | — | YYYY-MM-DD HH:MM:SS 字符串 |
| `details` | Text | nullable | NULL | JSON 格式详情 |
| `created_at` | DateTime | — | now() | |

**注意**：`product_id` 在此表中是 `String(50)`，与 `transactions.product_id`（Integer）不一致。

#### 表 4：`users`（用户账号）

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | Integer | PK, 自增 | auto | |
| `username` | String(50) | NOT NULL, UNIQUE | — | |
| `password_hash` | String(128) | nullable | NULL | bcrypt 哈希 |
| `display_name` | String(100) | nullable | NULL | 显示名称 |
| `email` | String(100) | nullable | NULL | |
| `role` | String(30) | NOT NULL | "viewer" | admin / viewer |
| `is_active` | Boolean | NOT NULL | True | |
| `status` | String(20) | NOT NULL | "活跃" | "活跃" / "停用"（与 is_active 冗余） |
| `last_login` | String(50) | nullable | NULL | 时间字符串 |
| `created_at` | DateTime | — | now() | |

**注意**：`is_active`（Boolean）与 `status`（String）语义冗余；`users` 表有唯一的 ad-hoc 迁移函数 `migrate_users()`。

### 4.3 关键架构提醒

1. **无外键约束** — 数据完整性完全依赖应用层
2. **无 ORM relationship** — 跨表查询需手动 JOIN
3. **时间字段类型不统一** — `last_updated`、`date`、`timestamp` 等存为 String，仅 `created_at`/`updated_at` 为 DateTime
4. **无迁移框架** — 表结构变更依赖手动 ALTER TABLE
5. **product_id 类型不一致** — transactions 中为 Integer，audit_logs 中为 String

---

## 5. 正式替换旧系统前需要迁移的数据类型

### 5.1 数据迁移全景

| 序号 | 数据类型 | 目标表 | 预估复杂度 | 优先级 |
|------|---------|--------|-----------|--------|
| 1 | 产品基础资料 | `products` | 中 | **P0** |
| 2 | 当前库存数量 | `products.current_stock` | 低 | **P0** |
| 3 | 出入库历史记录 | `transactions` | 高 | P1 |
| 4 | 用户账号 | `users` | 中 | P2 |
| 5 | 审计日志 | `audit_logs` | 低 | P3 |
| 6 | 系统设置 | （当前无 settings 表） | 低 | P3 |

### 5.2 各数据类型详情

#### P0：产品基础资料 + 当前库存（必须迁移，否则系统无法运行）

**旧系统需导出的字段**：
- 产品名称
- SKU / 产品编码
- 分类
- 当前库存数量
- 最低库存阈值
- 单位
- 存储位置

**新系统对应字段**：
- `products.name`、`products.sku`、`products.category`
- `products.current_stock`、`products.min_stock`
- `products.unit`、`products.location`

**注意**：
- SKU 必须唯一，旧系统可能存在重复 SKU 需提前清理
- 分类字段需做值映射（旧系统分类名可能不同）
- 最低库存阈值若旧系统无此字段需设默认值（建议 0 或按分类设置）
- 库存数量为整数，旧系统若有小数需确认精度策略

#### P1：出入库历史记录（强烈建议迁移，用于对账和追溯）

**旧系统需导出的字段**：
- 关联产品（SKU 或名称）
- 入库/出库类型
- 数量
- 单位
- 操作时间
- 操作人
- 状态
- 备注

**新系统对应字段**：
- `transactions.product_id`（需从 SKU 反查 products.id）
- `transactions.product_name`（冗余存储）
- `transactions.type`、`transactions.quantity`、`transactions.unit`
- `transactions.date`、`transactions.operator`
- `transactions.status`、`transactions.notes`

**注意**：
- 历史记录量可能很大（数千到数万条），需考虑导入性能
- `product_id` 需要根据旧系统 SKU 反查新系统 products.id 做关联
- 旧系统时间格式可能不一致，需统一转换
- 若旧系统记录无 `reversed_at`/`reversed_by`，导入时留 NULL
- 旧系统可能使用不同的操作人名称，建议保留原始值

#### P2：用户账号与权限（建议迁移，减少手动重建工作量）

**旧系统需导出的字段**：
- 用户名
- 显示名称
- 邮箱
- 角色
- 账号状态

**新系统对应字段**：
- `users.username`、`users.display_name`、`users.email`
- `users.role`、`users.is_active`、`users.status`

**注意**：
- 密码哈希不能直接迁移（旧系统可能使用不同加密方式）
- 建议策略：导入账号后强制所有用户首次登录时重置密码
- 角色映射：旧系统角色体系可能更复杂，需做简化映射
- 导入后每个用户生成临时随机密码 + 强制修改标记

#### P3：审计日志与历史设置（可选迁移，影响较小）

**审计日志**：
- 旧系统审计日志格式可能与新系统不完全兼容
- 建议策略：导出为只读归档 CSV，不导入数据库，需要时查询 CSV 即可
- 若必须导入，需做 `action_type` 枚举值映射

**系统设置**：
- 当前新系统无独立的 `settings` 表
- 如有全局配置参数，可在导入时初始化

---

## 6. CSV 导入方案初步设计

### 6.1 导入模板设计

#### 产品导入模板（CSV 列）

| 列序号 | 字段名（表头） | 必填 | 类型 | 约束 | 示例 |
|--------|--------------|------|------|------|------|
| 1 | 产品名称 | ✅ | String | 1-100 字符 | 钨钢铣刀 D6 |
| 2 | SKU | ✅ | String | 1-50 字符，唯一 | WS-MILL-D6 |
| 3 | 分类 | ✅ | String | 1-50 字符 | 刀具 |
| 4 | 当前库存 | ✅ | Integer | ≥ 0 | 150 |
| 5 | 最低库存 | ❌ | Integer | ≥ 0，默认 0 | 20 |
| 6 | 单位 | ❌ | String | 默认 "个" | 支 |
| 7 | 存储位置 | ❌ | String | 0-100 字符 | A-3-2 |

#### 交易导入模板（CSV 列）

| 列序号 | 字段名（表头） | 必填 | 类型 | 约束 | 示例 |
|--------|--------------|------|------|------|------|
| 1 | 产品SKU | ✅ | String | 必须存在于 products 表 | WS-MILL-D6 |
| 2 | 类型 | ✅ | Enum | "入库" 或 "出库" | 出库 |
| 3 | 数量 | ✅ | Integer | > 0 | 10 |
| 4 | 单位 | ❌ | String | 默认从产品继承 | 支 |
| 5 | 操作时间 | ✅ | DateTime | YYYY-MM-DD HH:MM | 2025-12-15 14:30 |
| 6 | 操作人 | ❌ | String | 默认 "系统导入" | 张三 |
| 7 | 状态 | ❌ | Enum | completed/pending，默认 completed | completed |
| 8 | 备注 | ❌ | String | | 旧系统迁移 |

### 6.2 数据校验规则

**行级校验（每行独立检查）**：
- 必填字段不为空
- SKU 格式合法（无特殊字符）
- 数值字段为有效数字且在范围内
- 枚举字段值在允许值列表中
- 字符串字段不超长

**跨行校验（全局检查）**：
- 产品 SKU 不重复（模板内部 + 与已有数据库对比）
- 交易关联的产品 SKU 存在于 products 表（含本次导入的新产品）
- 导入后库存不为负数（出库记录不会导致库存 < 0）

**校验结果分类**：
- ✅ 通过：可以导入
- ⚠️ 警告：可以导入但建议人工查看（如库存阈值设为 0）
- ❌ 错误：不能导入，需修正后重试

### 6.3 重复产品处理策略

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| **跳过**（推荐默认） | 已存在的 SKU 不导入，报告中标注"已跳过" | 增量导入 |
| **更新** | 已存在的 SKU 更新除库存外的字段（名称、分类、阈值等） | 数据修正 |
| **覆盖** | 已存在的 SKU 完全覆盖（含库存数量） | 库存盘点后全量同步 |
| **报错** | 遇到重复 SKU 停止导入 | 严格模式 |

### 6.4 导入流程设计

```
用户选择 CSV 文件
    │
    ▼
前端解析 CSV 文件（FileReader + 手动解析或 PapaParse）
    │
    ▼
POST /api/products/import/preview → 后端返回校验结果
    │
    ▼
前端展示预览表格：
  - 总行数 / 通过数 / 警告数 / 错误数
  - 每行校验结果（通过/警告/错误 + 具体原因）
  - 重复产品处理策略选择
    │
    ▼
用户确认导入 → 勾选"我已确认导入前自动备份"
    │
    ▼
POST /api/backups/manual（自动备份）
    │
    ▼
POST /api/products/import/execute → 后端执行导入
    │
    ▼
返回导入结果：
  - 成功导入 X 条
  - 跳过 Y 条（原因）
  - 失败 Z 条（原因）
  - 导入前后库存对比摘要
    │
    ▼
自动写入审计日志：IMPORT_PRODUCTS
```

### 6.5 导入前自动备份

- 导入执行前**强制**自动创建数据库备份
- 备份失败则**不允许执行导入**
- 备份文件命名：`inventory-backup-pre-import-YYYY-MM-DD-HHMMSS.db`
- 导入审计日志中记录备份文件名，便于回滚查找

### 6.6 库存数量校验（导入交易时）

- 执行导入交易前，先计算每条出库记录是否会导致库存为负
- 对于会导致负库存的出库记录：
  - 选项 A：该条记录导入失败，标注原因
  - 选项 B：自动调整为仅出库当前库存量，标注差异
  - 选项 C：用户手动决定

---

## 7. CSV 导出方案补齐建议

### 7.1 建议新增的导出功能

| 导出类型 | 页面 | 优先级 | 说明 |
|----------|------|--------|------|
| **库存导出** | Products 页 | P0 | 产品导出新增"库存快照"模式，突出当前库存、最低库存、库存状态 |
| **低库存导出** | Alerts 页 | P1 | 低库存预警列表导出，便于采购计划 |
| **仪表盘导出** | Dashboard 页 | P2 | 仪表盘统计摘要导出（非图表，是数据摘要） |
| **用户导出** | Users 页 | P3 | 用户列表导出（脱敏，不含密码哈希） |

### 7.2 导出功能增强建议

| 建议 | 优先级 | 说明 |
|------|--------|------|
| 全量 vs 筛选导出选项 | P1 | 当前仅导出筛选后数据，建议增加"导出全部"选项 |
| 导出列选择 | P2 | 允许用户选择导出哪些列 |
| Excel (.xlsx) 格式 | P2 | 安装 xlsx 或 SheetJS 库，支持多 sheet 导出 |
| 后端流式导出 | P3 | 大数据量时避免前端内存压力 |
| 导出历史记录 | P3 | 记录谁在什么时间导出了什么数据（审计合规） |

---

## 8. 旧系统迁移流程建议

### 8.1 迁移流程图

```
Phase A: 准备
  1. 旧系统数据导出（CSV/Excel）
  2. 旧系统数据质量检查（重复 SKU、缺失字段、异常值）
  3. 新系统字段映射表编制
  4. 数据清洗脚本编写与测试
  
Phase B: 试迁移
  5. 在新系统测试环境（或开发数据库副本）导入小样本（10-20 条）
  6. 人工核对样本数据：产品信息、库存数量、关联关系
  7. 发现问题 → 修正映射表/清洗脚本 → 回到步骤 5
  8. 样本核对通过
  
Phase C: 正式迁移
  9. 通知相关人员，系统进入维护模式（暂停出入库操作）
  10. 旧系统最终数据导出
  11. 新系统自动备份当前数据库
  12. 正式导入：产品 → 库存 → 交易记录 → 用户 → 审计日志
  13. 导入后数据对账（总产品数、总库存量、总交易数）
  
Phase D: 验收
  14. 随机抽样核对（产品信息准确性、库存数量一致性）
  15. 关键产品逐一核对
  16. 用户登录验证
  17. 历史交易可追溯验证
  18. 验收通过 → 切换到新系统
  19. 验收不通过 → 回滚到导入前备份 → 修正后重试
```

### 8.2 旧系统导出要求

旧系统（无论何种形式）需要能导出以下数据的 CSV/Excel 文件：

1. **产品清单** — 含 SKU、名称、分类、库存、单位、位置
2. **出入库历史** — 含产品标识、类型、数量、时间、操作人
3. **用户列表** — 含用户名、姓名、角色（密码另行处理）
4. **审计日志**（可选）— 操作记录

如果旧系统**不能导出 CSV/Excel**：
- 考虑直接从旧系统数据库导出（如旧系统也用 SQLite/MySQL）
- 编写一次性专用导出脚本（仅运行一次，读旧库写 CSV）
- 手动录入（仅适用于数据量极小的情况，不推荐）

### 8.3 新系统字段映射

为保证新旧系统字段对齐，需编制一份**字段映射表**：

```csv
旧系统字段, 旧系统类型, 新系统字段, 新系统类型, 转换规则, 备注
```

示例（以产品为例）：
```csv
物料编码, VARCHAR(50), products.sku, String(50), 直接映射, 需验证唯一性
物料名称, VARCHAR(200), products.name, String(100), 截断到 100 字符, 超长名称需人工确认
物料组, VARCHAR(50), products.category, String(50), 值映射表, 旧分类需对应新分类
当前库存, DECIMAL(10,2), products.current_stock, Integer, ROUND(), 小数库存需确认精度策略
安全库存, INT, products.min_stock, Integer, 直接映射,
基本单位, VARCHAR(20), products.unit, String(20), 直接映射,
库位, VARCHAR(100), products.location, String(100), 直接映射,
```

### 8.4 小样本试导入清单

试导入样本应覆盖以下场景：
- 正常产品（各字段完整）
- SKU 含特殊字符的产品
- 超长名称产品
- 库存为 0 的产品
- 库存为负数的产品（旧系统可能存在）
- 无 SKU 的产品（旧系统可能存在）
- 重复 SKU 产品
- 出入库记录（入库 + 出库）
- 跨多日的交易记录
- 含特殊字符的备注

### 8.5 验收标准

| 验收项 | 标准 | 验证方式 |
|--------|------|---------|
| 产品总数 | 新系统 = 旧系统（排除跳过的无效数据） | 行数对比 |
| 总库存量 | 新系统 sum(current_stock) = 旧系统 sum(库存) | 求和对比 |
| SKU 唯一性 | 新系统无重复 SKU | SQL 查询 |
| 交易总数 | 新系统 = 旧系统（排除跳过的无效数据） | 行数对比 |
| 入库总量 | 新系统 sum(入库) = 旧系统 sum(入库) | 求和对比 |
| 出库总量 | 新系统 sum(出库) = 旧系统 sum(出库) | 求和对比 |
| 用户账号 | 全部可登录 | 逐一登录测试 |
| 抽样核对 | 随机 10 个产品字段完全一致 | 人工对比 |

---

## 9. 风险与控制

| 风险 | 等级 | 影响 | 控制措施 |
|------|------|------|---------|
| **字段不一致** | 🔴 高 | 导入后数据错位/丢失 | 编制详细字段映射表，小样本试导入验证 |
| **编码问题** | 🟡 中 | 中文乱码 | CSV 统一 UTF-8 BOM，导入前编码检测 |
| **重复产品** | 🔴 高 | 库存数据混乱 | 导入前 SKU 去重检查，提供多种重复处理策略 |
| **库存数量错误** | 🔴 高 | 库存不准，影响出入库 | 导入后全量库存对账，负库存预警 |
| **历史记录不完整** | 🟡 中 | 对账困难 | 明确标注哪些数据来自旧系统迁移，导入时打标签 |
| **导入后无法回滚** | 🔴 高 | 数据污染无法恢复 | 导入前强制自动备份，保留回滚能力 |
| **外键关联断裂** | 🟡 中 | 交易记录无法关联产品 | 导入顺序：先产品后交易，交易 SKU 反查 products.id |
| **大数据量导入超时** | 🟡 中 | 导入中断 | 分批导入 + 进度追踪 + 断点续传 |
| **权限混乱** | 🟡 中 | 用户获得错误权限 | 导入后逐用户验证角色，默认最低权限 |
| **网络中断** | 🟢 低 | 导入半途而废 | 导入在服务端事务中执行，失败自动回滚 |

---

## 10. 后续 Step 9 建议拆分

基于当前系统状态和本轮审计结果，建议将 Step 9 拆分为以下子步骤：

| 子步骤 | 名称 | 内容 | 预估工作量 |
|--------|------|------|-----------|
| **Step 9-1** ✅ | 数据导入导出与旧系统迁移现状审计 | 本轮，只读审计 + 方案文档 | 已完成 |
| **Step 9-2** | 产品/库存 CSV 导入模板设计 | 设计 CSV 模板字段、生成模板文件、模板下载功能 | 小 |
| **Step 9-3** | 后端 CSV 预览校验接口 | `POST /api/products/import/preview`、CSV 解析、行级+跨行校验、返回校验结果 | 中 |
| **Step 9-4** | 前端导入预览页面 | FileReader 上传解析、校验结果表格展示、重复处理策略选择、确认导入 UI | 中 |
| **Step 9-5** | 正式导入执行接口 | `POST /api/products/import/execute`、事务性批量导入、导入审计日志 | 中 |
| **Step 9-6** | 导入前自动备份 | 导入执行前强制自动备份、备份失败阻止导入 | 小 |
| **Step 9-7** | 导入后验收报表 | 导入结果摘要、导入前后对比、数据对账报表 | 小 |
| **Step 9-8** | 交易记录 CSV 导入 | 交易导入模板、预览、执行（复用产品导入架构） | 中 |
| **Step 9-9** | 旧系统真实迁移执行 | 根据旧系统实际数据格式编写迁移脚本 + 执行迁移 | 大 |

---

## 11. 明确本轮不实现

本轮（Step 9-1）是纯审计和文档轮次，以下内容明确**不实现**：

- ❌ 不实现 CSV 导入功能
- ❌ 不实现文件上传解析
- ❌ 不实现后端导入 API
- ❌ 不实现前端导入页面
- ❌ 不实现数据库恢复功能
- ❌ 不写入 `apps/api/inventory.db`
- ❌ 不生成迁移文件或迁移脚本
- ❌ 不修改旧系统数据
- ❌ 不删除/移动/重命名备份文件
- ❌ 不修改 `src/` 任何代码
- ❌ 不修改 `apps/api/` 任何代码
- ❌ 不修改端口配置（前端 5173，后端 8001）
- ❌ 不恢复 stash
- ❌ 不执行 `git add` 或 `git commit`

---

## 附录 A：审计范围详情

### A.1 已审计文件清单

**前端文件**：
- `src/utils/exportHelpers.js` — CSV 导出工具函数（完整读取）
- `src/pages/Products.jsx` — 产品页导出按钮
- `src/pages/Transactions.jsx` — 交易页导出按钮
- `src/pages/AuditLog.jsx` — 审计日志页导出按钮
- `src/pages/Settings.jsx` — 设置页备份操作
- `src/pages/Dashboard.jsx` — 仪表盘（确认无导出）
- `src/pages/Alerts.jsx` — 低库存预警（确认无导出）
- `src/pages/Users.jsx` — 用户管理（确认无导出）
- `src/services/backupService.js` — 备份服务层
- `src/services/dataService.js` — 数据服务层
- `src/services/productService.js` — 产品服务层

**后端文件**：
- `apps/api/database.py` — ORM 模型定义（完整读取）
- `apps/api/schemas.py` — Pydantic 请求/响应模型
- `apps/api/main.py` — 路由注册
- `apps/api/routers/backups.py` — 备份 API 端点
- `apps/api/routers/products.py` — 产品 API 端点
- `apps/api/routers/transactions.py` — 交易 API 端点
- `apps/api/routers/audit_logs.py` — 审计日志 API 端点
- `apps/api/routers/users.py` — 用户 API 端点
- `apps/api/seed.py` — 种子数据脚本
- `apps/api/requirements.txt` — Python 依赖

**文档文件**：
- `CLAUDE.md`
- `README.md`
- `.claude/rules/execution.md`
- `docs/第二阶段总结.md`
- `docs/第四阶段总结.md`
- `docs/Step7-账号权限安全阶段验收清单.md`
- `docs/Step8-备份与数据安全底座方案.md`
- `docs/Step8-备份功能阶段验收清单.md`
- `apps/api/README.md`

**配置文件**：
- `package.json`
- `.gitignore`

### A.2 搜索关键词

export, import, csv, Excel, download, backup, restore, migrate, migration, batch, bulk, parse, upload, FileReader, FormData, Blob, FileSaver, xlsx, papaparse, 导出, 导入, 迁移, 备份, 旧系统, legacy

---

## 附录 B：与 Step 8 的关系

Step 8 实现了数据库备份闭环（手动备份 → 备份列表 → 备份下载），为 Step 9 的导入功能提供了关键的前置能力：

- ✅ **导入前自动备份** — Step 8 的 `POST /api/backups/manual` 可直接复用
- ✅ **导入后回滚** — 通过下载的备份文件 + 未来恢复功能实现
- ❌ **数据库恢复** — Step 8 明确未实现，需要在导入功能上线前实现或提供手动恢复方案

---

*文档版本：v1.0*  
*生成日期：2026-06-28*  
*对应 Step：9-1（只读审计 + 方案文档）*  
*生成方式：全项目代码审计 + 文档审查*  
*状态：待人工审核确认*
