# Step 9-5A：产品 CSV 正式导入执行方案

*文档版本：v1.0*  
*生成日期：2026-06-28*  
*对应 Step：9-5A（方案设计，本轮不实现）*  
*状态：待人工审核确认*

---

## 一、当前背景

### 1.1 已完成能力

| 已完成 | 内容 | 状态 |
|--------|------|------|
| Step 9-1 | 全项目数据导入导出审计与迁移方案 | ✅ 文档完成 |
| Step 9-2 | 产品库存 CSV 导入模板设计 | ✅ 文档完成 |
| Step 9-2B | 旧系统字段映射与产品模型扩展决策 | ✅ 文档完成 |
| Step 9-3A | 后端 CSV 预览校验接口 `POST /api/imports/products/preview` | ✅ 代码完成 |
| Step 9-4A | 前端 CSV 上传与预览页面 `/import-preview` | ✅ 代码完成 |
| Step 9-4B | 导入预览页面体验与验收收口 | ✅ 代码完成 |

### 1.2 当前状态

- **预览接口**：`POST /api/imports/products/preview` 已完整实现，支持 CSV 解析、字段映射（P0/P1/P2/STOCK_CONTEXT/Ignored）、逐行校验、SKU 重复检查、数据库已有 SKU 检查。**只读查询，不写数据库。**
- **预览页面**：`/import-preview` 已完整实现，admin 可上传 CSV、查看预览统计、字段识别、行级预览、库存口径警告。**正式导入按钮始终禁用。**
- **产品模型**：`Product` 表含 7 个 P0 字段（sku, name, category, current_stock, min_stock, unit, location），暂未扩展 P1 字段。
- **备份能力**：Step 8 已实现手动备份 + 备份列表 + 备份下载，`POST /api/backups/manual` 可直接复用。
- **审计日志**：`AuditLog` 表已存在，`POST /api/audit-logs/` 为骨架接口。
- **权限系统**：`require_admin` 依赖已实现，仅 `role == 'admin'` 可访问管理接口。

### 1.3 本轮范围

**Step 9-5A 只做方案设计**，不实现正式导入写库接口：
- ❌ 不新增导入执行 API
- ❌ 不开放前端正式导入按钮
- ❌ 不写数据库
- ❌ 不修改 `apps/api/routers/imports.py` 业务逻辑
- ❌ 不修改数据库表结构
- ❌ 不引入新依赖
- ✅ 只新增本文档 + 更新开发记录

---

## 二、正式导入总体原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | **数据安全优先** | 任何导入操作不能导致数据丢失、库存错乱或权限绕过 |
| 2 | **预览通过后才能导入** | 后端必须重新执行解析校验，不信任前端传回的预览结果 |
| 3 | **admin 才能执行正式导入** | `POST /api/imports/products/execute` 使用 `require_admin` 依赖 |
| 4 | **viewer 永远不能导入** | 前端按钮对 viewer 不可见/不可点击；后端 403 |
| 5 | **导入前必须提醒备份数据库** | 前端二次确认弹窗明确提示建议备份；后端日志记录是否已备份 |
| 6 | **导入过程必须有审计记录** | 每条导入批次写入 `AuditLog`，记录操作人、时间、文件名、结果 |
| 7 | **失败必须可解释** | 返回结构化错误信息，明确行号、字段、原因 |
| 8 | **不能让用户误以为参考库存会写入真实库存** | 仅 P0 字段入库，STOCK_CONTEXT 字段不入库，前端明确标注 |

---

## 三、字段写入规则

### 3.1 字段等级与写入策略

| 等级 | 说明 | 是否写入数据库 | 备注 |
|------|------|:---:|------|
| **P0** | 必填/核心字段：sku, name, current_stock, min_stock, category, unit, location | ✅ 是 | 校验通过后直接写入 Product 表 |
| **P1** | 推荐字段：brand, specification, description, notes, image_url | ❌ 暂不写入 | 当前 Product 表无对应列；原始值保留在审计日志 details JSON 中，待模型扩展后可重新导入 |
| **P2** | 参考字段：status, source_updated_at | ❌ 不写入 | status 由系统按 current_stock ≤ min_stock 自动计算；source_updated_at 不覆盖系统导入时间 |
| **STOCK_CONTEXT** | 库存口径参考：remote_stock, available_stock, stock_note | ❌ 不写入 | 仅预览参考；原始值保留在审计日志 details 中 |
| **Ignored** | 未识别列 | ❌ 不写入 | 丢弃 |

