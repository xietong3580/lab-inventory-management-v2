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

/**
 * 获取备份文件列表（仅管理员可用）
 * @returns {Promise<{
 *   success: boolean,
 *   items: Array<{
 *     filename: string,
 *     relative_path: string,
 *     size_bytes: number,
 *     created_at: string,
 *     integrity_check: string
 *   }>,
 *   count: number,
 *   message: string
 * }>}
 */
export async function getBackups() {
  const token = getToken();
  if (!token) {
    throw new Error('未登录');
  }

  const response = await fetch(`${API_BASE}/backups`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 403) {
      throw new Error('需要管理员权限才能查看备份列表');
    }
    throw new Error(errorData.detail || `获取备份列表失败 (${response.status})`);
  }

  return response.json();
}

/**
 * 下载备份文件（仅管理员可用）
 * @param {string} filename - 备份文件名
 * @returns {Promise<Blob>} 文件 Blob，由调用方创建下载链接
 */
export async function downloadBackup(filename) {
  const token = getToken();
  if (!token) {
    throw new Error('未登录');
  }

  const encodedFilename = encodeURIComponent(filename);
  const response = await fetch(`${API_BASE}/backups/${encodedFilename}/download`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 403) {
      throw new Error('需要管理员权限才能下载备份文件');
    }
    throw new Error(errorData.detail || `下载备份文件失败 (${response.status})`);
  }

  return response.blob();
}
