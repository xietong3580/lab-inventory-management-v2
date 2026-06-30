/**
 * 备份服务
 * 处理数据库手动备份 API 调用
 */

import { getToken } from './authService';

const API_BASE = '/api';

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

/**
 * 运行备份前安全检查（所有登录用户可访问）
 * @returns {Promise<{
 *   database_exists: boolean,
 *   database_readable: boolean,
 *   backup_dir_exists: boolean,
 *   backup_dir_writable: boolean,
 *   products_count: number,
 *   transactions_count: number,
 *   audit_logs_count: number,
 *   negative_stock_count: number,
 *   transactions_missing_product_id_count: number,
 *   transactions_orphan_product_id_count: number,
 *   duplicate_sku_count: number,
 *   status: 'ok' | 'warning' | 'error',
 *   warnings: string[],
 *   errors: string[]
 * }>}
 */
export async function runPreflightCheck() {
  const token = getToken();
  if (!token) {
    throw new Error('未登录');
  }

  const response = await fetch(`${API_BASE}/maintenance/preflight`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `安全检查请求失败 (${response.status})`);
  }

  return response.json();
}

/**
 * 创建数据库物理备份（仅管理员可用）
 * @returns {Promise<{
 *   success: boolean,
 *   filename: string,
 *   path: string,
 *   size_bytes: number,
 *   created_at: string,
 *   message: string
 * }>}
 */
export async function createMaintenanceBackup() {
  const token = getToken();
  if (!token) {
    throw new Error('未登录');
  }

  const response = await fetch(`${API_BASE}/maintenance/backups`, {
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
      throw new Error('需要管理员权限才能创建备份');
    }
    throw new Error(errorData.detail || `创建备份请求失败 (${response.status})`);
  }

  return response.json();
}

/**
 * 获取正式导入前测试业务数据清空预览（所有登录用户可访问，只读）
 * @returns {Promise<{
 *   success: boolean,
 *   summary: {
 *     products: number,
 *     transactions: number,
 *     ledger_records: number,
 *     audit_logs: number,
 *     low_stock_products: number
 *   },
 *   will_clear: Array<{ key: string, name: string, count: number, description: string }>,
 *   will_keep: Array<{ key: string, name: string, count: number, description: string }>,
 *   warnings: string[]
 * }>}
 */
export async function getResetPreview() {
  const token = getToken();
  if (!token) {
    throw new Error('未登录');
  }

  const response = await fetch(`${API_BASE}/maintenance/reset-preview`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `清空预览请求失败 (${response.status})`);
  }

  return response.json();
}

/**
 * 清空测试业务数据（仅管理员可用，需确认短语完全匹配）
 * @param {string} confirmation - 确认短语，必须为「清空测试业务数据」
 * @returns {Promise<{
 *   success: boolean,
 *   message: string,
 *   backup: { filename: string, size_bytes: number, created_at: string },
 *   before: { products: number, transactions: number, ledger_records: number, audit_logs: number, low_stock_products: number },
 *   after: { products: number, transactions: number, ledger_records: number, audit_logs: number, low_stock_products: number },
 *   preflight: {
 *     database_exists: boolean, database_readable: boolean,
 *     backup_dir_exists: boolean, backup_dir_writable: boolean,
 *     products_count: number, transactions_count: number, audit_logs_count: number,
 *     negative_stock_count: number, transactions_missing_product_id_count: number,
 *     transactions_orphan_product_id_count: number, duplicate_sku_count: number,
 *     status: 'ok' | 'warning' | 'error', warnings: string[], errors: string[]
 *   },
 *   warnings: string[]
 * }>}
 */
export async function resetBusinessData(confirmation) {
  const token = getToken();
  if (!token) {
    throw new Error('未登录');
  }

  const response = await fetch(`${API_BASE}/maintenance/reset-business-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ confirmation }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 403) {
      throw new Error('需要管理员权限才能执行清空操作');
    }
    throw new Error(errorData.detail || `清空请求失败 (${response.status})`);
  }

  return response.json();
}