### 3.2 关键库存口径规则（不可协商）

> ⚠️ 以下规则为业务硬约束，任何正式导入实现不得违反。

1. **`current_stock` 只表示本地真实库存。** 导入后直接写入 `Product.current_stock` 列。
2. **`min_stock` 只表示最低库存阈值。** 导入后直接写入 `Product.min_stock` 列。
3. **低库存判断只基于 `current_stock ≤ min_stock`。** 导入后 `Product.status` 由系统自动计算，不信任 CSV 中的 status 列。
4. **异地库存、虚拟库存、总可售库存不能自动合并进 `current_stock`。** 系统不执行任何 `current_stock = local_stock + remote_stock` 类计算。
5. **总可售库存即使很高，也不能抵消本地低库存预警。** 低库存判断完全独立于参考库存字段。
6. **CSV 中「总库存」「可售库存」列在 preview 阶段产生 warning，在 execute 阶段不写入。**

### 3.3 P0 字段默认值策略

当 CSV 列缺失或单元格为空时的默认值（与 preview 一致）：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| category | `"耗材"` | 列缺失/单元格为空 |
| min_stock | `0` | 列缺失/单元格为空 |
| unit | `"个"` | 列缺失/单元格为空 |
| location | `""` | 列缺失/单元格为空 |
| sku | 无默认值 | **必填，空值 = error** |
| name | 无默认值 | **必填，空值 = error** |
| current_stock | 无默认值 | **必填，空值 = error** |

---

## 四、重复 SKU 处理方案

### 4.1 推荐默认规则（第一版）

| 场景 | 处理方式 | 原因 |
|------|----------|------|
| SKU 在 CSV 内部重复 | **拒绝整批导入**（已在 preview 阶段报 error） | 无法确定哪一行是正确的 |
| SKU 已存在于数据库 | **跳过该行，记录 warning，不覆盖** | 避免误覆盖已有产品数据 |
| SKU 在数据库中不存在 | **正常新增** | 唯一安全路径 |

### 4.2 推荐策略：`create_only`（仅新增不覆盖）

```json
{
  "duplicate_sku_strategy": "skip",
  "duplicate_sku_description": "SKU 已存在时跳过该行，不更新任何字段，在 skipped_items 中列出"
}
```

**原因**：
- 覆盖已有产品存在不可逆风险（库存数量被错误覆盖无法恢复）
- 更新基础信息（名称、分类）需求场景较少，可在产品管理页手动编辑
- 后续版本可扩展为用户选择策略（skip / update_meta / overwrite_stock），但第一版应保守

### 4.3 后续可扩展策略（第二版+）

| 策略 | 说明 | 风险等级 |
|------|------|:---:|
| `skip` | 跳过已存在 SKU（第一版默认） | 🟢 低 |
| `update_meta` | 更新名称、分类、单位、位置，不更新库存 | 🟡 中 |
| `update_stock_add` | current_stock += CSV 值（入库场景） | 🟡 中 |
| `overwrite` | 完全覆盖（包括库存），需管理员确认 + 备份 | 🔴 高 |

---

## 五、行级错误处理方案

### 5.1 导入前置条件

正式导入前必须满足：

1. **preview 返回 `can_import === true`** — 后端 execute 接口重新执行解析校验，再次确认
2. **无结构性错误（global_errors 为空）** — 包括：表头缺失、字段重复映射、SKU 重复、编码异常
3. **无行级 error** — 任何一行的 P0 必填字段校验失败（空 SKU、空名称、空库存、非数字库存、负数库存）都阻止整批导入

### 5.2 错误分级

