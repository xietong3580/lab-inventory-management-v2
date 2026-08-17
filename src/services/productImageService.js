/**
 * 产品主图服务
 * 上传、删除、获取产品主图（通过 Authorization 携带令牌，复用现有鉴权结构）
 */

import { getToken } from './authService';

const API_BASE = '/api';

function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * 解析错误响应，返回友好错误信息
 */
async function parseError(response, fallback) {
  try {
    const data = await response.json();
    if (data && data.detail) return data.detail;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * 上传/替换产品主图（仅 admin）
 * @param {string} productId - 产品 ID（如 prod-000001）
 * @param {File} file - 图片文件
 * @returns {Promise<{product_id: string, has_image: boolean, image_updated_at: string, action: string}>}
 */
export async function uploadProductImage(productId, file) {
  const token = getToken();
  if (!token) throw new Error('未登录');

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/products/${encodeURIComponent(productId)}/image`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 403) throw new Error('需要管理员权限才能上传图片');
    throw new Error(await parseError(response, `图片上传失败 (${response.status})`));
  }

  return response.json();
}

/**
 * 删除产品主图（仅 admin）
 * @param {string} productId - 产品 ID
 * @returns {Promise<{product_id: string, has_image: boolean, message: string}>}
 */
export async function deleteProductImage(productId) {
  const token = getToken();
  if (!token) throw new Error('未登录');

  const response = await fetch(`${API_BASE}/products/${encodeURIComponent(productId)}/image`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 403) throw new Error('需要管理员权限才能删除图片');
    throw new Error(await parseError(response, `图片删除失败 (${response.status})`));
  }

  return response.json();
}

/**
 * 获取产品主图 Blob（登录用户均可）
 * 通过 Authorization 携带令牌，避免明文公开图片目录。
 *
 * @param {string} productId - 产品 ID
 * @param {string} version - 图片版本（imageUpdatedAt），作为查询参数用于缓存失效
 * @returns {Promise<Blob|null>} 图片 Blob；无图片返回 null
 */
export async function fetchProductImageBlob(productId, version) {
  const token = getToken();
  if (!token) return null;

  const query = version ? `?v=${encodeURIComponent(version)}` : '';
  const response = await fetch(`${API_BASE}/products/${encodeURIComponent(productId)}/image${query}`, {
    headers: getAuthHeaders(),
  });

  // 无图片 / 文件不存在 → 返回 null，由调用方显示占位
  if (response.status === 404) return null;
  if (!response.ok) return null;

  return response.blob();
}
