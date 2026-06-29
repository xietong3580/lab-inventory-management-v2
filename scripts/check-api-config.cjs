/**
 * API 配置防回退检查 —— 仅检查 src/ 业务代码
 *
 * 务必确保前端业务代码（src/）一律使用 "/api" 相对路径。
 * 所有后端地址统一由 vite.config.js proxy 转发，不在业务代码中写死。
 *
 * ── 检查范围 ──
 * ✅ 检查：src/**​/*.{js,jsx,ts,tsx}
 * ✅ 检查：vite.config.js（仅允许 proxy target 包含 127.0.0.1:8000）
 *
 * ── 不检查（不属于 src 业务代码）──
 * ❌ .env / .env.example / .env.production  部署相关配置
 * ❌ docs/  文档
 * ❌ scripts/  本脚本自身
 * ❌ apps/api/  后端
 * ❌ node_modules/  依赖
 *
 * ── 未来的生产部署 ──
 * 本脚本只禁止在 src 业务代码中写死 localhost/127.0.0.1 本地地址。
 * 生产环境的 API 地址应通过以下方式配置（不在本脚本检查范围）：
 *   - import.meta.env.VITE_API_BASE_URL（Vite 环境变量）
 *   - .env.example 中的 VITE_API_BASE_URL 示例
 *   - Nginx / CDN 反向代理
 *
 * 用法：node scripts/check-api-config.cjs
 * 退出码：0 = 通过，1 = 发现硬编码地址
 */

const fs = require('fs');
const path = require('path');

// ── 禁止在 src/ 中出现的模式 ──────────────────────────
const FORBIDDEN_PATTERNS = [
  { pattern: /localhost:8001/,       label: 'localhost:8001' },
  { pattern: /127\.0\.0\.1:8001/,    label: '127.0.0.1:8001' },
  { pattern: /localhost:8000/,       label: 'localhost:8000' },
  { pattern: /127\.0\.0\.1:8000/,    label: '127.0.0.1:8000' },
  { pattern: /http:\/\/localhost/,   label: 'http://localhost' },
  { pattern: /http:\/\/127\.0\.0\.1/, label: 'http://127.0.0.1' },
];

// ── vite.config.js 允许的模式（仅 proxy target） ──────
const VITE_ALLOWED_PATTERNS = [
  { pattern: /127\.0\.0\.1:8000/, label: '127.0.0.1:8000 (vite proxy allowed)' },
];

// ── 扫描目录 ─────────────────────────────────────────
const SRC_DIR = path.resolve(__dirname, '..', 'src');
const VITE_CONFIG = path.resolve(__dirname, '..', 'vite.config.js');
const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

let violations = [];

/**
 * 递归收集 src/ 下所有业务代码文件
 */
function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 跳过 node_modules 等
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (EXTENSIONS.includes(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

/**
 * 检查单个文件，返回违规行数组 [{file, line, content, pattern}]
 */
function checkFile(filePath, forbidden) {
  const fileViolations = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, label } of forbidden) {
      if (pattern.test(line)) {
        fileViolations.push({
          file: path.relative(path.resolve(__dirname, '..'), filePath),
          line: i + 1,
          content: line.trim(),
          pattern: label,
        });
      }
    }
  }
  return fileViolations;
}

// ── 主逻辑 ────────────────────────────────────────────

// 1. 检查 src/ 目录
const srcFiles = collectFiles(SRC_DIR);
for (const file of srcFiles) {
  violations.push(...checkFile(file, FORBIDDEN_PATTERNS));
}

// 2. 检查 vite.config.js（仅允许 proxy target）
if (fs.existsSync(VITE_CONFIG)) {
  const viteFileViolations = checkFile(VITE_CONFIG, FORBIDDEN_PATTERNS);
  // 过滤掉允许的 proxy target 模式
  const filtered = viteFileViolations.filter((v) => {
    for (const { pattern } of VITE_ALLOWED_PATTERNS) {
      if (pattern.test(v.content)) return false; // 允许
    }
    return true; // 禁止
  });
  violations.push(...filtered);
}

// ── 输出结果 ──────────────────────────────────────────

if (violations.length === 0) {
  console.log('✅ API 配置检查通过：src/ 中未发现硬编码后端地址');
  process.exit(0);
}

console.log(`❌ API 配置检查失败：发现 ${violations.length} 处硬编码后端地址\n`);
console.log('以下文件写死了后端地址，请改为相对路径 /api + Vite proxy：\n');

for (const v of violations) {
  console.log(`  ${v.file}:${v.line}  ← ${v.pattern}`);
  console.log(`    ${v.content}`);
  console.log();
}

console.log('修复方法：');
console.log('  1. 将 API_BASE / BASE_URL 改为 "/api"（本地开发配合 Vite proxy）');
console.log('  2. 生产环境使用 import.meta.env.VITE_API_BASE_URL，不在 src 中写死地址');
console.log('  3. 确保 vite.config.js 中 server.proxy["/api"] 指向正确的后端地址');
console.log();

process.exit(1);