| 级别 | 说明 | 阻止导入？ | 示例 |
|------|------|:---:|------|
| **结构性错误** | CSV 文件级问题 | ✅ 是 | 缺少表头、编码异常、必填列缺失、字段重复映射 |
| **行级 error** | 某行 P0 字段校验失败 | ✅ 是 | SKU 为空、库存非数字、库存负数 |
| **行级 warning** | 某行存在非阻断性问题 | ❌ 否 | P1 字段暂不保存、库存口径提示、默认值填充 |
| **全局 warning** | 整表级提示 | ❌ 否 | 库存口径确认、P1/P2 字段识别、图片字段检测 |

### 5.3 事务策略

**第一版：全部成功或全部失败**

- 不支持"部分成功部分失败"
- 任一行为 error → 拒绝整批导入 → 不写入任何产品
- 原因：
  - 避免库存与审计复杂化
  - 简化错误排查（用户修复 CSV 后重新导入）
  - SQLite 事务天然支持原子性

---

## 六、事务与回滚方案

### 6.1 数据库事务

```python
# 伪代码（Step 9-5B 实现）
def execute_import(file, db, current_user):
    try:
        # 1. 重新解析校验（复用 _parse_and_validate_csv）
        preview = _parse_and_validate_csv(text, filename, encoding, db)
        if not preview["can_import"]:
            raise ImportNotAllowedError(preview["errors"])
        
        # 2. 过滤出可导入的行（status != 'error'）
        valid_rows = [r for r in preview["rows"] if r["status"] != "error"]
        
        # 3. 过滤掉数据库已存在 SKU（create_only 策略）
        existing_skus = {p.sku for p in db.query(Product.sku).all()}
        to_create = [r for r in valid_rows if r["normalized"]["sku"] not in existing_skus]
        skipped = [r for r in valid_rows if r["normalized"]["sku"] in existing_skus]
        
        # 4. 同一事务内批量写入
        for row in to_create:
            product = Product(...)
            db.add(product)
        
        # 5. 写入审计日志（同一事务）
        audit = AuditLog(...)
        db.add(audit)
        
        # 6. 提交事务
        db.commit()
        
    except Exception as e:
        # 7. 回滚整个事务
        db.rollback()
        raise
```

### 6.2 SQLite 事务能力

当前项目使用 SQLite + SQLAlchemy，SQLite 支持 `BEGIN` / `COMMIT` / `ROLLBACK` 事务语义。  
`SessionLocal = sessionmaker(autocommit=False)` 已关闭自动提交，满足事务需求。

### 6.3 导入前备份建议

正式导入执行前：

1. **前端二次确认弹窗**明确提示：「导入将写入数据，建议先在设置页执行数据库备份」
2. **后端不自动执行备份**，备份由管理员手动操作（Step 8 已实现 `POST /api/backups/manual`）
3. **后续版本可选**：后端自动在导入前执行一次快照备份（调用 backup 模块），作为额外安全措施

### 6.4 数据库文件锁注意事项

SQLite 为单写者模型。导入期间：
- 前端不重复提交导入请求（按钮置灰 + loading）
- 后端使用同一个 `Session` 完成解析→写入→审计→提交
- 如遇 `database is locked` 错误，返回明确提示并建议稍后重试

---

## 七、审计日志方案

### 7.1 审计事件类型

| 事件类型 | action_type | 触发时机 |
|----------|-------------|----------|
| 导入预览 | `PRODUCT_IMPORT_PREVIEW` | 每次调用 preview 接口时（后续可加） |
| **正式导入执行** | **`PRODUCTS_CSV_IMPORT`** | 正式导入完成后（无论成功或失败） |

### 7.2 审计日志记录内容

`PRODUCTS_CSV_IMPORT` 事件记录：

| 字段 | 来源 | 说明 |
|------|------|------|
| `action_type` | 固定值 | `"PRODUCTS_CSV_IMPORT"` |
| `operator` | `current_user.username` | 操作人用户名 |
| `timestamp` | `datetime.now()` | 操作时间（`YYYY-MM-DD HH:MM:SS`） |
| `details` | JSON 字符串 | 见下方 details 结构 |

**`details` JSON 结构**：

