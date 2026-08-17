"""
库存自动化管理系统 V2 - 后端 API 服务
基于 FastAPI + SQLite 的最小数据底座起步版
"""

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from database import init_db
from routers import products, transactions, audit_logs, dashboard, users, auth, backups, imports, maintenance, product_images

# 创建 FastAPI 应用
app = FastAPI(
    title="库存自动化管理系统 V2 API",
    description="第六阶段整包（真实数据底座起步版）",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# 配置 CORS（允许前端访问）
# 从 INVENTORY_CORS_ORIGINS 读取逗号分隔的来源列表：
#   - 未设置环境变量（None）：使用本地开发默认值（兼容现有启动方式）
#   - 设置为空字符串：不开放任何跨域来源（生产同源部署推荐）
#   - 设置为具体值：按逗号分隔、去空格、排除空项
_cors_origins_env = os.getenv("INVENTORY_CORS_ORIGINS")
if _cors_origins_env is None:
    _allow_origins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:5174",
        "http://localhost:5175",
    ]
else:
    _allow_origins = [
        o.strip()
        for o in _cors_origins_env.split(",")
        if o.strip()
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化数据库
init_db()

# 注册路由
app.include_router(products.router, prefix="/api/products", tags=["产品管理"])
app.include_router(product_images.router, prefix="/api/products", tags=["产品图片"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["交易记录"])
app.include_router(audit_logs.router, prefix="/api/audit-logs", tags=["审计日志"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["仪表盘"])
app.include_router(users.router, prefix="/api/users", tags=["用户管理"])
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(backups.router, prefix="/api/backups", tags=["备份管理"])
app.include_router(imports.router, prefix="/api/imports", tags=["数据导入"])
app.include_router(maintenance.router, prefix="/api/maintenance", tags=["系统维护"])

@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "库存自动化管理系统 V2 API",
        "version": "1.0.0",
        "docs": "/api/docs",
        "status": "running"
    }

@app.get("/api/health")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy", "service": "inventory-api"}

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=os.getenv("APP_RELOAD", "false").lower() == "true",
    )
