/**
 * 备份服务
 * 处理数据库手动备份 API 调用
 */

import { getToken } from './authService';

const API_BASE = 'http://localhost:8001/api';

/**
 * 格式化字节数为可读大小
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

/**
 * 手动触发数据库备份（仅管理员可用）
 * @returns {Promise<{
 *   success: boolean,
 *   filename: string,
 *   relative_path: string,
 *   size_bytes: number,
 *   created_at: string,
 *   integrity_check: string,
 *   message: string
 * }>}
 */
export async function createManualBackup() {
  const token = getToken();
  if (!token) {
    throw new Error('未登录');
  }

  const response = await fetch(`${API_BASE}/backups/manual`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 403) {
      throw new Error('需要管理员权限才能执行备份操作');
    }
    throw new Error(errorData.detail || `备份请求失败 (${response.status})`);
  }

  return response.json();
}