```json
{
  "batch_id": "imp-20260628-001",
  "file_name": "产品库存导入模板.csv",
  "file_encoding": "utf-8",
  "total_rows": 10,
  "created_count": 7,
  "skipped_count": 3,
  "warning_count": 5,
  "error_count": 0,
  "success": true,
  "mode": "create_only",
  "created_skus": ["SKU-001", "SKU-002", ...],
  "skipped_skus": ["SKU-EXIST-001", ...],
  "skipped_reasons": {
    "SKU-EXIST-001": "SKU 已存在于数据库"
  },
  "warnings_summary": [
    "识别到 P1 字段 5 个，暂不保存",
    "识别到异地库存字段，不计入本地库存"
  ],
  "p1_fields_archived": true
}
```

### 7.3 审计日志存储策略

- P1 字段原始值存储在 `details.p1_fields_archived` 中，待产品模型扩展后可检索并重新导入
- 导入批次 ID 格式：`imp-YYYYMMDD-NNN`（年月日-序号），支持按批次追溯
- 审计日志不记录 CSV 全部原始数据（防止 details 过大），仅记录摘要和关键 SKU

---

## 八、导入结果返回结构设计

### 8.1 成功响应

```json
{
  "success": true,
  "mode": "create_only",
  "batch_id": "imp-20260628-001",
  "file_name": "产品库存导入模板.csv",
  "file_encoding": "utf-8",
  "total_rows": 10,
  "created_count": 7,
  "skipped_count": 2,
  "warning_count": 5,
  "error_count": 0,
  "created_items": [
    {
      "row_number": 2,
      "sku": "SKU-001",
      "name": "乳胶手套",
      "product_id": "prod-000042"
    }
  ],
  "skipped_items": [
    {
      "row_number": 5,
      "sku": "SKU-EXIST-001",
      "name": "已存在产品",
      "reason": "SKU 已存在于数据库（prod-000010，名称: 已有产品A）"
    }
  ],
  "warnings": [
    "第 3 行：P1 字段 '品牌' 暂不保存",
    "第 4 行：识别到异地库存字段 'remote_stock'='50'，不计入本地真实库存",
    "第 7 行：当前库存 (1) ≤ 最低库存 (10)，导入后将处于「低库存」状态"
  ],
  "errors": [],
  "backup_reminder": "导入前未检测到近期备份。建议在设置页执行数据库备份后重新导入。"
}
```

### 8.2 失败响应

```json
{
  "success": false,
  "mode": "create_only",
  "batch_id": null,
  "file_name": "产品库存导入模板.csv",
  "file_encoding": "utf-8",
  "total_rows": 10,
  "created_count": 0,
  "skipped_count": 0,
  "warning_count": 0,
  "error_count": 3,
  "created_items": [],
  "skipped_items": [],
  "warnings": [],
  "errors": [
    "第 5 行：SKU 不能为空",
    "第 8 行：当前库存不是有效数字: 'abc'",
    "第 10 行：SKU 'SKU-001' 在 CSV 内重复出现（行: [2, 10]）"
  ],
  "detail": "导入失败：存在 3 个行级错误，请修正 CSV 后重新上传预览。未写入任何数据。"
}
```

### 8.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | bool | 导入是否成功 |
| `mode` | string | 当前模式：`"create_only"` |
| `batch_id` | string\|null | 批次 ID，失败时为 null |
| `file_name` | string | 上传文件名 |
| `file_encoding` | string | 检测到的文件编码 |
| `total_rows` | int | CSV 数据总行数 |
| `created_count` | int | 成功创建的产品数 |
| `skipped_count` | int | 跳过的行数（SKU 已存在等） |
| `warning_count` | int | 警告数 |
| `error_count` | int | 错误数（>0 则 success=false） |
| `created_items` | array | 新增产品列表（含 row_number, sku, name, product_id） |
| `skipped_items` | array | 跳过行列表（含 row_number, sku, name, reason） |
| `warnings` | string[] | 所有 warning 信息 |
| `errors` | string[] | 所有 error 信息 |
| `detail` | string\|null | 失败时的简要说明 |
| `backup_reminder` | string\|null | 备份提醒（如检测到近期无备份） |

---

## 九、后端 API 方案

### 9.1 接口定义

```
POST /api/imports/products/execute
```

**认证**：`require_admin`（仅管理员）

**请求**：`multipart/form-data`

