/**
 * 前端图片文件基础校验（纯函数）
 * 仅做格式与大小提示，后端仍会重新做真实内容校验，前端校验不作为安全边界。
 */

export const IMAGE_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
export const IMAGE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * 校验图片文件，返回 { valid, reason }。
 * @param {File|null|undefined} file
 * @returns {{valid: boolean, reason: string}}
 */
export function validateImageFile(file) {
  if (!file) {
    return { valid: false, reason: '未选择文件' };
  }

  // 大小校验
  if (file.size === 0) {
    return { valid: false, reason: '文件为空' };
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return { valid: false, reason: '图片大小超过 5MB 限制' };
  }

  // 扩展名校验（仅作提示，后端会校验真实内容）
  const name = (file.name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  if (!IMAGE_ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, reason: '仅支持 JPG / PNG / WebP 格式' };
  }

  // MIME 校验（仅作提示）
  if (file.type && !IMAGE_ALLOWED_MIME.includes(file.type)) {
    return { valid: false, reason: '仅支持 JPG / PNG / WebP 格式' };
  }

  return { valid: true, reason: '' };
}

/**
 * 根据文件扩展名返回提示文案中的格式说明
 */
export function formatImageHint() {
  return '支持 JPG / PNG / WebP，最大 5MB';
}

/**
 * 构建"产品已创建，但图片上传失败"提示文案（纯函数）。
 * 用于新增产品后图片上传失败的明确提示，避免被"保存成功"覆盖。
 * @param {string} reason - 图片上传失败原因
 * @returns {string}
 */
export function buildProductImageUploadErrorText(reason) {
  const detail = reason && String(reason).trim() ? String(reason).trim() : '未知错误';
  return `产品已创建，但图片上传失败：${detail}`;
}
