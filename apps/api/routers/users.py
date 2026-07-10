"""
用户管理 API 路由（Step 7-2：补全写接口）
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db, User, AuditLog
from auth import get_current_user, require_admin, get_password_hash
from schemas import UserCreate, UserUpdate, UserStatusUpdate, UserPasswordReset

router = APIRouter()

# 允许的角色值（仅英文，与 require_admin 保持一致）
ALLOWED_ROLES = {"admin", "viewer"}

# 默认管理员用户（数据库为空时的兜底数据）
DEFAULT_ADMIN = {
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "status": "活跃",
    "last_login": datetime.now().strftime("%Y-%m-%d %H:%M"),
}


# --- 工具函数 ---

def _parse_user_id(user_id: str) -> int:
    """解析前端格式的用户 ID（user-000001）为数据库整数 ID"""
    try:
        if user_id.startswith("user-"):
            return int(user_id[5:])
        return int(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="用户不存在")


def _get_user_or_404(db: Session, user_id: str) -> User:
    """根据前端格式 ID 获取用户，不存在则返回 404"""
    db_id = _parse_user_id(user_id)
    user = db.query(User).filter(User.id == db_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


def _count_active_admins(db: Session) -> int:
    """统计当前活跃管理员数量"""
    return db.query(User).filter(
        User.role == "admin",
        User.is_active == True,
    ).count()


# --- 现有只读接口（保持不变） ---

@router.get("/")
def get_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取用户列表（需登录）"""
    users = db.query(User).offset(skip).limit(limit).all()

    if users:
        return [user.to_dict() for user in users]

    # 数据库无用户时返回默认管理员（最小可用兜底）
    return [{
        "id": "user-default-admin",
        "username": DEFAULT_ADMIN["username"],
        "email": DEFAULT_ADMIN["email"],
        "role": DEFAULT_ADMIN["role"],
        "status": DEFAULT_ADMIN["status"],
        "lastLogin": DEFAULT_ADMIN["last_login"],
    }]