| 参数 | 类型 | 说明 |
|------|------|------|
| `file` | File (.csv) | CSV 文件，与 preview 接口相同 |
| `mode` | string (可选) | 第一版固定 `"create_only"`，预留扩展 |
| `confirm` | bool (可选) | 二次确认标记，第一版可要求为 `true` |

**响应**：见第八章导入结果返回结构。

### 9.2 后端处理流程

```
1. 鉴权：require_admin
2. 读取文件 → 检测编码 → 解码
3. 调用 _parse_and_validate_csv() 重新解析校验
   （不信任前端预览结果，完全重新计算）
4. 检查 can_import：
   - false → 返回错误，不写入任何数据
   - true  → 继续
5. 过滤：
   - 排除 status='error' 的行
   - 排除数据库中已存在 SKU 的行（create_only 策略）
   - 收集 warning 行
6. 生成 batch_id：imp-YYYYMMDD-NNN
7. 同一事务内：
   a. 批量创建 Product 记录（仅 P0 字段）
   b. 创建 AuditLog 记录（action_type=PRODUCTS_CSV_IMPORT）
   c. commit
8. 失败时 rollback，返回错误详情
9. 返回成功响应
```

### 9.3 安全设计要点

| 要点 | 实现方式 |
|------|----------|
| 不信任前端预览结果 | 后端重新调用 `_parse_and_validate_csv()` |
| 防止重复导入 | 同一批次的 SKU 在事务内去重；已存在 SKU 跳过 |
| 防止并发写入冲突 | SQLite 单写者 + 同一 Session 内完成全部操作 |
| 防止超大文件 | 复用 MAX_FILE_SIZE_BYTES (2MB) 和 MAX_DATA_ROWS (1000) |
| 防止权限绕过 | `require_admin` 依赖，viewer 返回 403 |
| 审计可追溯 | 每条导入写入 AuditLog，含 batch_id |

### 9.4 批次 ID 生成规则

```
格式: imp-YYYYMMDD-NNN
示例: imp-20260628-001

NNN: 当日序号，从 001 开始递增
生成方式: 查询 AuditLog 中当日已存在的 PRODUCTS_CSV_IMPORT 记录数 + 1
```

### 9.5 验证码/确认标记（可选，第二版）

第一版可要求请求中带 `confirm: true` 标记，前端在二次确认后设置，后端校验。  
避免前端误触发或 API 直接调用跳过确认。

---

## 十、前端交互方案

### 10.1 按钮状态矩阵

| 角色 | 预览状态 | 按钮状态 | 显示文案 |
|------|----------|:---:|------|
| admin | 无预览结果 | 🔒 禁用 | 正式导入暂未开放（请先完成预览） |
| admin | 有预览结果，有 error | 🔒 禁用 | 正式导入暂未开放（存在阻断错误） |
| admin | 有预览结果，无 error（can_import=true） | 🟢 可点击 | 执行正式导入 |
| admin | 导入中 | 🔒 禁用 + spinner | 导入中... |
| admin | 导入完成 | 🔒 禁用 | 导入完成 |
| viewer | 任意 | 🔒 禁用（不可见或不显示） | 仅管理员可操作 |

### 10.2 二次确认弹窗设计

点击「执行正式导入」后弹出确认对话框，必须包含：

```
┌─────────────────────────────────────────────────┐
│  ⚠ 确认正式导入                                  │
│                                                  │
│  即将对 CSV 解析结果执行正式导入，请确认以下事项：  │
│                                                  │
│  ✅ 即将写入数据库                                │
│     将新增 {valid_count} 个产品到数据库            │
│                                                  │
│  ⚠ 仅导入本地真实库存（current_stock）            │
│     异地库存、虚拟库存、总可售库存不会写入         │
│                                                  │
│  ⚠ SKU 已存在的产品将被跳过，不会覆盖              │
│                                                  │
│  ⚠ 建议已在设置页完成数据库备份                    │
│     备份文件可在设置 → 备份管理 → 下载              │
│                                                  │
│  ⚠ 导入后无法撤销单条记录                         │
│     如需回滚，需使用备份文件恢复整个数据库          │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ ☐ 我已确认上述信息，并已在导入前完成备份      │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  [ 取消 ]           [ 确认导入，写入数据库 ]       │
└─────────────────────────────────────────────────┘
```

