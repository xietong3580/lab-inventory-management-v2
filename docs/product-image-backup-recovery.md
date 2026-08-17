# 产品主图备份与恢复说明

产品主图功能采用「SQLite 只保存相对文件名 + 文件系统保存图片文件」的方式。
数据库备份与图片备份使用同一时间戳，可明确配对。

## 备份文件

每次正式数据库备份会生成两类文件（同一时间戳）：

| 类型 | 文件名示例 | 内容 |
| --- | --- | --- |
| 数据库备份 | `inventory_backup_YYYYMMDD_HHMMSS.sqlite` | products 表（含 image_path / image_updated_at 字段） |
| 图片备份 | `product_images_backup_YYYYMMDD_HHMMSS.zip` | `uploads/product-images/` 下的全部图片文件 |

两个文件都位于 `apps/api/backups/` 目录。无图片时不会生成空 zip，返回结果中 `image_count = 0`。

## 恢复步骤

### 1. 恢复 SQLite 数据库

将 `inventory_backup_YYYYMMDD_HHMMSS.sqlite` 恢复到应用数据库位置：

- 停止应用（避免写入冲突）
- 用备份文件覆盖正式数据库文件（生产环境通常为服务器项目目录下的 `apps/api/inventory.db`）
- 建议先对当前数据库再做一次备份，避免误覆盖

### 2. 恢复图片文件

> **恢复前必须先停止 API 服务**，避免图片写入与数据库写入发生冲突。

ZIP 内部结构为 `product-images/<uuid>.webp`。正确解压方式（二选一）：

**方式 A（推荐）**：将 ZIP 解压到 `apps/api/uploads/`：

- 解压目标目录：`apps/api/uploads/`
- 解压后最终文件应位于：`apps/api/uploads/product-images/<uuid>.webp`

**方式 B**：如果解压工具选择「仅解压 ZIP 中的 `product-images` 目录内容」，
才可以直接解压到 `apps/api/uploads/product-images/`。

> 不要直接把整个 ZIP 解压到 `apps/api/uploads/product-images/`，
> 否则会产生双层 `product-images/product-images` 目录。

**恢复前务必先备份当前图片目录**，不允许未备份就直接覆盖：

```bash
# 先备份当前图片目录（存在时才执行）
if [ -d apps/api/uploads/product-images ]; then
  cp -a apps/api/uploads/product-images apps/api/uploads/product-images.pre-restore.$(date +%Y%m%d%H%M%S)
fi
```

### 3. 恢复后目录权限

- 目录需应用进程可读写、可进入；图片文件只读即可，不应设为可执行。
- 实际生产运行用户/用户组**必须在部署时检查后确定**，本文档不作假定。

```bash
# 以下 <app-user>/<app-group> 仅为占位，部署时替换为实际值
mkdir -p apps/api/uploads/product-images
chown -R <app-user>:<app-group> apps/api/uploads
# 目录 755（可进入/读写）
find apps/api/uploads -type d -exec chmod 755 {} \;
# 图片文件 644（可读，不可执行）
find apps/api/uploads/product-images -type f -exec chmod 644 {} \;
```

### 4. 检查数据库图片记录与实际文件是否匹配

启动应用后，在「设置 → 数据安全检查」运行安全检查（`GET /api/maintenance/preflight`），
关注以下只读统计：

- `image_referenced_count`：数据库中引用图片的产品数量
- `image_files_count`：图片目录内实际文件数量
- `image_missing_count`：数据库引用但文件缺失的数量（>0 需要补文件）
- `image_orphan_count`：文件存在但数据库未引用的孤立图片数量（>0 可后续清理）

- `image_missing_count` 为 0 且 `image_orphan_count` 为 0 表示数据库与文件完全匹配。
- 大量产品暂无图片（`image_referenced_count` 远小于 `products_count`）是正常状态，不算异常。

## 注意

- 数据库不保存绝对路径、base64 或二进制图片，只保存相对文件名。
- 删除/替换图片会安全清理图片目录内对应文件；清理失败只会留下孤立文件，不影响业务。
- 未在本说明覆盖范围内执行任何生产恢复操作。
