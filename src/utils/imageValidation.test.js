// imageValidation 纯函数测试
// 使用 Node.js 内置 test runner: node --test src/utils/imageValidation.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateImageFile,
  IMAGE_ALLOWED_EXTENSIONS,
  IMAGE_ALLOWED_MIME,
  IMAGE_MAX_BYTES,
  formatImageHint,
  buildProductImageUploadErrorText,
} from './imageValidation.js';

// 构造模拟 File 对象
function makeFile(name, size, type = '') {
  return { name, size, type };
}

describe('validateImageFile - 合法文件', () => {
  it('should accept valid JPG', () => {
    const r = validateImageFile(makeFile('photo.jpg', 1000, 'image/jpeg'));
    assert.equal(r.valid, true);
    assert.equal(r.reason, '');
  });

  it('should accept valid PNG', () => {
    assert.equal(validateImageFile(makeFile('a.png', 1000, 'image/png')).valid, true);
  });

  it('should accept valid WebP (case-insensitive extension)', () => {
    assert.equal(validateImageFile(makeFile('a.WEBP', 1000, 'image/webp')).valid, true);
  });
});

describe('validateImageFile - 非法文件', () => {
  it('should reject empty file', () => {
    const r = validateImageFile(makeFile('a.png', 0, 'image/png'));
    assert.equal(r.valid, false);
    assert.equal(r.reason, '文件为空');
  });

  it('should reject file over 5MB', () => {
    const r = validateImageFile(makeFile('a.png', IMAGE_MAX_BYTES + 1, 'image/png'));
    assert.equal(r.valid, false);
    assert.match(r.reason, /5MB/);
  });

  it('should reject disallowed extension (svg/gif/exe)', () => {
    for (const name of ['a.svg', 'a.gif', 'a.exe', 'a.txt']) {
      const r = validateImageFile(makeFile(name, 1000, ''));
      assert.equal(r.valid, false, name);
      assert.match(r.reason, /JPG \/ PNG \/ WebP/);
    }
  });

  it('should reject wrong MIME', () => {
    const r = validateImageFile(makeFile('a.png', 1000, 'image/svg+xml'));
    assert.equal(r.valid, false);
  });

  it('should reject null/undefined', () => {
    assert.equal(validateImageFile(null).valid, false);
    assert.equal(validateImageFile(undefined).valid, false);
  });
});

describe('imageValidation - constants', () => {
  it('should include jpg/jpeg/png/webp in allowed extensions', () => {
    assert.deepEqual(IMAGE_ALLOWED_EXTENSIONS, ['jpg', 'jpeg', 'png', 'webp']);
    assert.deepEqual(IMAGE_ALLOWED_MIME, ['image/jpeg', 'image/png', 'image/webp']);
  });

  it('should expose 5MB limit', () => {
    assert.equal(IMAGE_MAX_BYTES, 5 * 1024 * 1024);
  });

  it('should return a hint string', () => {
    assert.match(formatImageHint(), /5MB/);
  });
});

describe('buildProductImageUploadErrorText - 部分失败提示', () => {
  it('should include the provided reason', () => {
    const text = buildProductImageUploadErrorText('图片大小超过 5MB 限制');
    assert.equal(text, '产品已创建，但图片上传失败：图片大小超过 5MB 限制');
  });

  it('should fall back to 未知错误 when reason is empty', () => {
    assert.equal(buildProductImageUploadErrorText(''), '产品已创建，但图片上传失败：未知错误');
    assert.equal(buildProductImageUploadErrorText(null), '产品已创建，但图片上传失败：未知错误');
    assert.equal(buildProductImageUploadErrorText(undefined), '产品已创建，但图片上传失败：未知错误');
    assert.equal(buildProductImageUploadErrorText('   '), '产品已创建，但图片上传失败：未知错误');
  });

  it('should trim whitespace from reason', () => {
    assert.equal(
      buildProductImageUploadErrorText('  上传失败  '),
      '产品已创建，但图片上传失败：上传失败'
    );
  });
});