### 10.3 导入中状态

- 按钮变为「导入中...」+ spinner
- 页面其他操作不可用（阻止重复提交）
- 显示进度提示：「正在写入数据库，请勿关闭页面」

### 10.4 导入结果展示

导入完成后在预览结果下方展示导入结果卡片：

- **成功**：绿色横幅 + 创建数/跳过数/警告数 + 批次 ID
- **失败**：红色横幅 + 错误详情 +「未写入任何数据」说明
- 底部提供「返回预览」和「查看产品列表」链接

### 10.5 viewer 体验

- viewer 在 `/import-preview` 页面：上传按钮置灰，正式导入按钮不渲染（而非置灰）
- 文案：「当前角色为只读用户，仅可查看产品数据，不能导入。如需导入，请联系管理员操作。」

---

## 十一、第一版实现边界

### 11.1 明确包含（Scope）

| 功能 | 说明 |
|------|------|
| ✅ 新增不存在 SKU 的产品 | 仅 P0 字段写入 Product 表 |
| ✅ 整批原子提交 | 全部成功或全部失败 |
| ✅ 导入前重新解析校验 | 复用 `_parse_and_validate_csv()` |
| ✅ 跳过已存在 SKU | 记录 warning + skipped_items |
| ✅ 审计日志 | `PRODUCTS_CSV_IMPORT` 事件 |
| ✅ 二次确认弹窗 | 前端确认对话框含备份提醒 |
| ✅ admin 权限控制 | 后端 `require_admin` + 前端 `canWrite` |

### 11.2 明确不包含（Out of Scope）

| 功能 | 说明 |
|------|------|
| ❌ 自动覆盖已有产品 | 不更新已存在 SKU 的任何字段 |
| ❌ 部分成功部分失败 | 有 error → 全部不导入 |
| ❌ 导入异地/虚拟/总可售为真实库存 | STOCK_CONTEXT 字段不写入 |
| ❌ 复杂字段映射配置 | 固定映射规则，不可自定义 |
| ❌ 导入后撤销批次 | 不在第一版，后续作为 Step 9-5E 扩展 |
| ❌ 自动备份 | 导入前备份由管理员手动执行 |
| ❌ P1 字段写入 | 待产品模型扩展后（Step 9-2B 已定义扩展方案） |
| ❌ 大批量性能优化 | 上限 1000 行（与 preview 一致） |
| ❌ 异步导入 | 同步处理，1000 行以内 SQLite 可承受 |

---

## 十二、风险清单

| # | 风险 | 等级 | 缓解措施 |
|---|------|:---:|------|
| 1 | **重复 SKU 误覆盖** | 🔴 高 | 第一版仅 `create_only`，不覆盖；已存在 SKU 在 preview 阶段标记 error |
| 2 | **库存口径误合并** | 🔴 高 | 仅导入 P0 current_stock；STOCK_CONTEXT 字段不入库；前端确认弹窗明确提示 |
| 3 | **半批导入失败** | 🔴 高 | 数据库事务保证原子性；全部成功或全部失败 |
| 4 | **权限绕过** | 🔴 高 | 后端 `require_admin` 依赖；前端按钮对 viewer 不渲染；API 直接调用也需 admin token |
| 5 | **CSV 编码异常导致乱码** | 🟡 中 | 复用 preview 的 `_detect_encoding()` 多编码探测（UTF-8-SIG / UTF-8 / GBK / GB18030） |
| 6 | **空值导致脏数据** | 🟡 中 | P0 必填字段（sku/name/current_stock）空值 = error，阻止导入 |
| 7 | **审计日志缺失** | 🟡 中 | 审计日志与导入在同一事务内写入；写入失败则回滚全部 |
| 8 | **用户误以为预览已写入** | 🟡 中 | 预览页多处「只读预览·未写库」标识；正式导入需二次确认 |
| 9 | **导入前未备份** | 🟡 中 | 二次确认弹窗明确提示备份；返回结果含 `backup_reminder` |
| 10 | **大文件性能问题** | 🟢 低 | 限制 2MB / 1000 行；SQLite 在此范围内可承受同步写入 |
| 11 | **并发导入冲突** | 🟢 低 | SQLite 单写者模型天然排队；前端按钮 loading 状态阻止重复提交 |
| 12 | **批次 ID 冲突** | 🟢 低 | 批次 ID 基于当日审计日志计数生成，同一事务内唯一 |

