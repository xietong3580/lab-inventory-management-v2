"""
库存自动化管理系统 V2 - 后端 API 服务
基于 FastAPI + SQLite 的最小数据底座起步版
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from database import init_db
from routers import products, transactions, audit_logs, dashboard

# 创建 FastAPI 应用
app = FastAPI(
    title="库存自动化管理系统 V2 API",
    description="第六阶段整包（真实数据底座起步版）",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# 配置 CORS（允许前端访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5174", "http://localhost:5175"],  # Vite 默认端口及可能端口
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化数据库
init_db()

# 注册路由
app.include_router(products.router, prefix="/api/products", tags=["产品管理"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["交易记录"])
app.include_router(audit_logs.router, prefix="/api/audit-logs", tags=["审计日志"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["仪表盘"])

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
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)