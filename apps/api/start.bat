@echo off
echo 正在启动库存管理系统后端 API 服务...
echo.

REM 检查Python
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 Python。请安装 Python 3.8+ 并确保在 PATH 中。
    pause
    exit /b 1
)

REM 检查依赖
if not exist "requirements.txt" (
    echo 错误: 未找到 requirements.txt
    pause
    exit /b 1
)

echo 检查依赖安装...
pip list | findstr fastapi >nul 2>&1
if errorlevel 1 (
    echo 正在安装依赖...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo 错误: 依赖安装失败
        pause
        exit /b 1
    )
)

REM 检查数据库
if not exist "inventory.db" (
    echo 数据库不存在，正在初始化...
    python seed.py
    if errorlevel 1 (
        echo 警告: 数据库初始化失败，但将继续启动
    )
)

echo.
echo 启动 FastAPI 服务...
echo API 文档: http://localhost:8000/api/docs
echo 健康检查: http://localhost:8000/api/health
echo 按 Ctrl+C 停止服务
echo.

python main.py

if errorlevel 1 (
    echo 错误: 服务启动失败
    pause
    exit /b 1
)