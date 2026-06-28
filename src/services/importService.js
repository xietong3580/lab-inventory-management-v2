/**
 * 导入服务
 * 处理产品 CSV 导入预览与正式导入 API 调用
 *
 * 后端接口:
 * - POST /api/imports/products/preview   — 预览（解析+校验，不写库）
 * - POST /api/imports/products/execute   — 正式导入（create_only 模式）
 */

import { getToken } from './authService';

const API_BASE = 'http://localhost:8001/api';

/**
 * 文件大小限制（字节）
 */
export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * 允许的文件扩展名
 */
const ALLOWED_EXTENSIONS = ['.csv'];

/**
 * 前端文件校验（辅助性，最终校验以后端为准）
 *
 * @param {File} file - 用户选择的文件
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateImportFile(file) {
  if (!file) {
    return { valid: false, error: '请选择文件' };
  }

  const fileName = file.name.toLowerCase();

  // 检查扩展名
  const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) =>
    fileName.endsWith(ext)
  );
  if (!hasValidExtension) {
    return {
      valid: false,
      error: `请选择 CSV 文件（当前文件: ${file.name}）`,
    };
  }

  // 检查文件大小
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `文件过大（${sizeMB} MB），建议不超过 2 MB`,
    };
  }

  return { valid: true };
}

/**
 * 格式化文件大小
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

/**
 * 创建产品 CSV 导入预览
 *
 * 向后端 POST /api/imports/products/preview 上传 CSV 文件，
 * 获取解析和校验结果（不执行实际导入）。
 *
 * @param {File} file - CSV 文件
 * @returns {Promise<{
 *   success: boolean,
 *   filename: string,
 *   preview: {
 *     total_rows: number,
 *     valid_rows: number,
 *     error_rows: number,
 *     warning_rows: number,
 *     can_import: boolean,
 *     recognized_p0: string[],
 *     recognized_p1: string[],
 *     recognized_p2: string[],
 *     ignored: string[],
 *     rows: Array<{
 *       row_number: number,
 *       status: 'valid'|'error'|'warning',
 *       normalized: object,
 *       p1_fields: object,
 *       inventory_context: object|null,
 *       errors: string[],
 *       warnings: string[]
 *     }>
 *   }
 * }>}
 */
export async function previewProductImport(file) {
  const token = getToken();
  if (!token) {
    throw new Error('未登录');
  }

  // 构建 FormData，字段名与后端一致
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/imports/products/preview`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      // 不手动设置 Content-Type，浏览器会自动设置带 boundary 的 multipart/form-data
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    if (response.status === 401) {
      throw new Error('鉴权失败，请重新登录');
    }
    if (response.status === 403) {
      throw new Error('仅管理员可进行数据导入预览');
    }
    if (response.status === 400) {
      throw new Error(errorData.detail || '请求参数有误，请检查文件格式');
    }
    if (response.status === 500) {
      throw new Error(errorData.detail || '服务器内部错误，请稍后重试');
    }

    throw new Error(errorData.detail || `导入预览失败 (${response.status})`);
  }

  return response.json();
}

/**
 * 执行产品 CSV 正式导入
 *
 * 向后端 POST /api/imports/products/execute 上传 CSV 文件并执行导入。
 * 后端会重新解析校验 CSV，不信任前端预览结果。
 * 仅 create_only 模式：新增不存在 SKU，跳过已存在 SKU。
 *
 * @param {File} file - CSV 文件
 * @param {Object} options
 * @param {string} options.mode - 导入模式，当前固定 "create_only"
 * @param {boolean} options.confirmBackup - 是否已确认数据库备份
 * @returns {Promise<{
 *   success: boolean,
 *   mode: string,
 *   batch_id: string|null,
 *   file_name: string,
 *   file_encoding: string,
 *   total_rows: number,
 *   created_count: number,
 *   skipped_count: number,
 *   warning_count: number,
 *   error_count: number,
 *   created_items: Array<{row_number:number, sku:string, name:string, product_id:string}>,
 *   skipped_items: Array<{row_number:number, sku:string, name:string, reason:string}>,
 *   warnings: string[],
 *   errors: string[],
 *   detail: string|null,
 *   backup_reminder: string|null
 * }>}
 */
export async function executeProductImport(file, options = {}) {
  const token = getToken();
  if (!token) {
    throw new Error('未登录');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', options.mode || 'create_only');
  formData.append('confirm_backup', options.confirmBackup === true ? 'true' : 'false');

  const response = await fetch(`${API_BASE}/imports/products/execute`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('鉴权失败，请重新登录');
    }
    if (response.status === 403) {
      throw new Error('当前角色无正式导入权限，仅管理员可执行导入');
    }
    if (response.status === 400) {
      throw new Error(data.detail || '请求参数有误');
    }
    if (response.status === 500) {
      throw new Error(data.detail || '服务器内部错误，请稍后重试');
    }
    throw new Error(data.detail || `导入执行失败 (${response.status})`);
  }

  return data;
}

export default {
  previewProductImport,
  executeProductImport,
  validateImportFile,
  formatFileSize,
  MAX_FILE_SIZE,
};
