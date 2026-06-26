# Step 7 账号、权限、安全阶段验收清单

> 文档类型：阶段验收清单
> 创建日期：2026-06-26
> 当前最新稳定节点：`2289ae0 fix: unify viewer role display label`

---

## 一、本阶段已完成稳定提交

| 提交哈希 | 提交信息 |
|---|---|
| `39d4a98` | feat: add backend user management write APIs |
| `9cc2bea` | feat: add frontend user service APIs |
| `52eba1d` | feat: connect users page to real management APIs |
| `3ad4825` | feat: add password change and login tracking |
| `a59076f` | feat: add change password UI in settings |
| `2289ae0` | fix: unify viewer role display label |

---

## 二、已完成能力

### 用户认证与当前用户获取
- `POST /api/auth/login` — 登录，返回 `access_token` + `user`
- `GET /api/auth/me` — 通过 Bearer token 获取当前用户信息
- 前端 `authService.js` 封装 login / logout / getToken / getStoredUser / getMe
- `AuthProvider` + `ProtectedRoute` 路由守卫：未登录 → 重定向 `/login`
- 页面刷新后通过 `getMe()` 恢复登录态，token 无效则清空本地状态
- 退出登录清除 `auth_token` + `auth_user`，跳转 `/login`

### 后端 Users 写接口
- `POST /api/users` — 新增用户（admin only）
- `PUT /api/users/{user_id}` — 编辑用户信息（admin only）
- `PUT /api/users/{user_id}/status` — 启用/停用用户（admin only）
- `POST /api/users/{user_id}/reset-password` — 管理员重置用户密码（admin only）

### 前端 Users 真实管理
- `src/services/dataService.js` 中 `userService` 接入后端真实 API
- 用户列表、新增用户弹窗、编辑用户弹窗、状态切换、密码重置
- 表单校验：用户名、显示名、邮箱、角色、密码
- 弹窗结果反馈：成功/失败/loading/empty 状态覆盖

### admin / viewer 权限 UI 收口
- `usePermission()` hook 统一提供 `isAdmin` / `isViewer` / `canWrite` / `adminOnlyTitle`
- admin：所有菜单可见，所有写操作按钮可用
- viewer：写操作按钮置灰（`disabled` + `opacity-50` + tooltip"仅管理员可操作"）
- 出入库详情弹窗 viewer 可查看（`canViewTransactionDetail`）

### 后端真实权限拦截
- `get_current_user` 依赖注入，所有需要认证的端点自动校验 Bearer token
- admin-only 端点（用户管理写操作）通过 `require_admin` 依赖拦截
- 返回 `403 Forbidden` + `"仅管理员可操作"` 错误信息

### 修改自己密码
- 后端 `POST /api/auth/change-password` — 当前用户修改自己的密码
  - 请求体：`{ old_password, new_password }`
  - 校验：当前密码正确 → 更新为新密码 → 返回 `{ message: "密码修改成功" }`
  - 失败：`400` + `{ detail: "当前密码错误" }`
- 前端 `authService.changePassword(oldPassword, newPassword)`
- Settings 页面「账号安全 / 修改密码」卡片
  - 三个输入框：当前密码、新密码（≥6位）、确认新密码
  - 前端校验：必填、长度、一致性
  - 成功提示："密码修改成功，请牢记新密码"，清空输入框
  - 失败提示：后端错误信息或兜底"密码修改失败，请检查当前密码后重试"
  - admin 和 viewer 均可使用，不限制角色
  - 修改成功后不退出登录、不移除 token

### 登录成功更新 last_login
- 登录时后端自动记录 `last_login` 时间戳

### role 默认值与中文显示收口
- 内部存储保持英文值 `admin` / `viewer`
- 全局中文映射统一：
  - `admin` → **管理员**
  - `viewer` → **只读用户**
- 映射表统一来源：`src/contexts/AuthContext.jsx` 中 `ROLE_LABELS`
- Header 顶部栏、Users 管理页角色标签、用户新增/编辑弹窗下拉选项全部统一

---

## 三、admin 权限边界

| 能力 | 状态 |
|---|---|
| 查看所有菜单（Dashboard / Products / Transactions / Alerts / Users / AuditLog / Settings） | ✅ |
| 新增用户 | ✅ |
| 编辑用户（用户名/显示名/邮箱/角色） | ✅ |
| 启用/停用用户 | ✅ |
| 重置用户密码 | ✅ |
| 执行产品写操作（新增/编辑/删除） | ✅ |
| 执行出入库写操作 | ✅ |
| 修改系统设置 | ✅ |
| 数据备份/重置等维护操作 | ✅ |
| 查看所有页面详情（出入库详情弹窗等） | ✅ |
| 修改自己的密码 | ✅ |

---

## 四、viewer 权限边界

