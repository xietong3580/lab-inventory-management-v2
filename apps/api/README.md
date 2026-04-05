# 库存自动化管理系统 V2 - 后端 API 服务

## 概述

这是库存自动化管理系统 V2 的后端 API 服务，基于 FastAPI + SQLite 构建。作为"第六阶段整包（真实数据底座起步版）"的核心组件。

## 功能特性

- ✅ 完整的 RESTful API 设计
- ✅ SQLite 数据库持久化
- ✅ 产品管理（增删改查）
- ✅ 交易记录、审计日志、仪表盘数据接口骨架
- ✅ CORS 支持（前端开发服务器可访问）
- ✅ 自动数据库初始化
- ✅ 种子数据导入

## 快速开始

### 1. 安装依赖

确保已安装 Python 3.8+，然后在 `apps/api` 目录下运行：

```bash
pip install -r requirements.txt
```

### 2. 初始化数据库

```bash
python seed.py
```

这将创建数据库文件 `inventory.db` 并导入示例数据。

### 3. 启动开发服务器

```bash
python main.py
```

服务器将在 `http://localhost:8000` 启动。

- API 文档: http://localhost:8000/api/docs
- 健康检查: http://localhost:8000/api/health

## API 接口

### 产品管理
- `GET /api/products` - 获取产品列表
- `POST /api/products` - 创建新产品
- `GET /api/products/{id}` - 获取产品详情
- `PUT /api/products/{id}` - 更新产品
- `DELETE /api/products/{id}` - 删除产品

### 其他接口（骨架）
- `GET /api/transactions` - 交易记录
- `GET /api/audit-logs` - 审计日志
- `GET /api/dashboard/stats` - 仪表盘数据

## 前端集成

前端已配置为支持两种数据源模式：

### Mock 模式（默认）
使用 localStorage 和 mock 数据，无需后端服务。

### API 模式
切换到真实后端 API：

```javascript
import { setDataSourceMode } from './services/dataService';

// 切换到 API 模式
setDataSourceMode('api');
```

前端会自动处理 API 请求失败，并降级到 mock 模式。

## 数据模型

### 产品 (Product)
```json
{
  "id": "prod-000001",
  "sku": "PRD-2026001",
  "name": "离心管 50mL",
  "category": "耗材",
  "currentStock": 125,
  "minStock": 50,
  "unit": "个",
  "location": "A区-3排-2层",
  "status": "正常",
  "lastUpdated": "2026-03-28"
}
```

### 交易记录 (Transaction)
```json
{
  "id": "txn-000001",
  "productName": "离心管 50mL",
  "type": "出库",
  "quantity": 120,
  "unit": "个",
  "date": "2026-03-29 14:30",
  "operator": "张三",
  "status": "completed",
  "notes": "实验室日常使用"
}
```

### 审计日志 (AuditLog)
```json
{
  "id": "log-000001",
  "actionType": "PRODUCT_ADD",
  "productName": "离心管 50mL",
  "productId": "prod-000001",
  "operator": "系统",
  "timestamp": "2026-03-29 14:30:00",
  "details": "{}"
}
```

## 开发说明

### 数据库迁移
当前使用 SQLite 文件数据库，文件位于 `inventory.db`。

### 添加新接口
1. 在 `routers/` 目录下创建新的路由文件
2. 在 `main.py` 中注册路由
3. 在 `database.py` 中添加数据模型（如果需要）

### 测试
启动后端服务后，访问 http://localhost:8000/api/docs 进行接口测试。

## 注意事项

1. 当前为开发阶段，未实现用户认证和权限控制
2. 交易记录和审计日志接口为骨架实现，需要后续完善
3. 前端默认使用 mock 模式，切换 API 模式前需确保后端服务已启动