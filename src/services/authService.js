/**
 * 认证服务
 * 处理登录、登出、token 管理与用户信息持久化
 */

const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'auth_user',
};

const API_BASE = 'http://localhost:8001/api';

/**
 * 登录
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{access_token: string, token_type: string, user: object}>}
 */
export async function login(username, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `登录失败 (${response.status})`);
  }

  const data = await response.json();

  // 保存到 localStorage
  localStorage.setItem(STORAGE_KEYS.TOKEN, data.access_token);
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));

  return data;
}

/**
 * 登出
 */
export function logout() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
}

/**
 * 获取存储的 token
 * @returns {string|null}
 */
export function getToken() {
  return localStorage.getItem(STORAGE_KEYS.TOKEN);
}

/**
 * 获取存储的用户信息
 * @returns {object|null}
 */
export function getStoredUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 通过 token 获取当前用户信息（用于页面刷新后恢复登录态）
 * @returns {Promise<object>}
 */
export async function getMe() {
  const token = getToken();
  if (!token) {
    throw new Error('未登录');
  }

  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    // token 无效则清除本地状态
    if (response.status === 401 || response.status === 403) {
      logout();
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `认证失败 (${response.status})`);
  }

  const user = await response.json();

  // 更新 localStorage 中的用户信息
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));

  return user;
}