| 能力 | 状态 |
|---|---|
| 查看 Dashboard | ✅ |
| 查看 Products 列表 | ✅ |
| 查看 Transactions 列表 | ✅ |
| 查看 Alerts | ✅ |
| 查看出入库详情弹窗 | ✅ |
| 修改自己的密码 | ✅ |
| 写操作按钮置灰（disabled + tooltip） | ✅ |
| 后端写操作 API 拦截（403） | ✅ |
| 新增/编辑/删除产品 | ❌ |
| 新增/编辑/停用/重置用户 | ❌ |
| 执行出入库写操作 | ❌ |
| 查看 Users 管理页 | ❌ |
| 修改系统设置 | ❌ |
| 数据备份/重置等维护操作 | ❌ |
| 数据导出 | ❌ |

---

## 五、已人工验收结果

| 验收项 | 结果 |
|---|---|
| admin 登录 → Users 管理功能正常（新增/编辑/停用/重置密码） | ✅ 通过 |
| viewer 登录 → 写操作按钮置灰 + tooltip 正常 | ✅ 通过 |
| viewer 登录 → Users 页面不可见、后端写操作返回 403 | ✅ 通过 |
| Settings 修改密码 → 前端校验正常（空/短/不一致拦截） | ✅ 通过 |
| Settings 修改密码 → 当前密码错误提示正常 | ✅ 通过 |
| Settings 修改密码 → 当前密码正确则成功提示 + 输入框清空 | ✅ 通过 |
| 修改密码成功后不退出登录 | ✅ 通过 |
| admin / viewer 密码均已改回默认测试密码 | ✅ 确认 |
| Header 角色显示统一（管理员/只读用户） | ✅ 通过 |
| 退出登录 → localStorage 清空 → 跳转 /login | ✅ 通过 |
| 刷新页面 → 登录态保持正常 | ✅ 通过 |
| admin 写操作能力不受影响 | ✅ 通过 |
| viewer 只读限制不受影响 | ✅ 通过 |

---

## 六、当前仍需后续补齐

| 事项 | 优先级 | 说明 |
|---|---|---|
| 生产级密码策略增强 | 🟡 中 | 当前仅限制 ≥6 位，无复杂度要求（大小写/数字/特殊字符） |
| 登录失败次数限制 / 防暴力破解 | 🟡 中 | 当前无登录失败计数、无临时锁定、无验证码 |
| token 过期策略与刷新策略 | 🟡 中 | 当前 JWT token 无过期机制，无 refresh token 机制 |
| 操作审计日志接入真实用户身份 | 🟢 低 | 审计日志当前字段已预留 `operator_id` / `operator_name`，后续需确保真实写入 |
| 正式替换旧系统前的备份与数据迁移 | 🔴 高 | 包括 inventory.db 备份、旧系统数据导入、迁移脚本验证 |
| 导入导出 / 报表功能完善 | 🟡 中 | 当前仅有基础导出，需对接真实生产需求 |
| 部署验收 | 🔴 高 | 正式上线前需完成部署流程验证、环境配置检查 |

---

## 七、下一阶段建议

### 优先进入 Step 8：备份与数据安全底座

1. **数据库自动备份机制** — 定期备份 `inventory.db`，保留历史版本
2. **数据恢复与回滚验证** — 确保备份可成功恢复
3. **敏感数据保护** — 密码哈希存储（已有 bcrypt），确认无明文泄露风险
4. **部署环境安全检查** — 端口、CORS、HTTPS、环境变量等

### 不建议

- ❌ 不建议马上大范围 UI 打磨（当前企业风格已够用，先确保安全底座完整）
- ❌ 不建议跳过备份和迁移直接上线（正式替换旧系统前必须有回滚方案）

---

## 八、相关文件索引

| 关键文件 | 用途 |
|---|---|
| `src/services/authService.js` | 前端认证服务（login / logout / getMe / changePassword） |
| `src/contexts/AuthContext.jsx` | 认证上下文 + ProtectedRoute 路由守卫 + ROLE_LABELS 映射 |
| `src/hooks/usePermission.js` | 统一权限判断 hook |
| `src/components/layout/Header.jsx` | 顶部栏用户信息展示 + 退出按钮 |
| `src/pages/Login.jsx` | 登录页面 |
| `src/pages/Settings.jsx` | 系统设置页（含修改密码卡片） |
| `src/pages/Users.jsx` | 用户管理页 |
| `src/services/dataService.js` | 前端统一数据服务（含 userService） |
| `apps/api/routers/auth.py` | 后端认证路由（login / me / change-password） |
| `apps/api/routers/users.py` | 后端用户管理路由 |
| `apps/api/schemas.py` | 后端数据模型（ChangePassword / UserCreate / UserUpdate 等） |
| `apps/api/auth.py` | 后端认证依赖（get_current_user / require_admin） |