@router.get("/{user_id}")
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取单个用户（需登录）"""
    # 解析用户ID（格式：user-000001 或 user-default-admin）
    if user_id == "user-default-admin":
        return {
            "id": "user-default-admin",
            "username": DEFAULT_ADMIN["username"],
            "email": DEFAULT_ADMIN["email"],
            "role": DEFAULT_ADMIN["role"],
            "status": DEFAULT_ADMIN["status"],
            "lastLogin": DEFAULT_ADMIN["last_login"],
        }

    return _get_user_or_404(db, user_id).to_dict()


# --- Step 7-2 写接口 ---

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """新增用户（需管理员权限）"""
    # 校验 role 值
    if body.role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"无效的角色值: {body.role}，仅允许 admin 或 viewer",
        )

    # 校验 username 唯一性
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"用户名 '{body.username}' 已存在",
        )

    # 创建用户（密码通过 bcrypt 哈希存储）
    new_user = User(
        username=body.username,
        password_hash=get_password_hash(body.password),
        display_name=body.display_name or body.username,
        email=body.email or "",
        role=body.role,
        is_active=True,
        status="活跃",
    )
    db.add(new_user)
    db.flush()  # 获取自增 ID，确保审计日志与用户创建同一事务

    # Step 10-20D：审计日志
    operator = current_user.display_name or current_user.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    audit_log = AuditLog(
        action_type="USER_CREATE",
        product_name=new_user.username,
        product_id=f"user-{new_user.id:06d}",
        operator=operator,
        timestamp=now_str,
        details=f"新增用户：{new_user.username}，"
                f"显示名称: {new_user.display_name or new_user.username}，"
                f"角色: {new_user.role}",
    )
    db.add(audit_log)

    db.commit()
    db.refresh(new_user)

    return new_user.to_dict()


@router.put("/{user_id}")
def update_user(
    user_id: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """编辑用户信息（需管理员权限）"""
    user = _get_user_or_404(db, user_id)
    is_self = current_user.id == user.id

    # 校验 role 值
    if body.role is not None and body.role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"无效的角色值: {body.role}，仅允许 admin 或 viewer",
        )

    # 校验 username 唯一性（排除自身）
    if body.username is not None and body.username != user.username:
        existing = db.query(User).filter(User.username == body.username).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"用户名 '{body.username}' 已存在",
            )

    # 不允许将自己降级为 viewer
    new_role = body.role if body.role is not None else user.role
    if is_self and user.role == "admin" and new_role != "admin":
        raise HTTPException(
            status_code=400,
            detail="不允许将自己的角色降级为 viewer",
        )

    # 不允许将最后一个活跃管理员降级
    if user.role == "admin" and new_role != "admin" and user.is_active:
        if _count_active_admins(db) <= 1:
            raise HTTPException(
                status_code=400,
                detail="不允许将最后一个活跃管理员降级，系统必须保留至少一个管理员",
            )

    # 应用更新
    if body.username is not None:
        user.username = body.username
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.email is not None:
        user.email = body.email
    if body.role is not None:
        user.role = body.role

    # Step 10-20D：审计日志
    operator = current_user.display_name or current_user.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    audit_log = AuditLog(
        action_type="USER_UPDATE",
        product_name=user.username,
        product_id=user_id,
        operator=operator,
        timestamp=now_str,
        details=f"编辑用户：{user.username}，"
                f"显示名称: {user.display_name or user.username}，"
                f"角色: {user.role}",
    )
    db.add(audit_log)

    db.commit()
    db.refresh(user)

    return user.to_dict()


@router.patch("/{user_id}/status")
def update_user_status(
    user_id: str,
    body: UserStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """启用/停用用户（需管理员权限）"""
    user = _get_user_or_404(db, user_id)

    # 不允许停用自己
    if current_user.id == user.id and not body.is_active:
        raise HTTPException(
            status_code=400,
            detail="不允许停用自己",
        )

    # 不允许停用最后一个活跃管理员
    if user.role == "admin" and user.is_active and not body.is_active:
        if _count_active_admins(db) <= 1:
            raise HTTPException(
                status_code=400,
                detail="不允许停用最后一个活跃管理员，系统必须保留至少一个管理员",
            )

    # 同步更新 is_active 和 status 字段
    user.is_active = body.is_active
    user.status = "活跃" if body.is_active else "停用"

    # Step 10-20D：审计日志
    operator = current_user.display_name or current_user.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_status = "启用" if body.is_active else "停用"
    audit_log = AuditLog(
        action_type="USER_STATUS_CHANGE",
        product_name=user.username,
        product_id=user_id,
        operator=operator,
        timestamp=now_str,
        details=f"用户状态变更：{user.username} → {new_status}，"
                f"角色: {user.role}",
    )
    db.add(audit_log)

    db.commit()
    db.refresh(user)

    return user.to_dict()


@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """删除用户（仅管理员，严格防护）

    规则：
    1. 仅 admin 角色可删除
    2. 系统管理员 'admin' 永久保留，不可删除
    3. 不能删除自己
    4. 不允许删除最后一个活跃管理员
    5. 账号必须先停用才能删除
    """
    user = _get_user_or_404(db, user_id)

    # 系统管理员账号不可删除
    if user.username == "admin":
        raise HTTPException(
            status_code=400,
            detail="系统管理员账号不可删除",
        )

    # 不能删除自己
    if current_user.id == user.id:
        raise HTTPException(
            status_code=400,
            detail="不能删除当前登录账号",
        )

    # 必须先停用再删除
    if user.is_active:
        raise HTTPException(
            status_code=400,
            detail="请先停用该用户，再执行删除操作",
        )

    # 不允许删除最后一个活跃管理员（虽然已停用，但防御性检查）
    if user.role == "admin":
        active_admins = _count_active_admins(db)
        if active_admins < 1:
            raise HTTPException(
                status_code=400,
                detail="至少需要保留一个启用状态的管理员",
            )

    deleted_username = user.username
    deleted_role = user.role

    # 审计日志（在删除前记录）
    operator = current_user.display_name or current_user.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    audit_log = AuditLog(
        action_type="USER_DELETE",
        product_name=deleted_username,
        product_id=user_id,
        operator=operator,
        timestamp=now_str,
        details=f"删除用户：{deleted_username}，"
                f"角色: {deleted_role}，"
                f"操作人: {operator}",
    )
    db.add(audit_log)

    # 删除用户（审计日志在同一事务中）
    db.delete(user)
    db.commit()

    return {
        "message": f"用户「{deleted_username}」已删除",
        "deleted_username": deleted_username,
        "deleted_role": deleted_role,
    }


@router.patch("/{user_id}/password")
def reset_user_password(
    user_id: str,
    body: UserPasswordReset,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """管理员重置用户密码（需管理员权限）"""
    user = _get_user_or_404(db, user_id)

    # 使用与认证模块一致的 bcrypt 哈希
    user.password_hash = get_password_hash(body.new_password)

    # Step 10-20D：审计日志（不记录密码）
    operator = current_user.display_name or current_user.username
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    audit_log = AuditLog(
        action_type="USER_PASSWORD_RESET",
        product_name=user.username,
        product_id=user_id,
        operator=operator,
        timestamp=now_str,
        details=f"重置密码：{user.username}，"
                f"角色: {user.role}",
    )
    db.add(audit_log)

    db.commit()
    db.refresh(user)

    return user.to_dict()