---

## 十三、后续 Step 拆分建议

| Step | 内容 | 类型 | 预估影响 |
|------|------|:---:|------|
| **Step 9-5B** | 后端正式导入接口 `POST /api/imports/products/execute` | 后端实现 | `apps/api/routers/imports.py` 新增路由 |
| **Step 9-5C** | 前端正式导入按钮与结果展示 | 前端实现 | `src/pages/ProductImportPreview.jsx` + `src/services/importService.js` |
| **Step 9-5D** | 审计日志与备份提示收口 | 前后端 | 审计日志完善 + 备份检测逻辑 |
| **Step 9-5E** | 人工验收与边界测试 | 测试验收 | 测试 CSV + 边界用例 |

**建议执行顺序**：9-5B → 9-5C → 9-5D → 9-5E（不可并行，后端接口必须先完成）

---

## 十四、验收标准

### 14.1 本轮（Step 9-5A）验收标准

| # | 验收项 | 预期结果 |
|---|--------|----------|
| 1 | 只新增/更新文档 | ✅ `docs/Step-9-5A-产品CSV正式导入执行方案.md` + `docs/第四阶段开发记录.txt` |
| 2 | 不新增写库代码 | ✅ 无任何 `.py` / `.jsx` 写入逻辑 |
| 3 | 不新增后端 API | ✅ `imports.py` 仅含 preview 路由 |
| 4 | 不修改正式导入按钮为可用 | ✅ 按钮保持 `disabled` |
| 5 | `npm run build` | ✅ 通过（如涉及前端文件改动则验证；仅改文档可不强制） |
| 6 | `git status` | ✅ 仅文档改动 |
| 7 | 文档清楚说明正式导入执行方案 | ✅ 本文档覆盖全部十四章节 |

### 14.2 后续 Step 9-5B~9-5E 验收标准（预留）

详见各 Step 的执行文档。

---

## 附录 A：与现有代码的关系

| 现有代码 | 与正式导入的关系 |
|----------|-----------------|
| `apps/api/routers/imports.py::_parse_and_validate_csv()` | **直接复用**，execute 调用同一函数重新解析校验 |
| `apps/api/routers/imports.py::_validate_field()` | 复用字段校验逻辑 |
| `apps/api/database.py::Product` | 导入目标表，仅写入 P0 字段 |
| `apps/api/database.py::AuditLog` | 导入审计记录目标表 |
| `apps/api/routers/products.py::create_product()` | **不复用**，execute 批量创建不走单条 API |
| `apps/api/auth.py::require_admin` | 直接复用权限依赖 |
| `apps/api/routers/backups.py` | 备份能力已就绪，导入前由管理员手动调用 |
| `src/pages/ProductImportPreview.jsx` | 导入按钮 + 二次确认弹窗 + 结果展示的承载页面 |
| `src/services/importService.js` | 新增 `executeProductImport()` 函数 |

---

## 附录 B：P0 字段与 Product 表映射速查

| CSV 规范字段 | Product 表列 | 类型 | 必填 |
|-------------|-------------|------|:---:|
| `sku` | `sku` | String(50) | ✅ |
| `name` | `name` | String(100) | ✅ |
| `current_stock` | `current_stock` | Integer | ✅ |
| `min_stock` | `min_stock` | Integer | 否（默认 0） |
| `category` | `category` | String(50) | 否（默认"耗材"） |
| `unit` | `unit` | String(20) | 否（默认"个"） |
| `location` | `location` | String(100) | 否（默认""） |

*注：`status` 和 `last_updated` 由系统自动计算，不从 CSV 读取。*

---

*文档版本：v1.0*  
*生成日期：2026-06-28*  
*对应 Step：9-5A（方案设计）*  
*状态：待人工审核确认*
