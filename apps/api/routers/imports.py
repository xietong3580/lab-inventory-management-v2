"""
CSV 导入预览与校验 API 路由
Step 9-3A：后端 CSV 预览校验接口
Step 9-5B：后端 CSV 正式导入执行接口
补丁：本地真实库存 vs 异地/虚拟库存 口径风险提示
"""
import csv
import io
import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db, Product, User, AuditLog
from auth import get_current_user, require_admin

router = APIRouter()

# ============================================================
# 字段别名映射表
# ============================================================

P0_FIELD_ALIASES: Dict[str, List[str]] = {
    "sku": [
        "sku", "SKU",
        "产品货号", "货号", "产品编号", "商品编号", "物料编码",
        "产品代码",
    ],
    "name": [
        "name",
        "产品名称", "商品名称", "物料名称",
        "名称", "品名",
        "product_name", "item_name",
    ],
    "category": [
        "category",
        "类别", "分类", "产品类别",
        "物料组", "产品分类", "品类",
        "product_category",
    ],
    "current_stock": [
        # ── 通用库存（需口径确认 warning） ──
        "current_stock", "currentStock",
        "当前库存", "库存数量", "现有库存",
        "库存", "当前库存数量", "在库数量",
        "stock", "quantity", "qty",
        # ── 明确本地真实库存（无需口径 warning） ──
        "本地库存", "本地真实库存", "实际库存", "实物库存", "本仓库存",
        "local_stock", "real_stock", "physical_stock",
    ],
    "min_stock": [
        "min_stock", "minStock",
        "最低库存", "预警库存", "安全库存",
        "最低阈值", "库存下限", "最小库存",
        "safety_stock", "reorder_point",
    ],
    "unit": [
        "unit",
        "单位", "计量单位",
        "基本单位", "包装单位",
        "uom", "unit_of_measure",
    ],
    "location": [
        "location",
        "位置", "存放位置", "仓库位置", "库位",
        "货架", "仓位", "存储位置",
        "storage_location", "bin",
    ],
}

P1_FIELD_ALIASES: Dict[str, List[str]] = {
    "brand": [
        "brand",
        "品牌",
        "商标", "厂牌", "制造商",
        "manufacturer",
    ],
    "specification": [
        "specification", "model",
        "规格", "型号", "规格型号",
        "产品规格", "spec",
    ],
    "description": [
        "description",
        "中文描述", "描述",
        "产品描述", "详细描述", "desc",
    ],
    "notes": [
        "notes", "remark",
        "备注",
        "附注", "说明",
        "comment",
    ],
    "image_url": [
        "image", "image_url",
        "图片", "产品图片",
        "图片链接", "图片地址",
        "picture",
    ],
}

P2_FIELD_ALIASES: Dict[str, List[str]] = {
    "status": [
        "状态",
    ],
    "source_updated_at": [
        "更新时间", "更新日期",
        "last_updated",
    ],
}

# 库存上下文字段（异地/虚拟/总可售/库存说明）
# 这些字段只识别不落库，不参与 current_stock 和低库存计算
STOCK_CONTEXT_ALIASES: Dict[str, List[str]] = {
    "remote_stock": [
        "异地库存", "外地库存", "虚拟库存", "非本地库存",
        "供应商现货", "外仓库存",
        "remote_stock", "virtual_stock", "external_stock", "supplier_stock",
    ],
    "available_stock": [
        "总库存", "总可售库存", "可售库存", "参考库存",
        "available_stock", "total_stock", "saleable_stock",
    ],
    "stock_note": [
        "库存说明", "库存备注", "库存来源", "库存类型",
        "来源城市", "来源仓库",
        "stock_note", "stock_source", "stock_type", "stock_location",
    ],
}

REQUIRED_FIELDS = {"sku", "name", "current_stock"}

FIELD_DEFAULTS: Dict[str, Any] = {
    "category": "耗材",
    "min_stock": 0,
    "unit": "个",
    "location": "",
}

MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024
MAX_DATA_ROWS = 1000


# ============================================================
# 纯函数：可独立测试
# ============================================================

def _normalize_header(header: str) -> str:
    """规范化表头字符串"""
    h = header.strip()
    h = h.replace("　", " ")          # 全角空格 → 半角
    h = h.replace("（", "(").replace("）", ")")  # 全角括号
    h = h.rstrip(":：")               # 去掉末尾冒号（中/英）
    return h


# 明确本地真实库存别名（规范化后集合），匹配到后不产生口径 warning
EXPLICIT_LOCAL_STOCK_ALIASES_RAW = [
    "本地库存", "本地真实库存", "实际库存", "实物库存", "本仓库存",
    "local_stock", "real_stock", "physical_stock",
]
EXPLICIT_LOCAL_STOCK_NORMALIZED: set = {
    _normalize_header(a) for a in EXPLICIT_LOCAL_STOCK_ALIASES_RAW
}

# 通用库存别名（规范化后集合），匹配到后产生口径确认 warning
GENERIC_STOCK_ALIASES_RAW = [
    "当前库存", "库存数量", "现有库存",
    "current_stock", "currentStock", "库存", "当前库存数量", "在库数量",
    "stock", "quantity", "qty",
]
GENERIC_STOCK_NORMALIZED: set = {
    _normalize_header(a) for a in GENERIC_STOCK_ALIASES_RAW
}

# 总可售库存别名（用于检测"只有总可售库存没有本地库存"的场景）
TOTAL_STOCK_ALIASES_RAW = [
    "总库存", "总可售库存", "可售库存", "参考库存",
    "available_stock", "total_stock", "saleable_stock",
]
TOTAL_STOCK_NORMALIZED: set = {
    _normalize_header(a) for a in TOTAL_STOCK_ALIASES_RAW
}


def _build_alias_map() -> Tuple[Dict[str, str], Dict[str, str]]:
    """构建表头→规范字段映射，返回 (header_map, priority_map)"""
    header_map: Dict[str, str] = {}
    priority_map: Dict[str, str] = {}

    for priority, aliases_dict in [
        ("P0", P0_FIELD_ALIASES),
        ("P1", P1_FIELD_ALIASES),
        ("P2", P2_FIELD_ALIASES),
        ("STOCK_CONTEXT", STOCK_CONTEXT_ALIASES),
    ]:
        for field, aliases in aliases_dict.items():
            priority_map[field] = priority
            for alias in aliases:
                key = _normalize_header(alias)
                header_map[key] = field

    return header_map, priority_map


def _detect_encoding(raw: bytes) -> Tuple[str, str]:
    """尝试检测并解码 CSV 内容，返回 (encoding, text)"""
    candidates = ["utf-8-sig", "utf-8", "gbk", "gb18030"]
    for enc in candidates:
        try:
            return enc, raw.decode(enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise ValueError("无法识别 CSV 文件编码，支持的编码：UTF-8, UTF-8-BOM, GBK, GB18030")


def _validate_field(field: str, raw_value: str) -> Tuple[Optional[Any], List[str]]:
    """校验单个 P0 字段值，返回 (normalized_value, errors)"""
    errors: List[str] = []
    trimmed = raw_value.strip() if raw_value else ""

    if field == "current_stock":
        if not trimmed:
            return None, ["当前库存不能为空"]
        try:
            num = int(trimmed)
        except (ValueError, TypeError):
            return None, [f"当前库存不是有效数字: '{trimmed}'"]
        if num < 0:
            return num, [f"当前库存不能为负数: {num}"]
        return num, []

    if field == "min_stock":
        if not trimmed:
            return FIELD_DEFAULTS["min_stock"], []
        try:
            num = int(trimmed)
        except (ValueError, TypeError):
            return None, [f"最低库存不是有效数字: '{trimmed}'"]
        if num < 0:
            return num, [f"最低库存不能为负数: {num}"]
        return num, []

    if field == "sku":
        if not trimmed:
            return None, ["SKU 不能为空"]
        return trimmed, []

    if field == "name":
        if not trimmed:
            return None, ["产品名称不能为空"]
        if len(trimmed) > 100:
            errors.append(f"产品名称长度 {len(trimmed)} 超过 100 字符上限，将被截断")
        return trimmed, errors

    if field == "category":
        return trimmed if trimmed else FIELD_DEFAULTS["category"], []
    if field == "unit":
        rv = trimmed if trimmed else FIELD_DEFAULTS["unit"]
        if len(rv) > 20:
            errors.append(f"单位长度 {len(rv)} 超过 20 字符上限")
        return rv, errors
    if field == "location":
        return trimmed if trimmed else FIELD_DEFAULTS["location"], []

    return trimmed or None, []


def _field_display(canonical: str) -> str:
    """返回字段的中文显示名"""
    for aliases_dict in (P0_FIELD_ALIASES, P1_FIELD_ALIASES,
                          P2_FIELD_ALIASES, STOCK_CONTEXT_ALIASES):
        if canonical in aliases_dict:
            return aliases_dict[canonical][0]
    return canonical


def _is_local_stock_explicit(normalized_header: str) -> bool:
    """判断规范化后的表头是否属于明确本地真实库存字段"""
    return normalized_header in EXPLICIT_LOCAL_STOCK_NORMALIZED


def _parse_and_validate_csv(
    text: str,
    filename: str,
    encoding: str,
    db: Session,
) -> Dict[str, Any]:
    """解析并校验 CSV 文本，返回预览结果。

    纯函数，不依赖 FastAPI Request/UploadFile。
    接受已解码的 CSV 文本和数据库会话。
    """

    # ── 1. CSV 解析 ──────────────────────────────────────────
    try:
        reader = csv.DictReader(io.StringIO(text))
        raw_headers = reader.fieldnames
    except Exception as exc:
        raise ValueError(f"CSV 解析失败: {exc}")

    if not raw_headers:
        raise ValueError("CSV 文件缺少表头行")

    # ── 2. 构建别名映射 ──────────────────────────────────────
    header_map, priority_map = _build_alias_map()

    # ── 3. 表头到规范字段映射 ────────────────────────────────
    column_mapping: Dict[str, str] = {}       # raw_header → canonical_field
    field_headers: Dict[str, str] = {}        # canonical_field → raw_header
    dup_check: Dict[str, List[str]] = {}      # canonical_field → [raw_headers]
    recognized_p0: List[str] = []
    recognized_p1: List[str] = []
    recognized_p2: List[str] = []
    recognized_stock_context: List[str] = []
    ignored_columns: List[str] = []

    # 标记 current_stock 映射来源（是否明确本地库存）
    stock_caliber_is_explicit: bool = True  # 默认乐观，发现 generic 再改

    for raw_h in raw_headers:
        norm = _normalize_header(raw_h)
        canonical = header_map.get(norm)

        if canonical is None:
            ignored_columns.append(raw_h)
            continue

        if canonical in dup_check:
            dup_check[canonical].append(raw_h)
        else:
            dup_check[canonical] = [raw_h]
            column_mapping[raw_h] = canonical
            field_headers[canonical] = raw_h
            prio = priority_map[canonical]
            if prio == "P0":
                recognized_p0.append(canonical)
                # 检查库存口径：如果 current_stock 来自通用别名，标记需确认
                if canonical == "current_stock" and norm in GENERIC_STOCK_NORMALIZED:
                    stock_caliber_is_explicit = False
            elif prio == "P1":
                recognized_p1.append(canonical)
            elif prio == "P2":
                recognized_p2.append(canonical)
            else:
                recognized_stock_context.append(canonical)

    # 重复映射 → 直接返回错误
    header_errors: List[str] = []
    for field, headers in dup_check.items():
        if len(headers) > 1:
            header_errors.append(
                f"字段 '{field}' 被多个表头同时匹配: {headers}"
            )

    if header_errors:
        return {
            "filename": filename,
            "encoding": encoding,
            "total_rows": 0, "valid_rows": 0,
            "error_rows": 0, "warning_rows": 0,
            "can_import": False,
            "columns": {
                "recognized_p0": recognized_p0,
                "recognized_p1": recognized_p1,
                "recognized_p2": recognized_p2,
                "recognized_stock_context": recognized_stock_context,
                "ignored": ignored_columns,
            },
            "rows": [],
            "errors": header_errors,
            "warnings": [],
        }

    # ── 4. 库存口径安全检查 ──────────────────────────────────
    # 检测：只有总可售库存/可售库存，但没有 current_stock 或本地真实库存
    has_current_stock = "current_stock" in field_headers
    has_available_only = (
        not has_current_stock
        and "available_stock" in field_headers
    )

    if has_available_only:
        aliases_all = {**P0_FIELD_ALIASES, **P1_FIELD_ALIASES,
                       **P2_FIELD_ALIASES, **STOCK_CONTEXT_ALIASES}
        def _readable(fname: str) -> str:
            return aliases_all.get(fname, [fname])[0]
        return {
            "filename": filename,
            "encoding": encoding,
            "total_rows": 0, "valid_rows": 0,
            "error_rows": 0, "warning_rows": 0,
            "can_import": False,
            "columns": {
                "recognized_p0": recognized_p0,
                "recognized_p1": recognized_p1,
                "recognized_p2": recognized_p2,
                "recognized_stock_context": recognized_stock_context,
                "ignored": ignored_columns,
            },
            "rows": [],
            "errors": [
                "缺少本地真实库存/current_stock 列："
                "检测到总可售库存字段，但无法确认本地真实库存，"
                "不能自动导入为 current_stock。"
                "请补充「本地真实库存」或「实际库存」列。"
            ],
            "warnings": [
                "检测到总可售库存字段（如「总库存」「可售库存」），"
                "该字段不能替代本地真实库存，当前系统不保存。"
            ],
        }

    # ── 5. 必填字段检查 ──────────────────────────────────────
    missing_required = [f for f in REQUIRED_FIELDS if f not in field_headers]
    if missing_required:
        aliases_all = {**P0_FIELD_ALIASES, **P1_FIELD_ALIASES,
                       **P2_FIELD_ALIASES, **STOCK_CONTEXT_ALIASES}
        def _readable(fname: str) -> str:
            return aliases_all.get(fname, [fname])[0]
        return {
            "filename": filename,
            "encoding": encoding,
            "total_rows": 0, "valid_rows": 0,
            "error_rows": 0, "warning_rows": 0,
            "can_import": False,
            "columns": {
                "recognized_p0": recognized_p0,
                "recognized_p1": recognized_p1,
                "recognized_p2": recognized_p2,
                "recognized_stock_context": recognized_stock_context,
                "ignored": ignored_columns,
            },
            "rows": [],
            "errors": [
                f"缺少必填字段列: {', '.join(_readable(f) for f in missing_required)}"
            ],
            "warnings": [],
        }

    # ── 6. 读取数据行 ────────────────────────────────────────
    try:
        data_rows = list(reader)
    except Exception as exc:
        raise ValueError(f"CSV 数据行解析失败: {exc}")

    if len(data_rows) > MAX_DATA_ROWS:
        raise ValueError(
            f"CSV 数据行数 {len(data_rows)} 超过限制（最大 {MAX_DATA_ROWS} 行）"
        )

    if len(data_rows) == 0:
        return {
            "filename": filename,
            "encoding": encoding,
            "total_rows": 0, "valid_rows": 0,
            "error_rows": 0, "warning_rows": 0,
            "can_import": False,
            "columns": {
                "recognized_p0": recognized_p0,
                "recognized_p1": recognized_p1,
                "recognized_p2": recognized_p2,
                "recognized_stock_context": recognized_stock_context,
                "ignored": ignored_columns,
            },
            "rows": [],
            "errors": ["CSV 文件仅包含表头，没有数据行"],
            "warnings": [],
        }

    # ── 7. 逐行校验 ─────────────────────────────────────────
    row_results: List[Dict[str, Any]] = []
    csv_skus: Dict[str, List[int]] = {}

    for idx, raw_row in enumerate(data_rows):
        row_num = idx + 2
        row_errors: List[str] = []
        row_warnings: List[str] = []
        normalized: Dict[str, Any] = {}
        p1_data: Dict[str, Optional[str]] = {}
        p2_data: Dict[str, Optional[str]] = {}
        inventory_context: Dict[str, Optional[str]] = {}
        raw_data: Dict[str, str] = {}

        for raw_h, canonical in column_mapping.items():
            raw_val = raw_row.get(raw_h, "")
            raw_data[raw_h] = raw_val
            prio = priority_map[canonical]

            if prio == "P0":
                norm_val, errs = _validate_field(canonical, raw_val)
                row_errors.extend(errs)
                normalized[canonical] = norm_val
            elif prio == "P1":
                v = raw_val.strip() if raw_val else None
                p1_data[canonical] = v
                if v:
                    row_warnings.append(
                        f"P1 字段 '{_field_display(canonical)}' "
                        f"当前系统暂不保存，将在导入报告中保留"
                    )
            elif prio == "P2":
                v = raw_val.strip() if raw_val else None
                p2_data[canonical] = v
                if canonical == "status" and v:
                    row_warnings.append(
                        f"识别到旧系统「状态」='{v}'，"
                        f"新系统将按 current_stock ≤ min_stock 自动重新计算"
                    )
                if canonical == "source_updated_at" and v:
                    row_warnings.append(
                        f"识别到旧系统「更新时间」='{v}'，"
                        f"不会覆盖新系统的导入时间"
                    )
            elif prio == "STOCK_CONTEXT":
                v = raw_val.strip() if raw_val else None
                inventory_context[canonical] = v
                if v:
                    if canonical == "remote_stock":
                        row_warnings.append(
                            f"识别到异地/虚拟库存字段 '{_field_display(canonical)}'"
                            f"='{v}'，当前系统暂不保存该字段，"
                            f"也不会计入本地真实库存。"
                        )
                    elif canonical == "available_stock":
                        row_warnings.append(
                            f"识别到总/可售库存字段 '{_field_display(canonical)}'"
                            f"='{v}'，当前系统暂不保存该字段，"
                            f"不能自动合并到本地真实库存。"
                        )
                    elif canonical == "stock_note":
                        row_warnings.append(
                            f"识别到库存说明字段 '{_field_display(canonical)}'"
                            f"='{v}'，当前系统暂不保存，仅供预览参考。"
                        )

        sku_val = normalized.get("sku")
        if sku_val is not None and sku_val != "":
            csv_skus.setdefault(sku_val, []).append(row_num)

        for fld, default in FIELD_DEFAULTS.items():
            if fld not in field_headers:
                normalized.setdefault(fld, default)
                continue
            rh = field_headers[fld]
            raw_val = raw_row.get(rh, "").strip()
            if not raw_val:
                ftag = _field_display(fld)
                row_warnings.append(f"'{ftag}' 为空，将使用默认值: {default}")

        # 低库存判断：只基于本地真实库存（normalized.current_stock）
        cs = normalized.get("current_stock")
        ms = normalized.get("min_stock")
        if isinstance(cs, (int, float)) and isinstance(ms, (int, float)):
            if cs <= ms:
                row_warnings.append(
                    f"当前库存 ({cs}) ≤ 最低库存 ({ms})，导入后将处于「低库存」状态"
                )

        if row_errors:
            status = "error"
        elif row_warnings:
            status = "warning"
        else:
            status = "valid"

        row_results.append({
            "row_number": row_num,
            "status": status,
            "raw": raw_data,
            "normalized": normalized,
            "p1_fields": p1_data,
            "p2_fields": p2_data,
            "inventory_context": inventory_context,
            "errors": row_errors,
            "warnings": row_warnings,
        })

    # ── 8. CSV 内部 SKU 重复检查 ────────────────────────────
    global_errors: List[str] = []
    for sku, row_nums in csv_skus.items():
        if len(row_nums) > 1:
            msg = f"SKU '{sku}' 在 CSV 内重复出现（行: {row_nums}）"
            global_errors.append(msg)
            for rn in row_nums:
                ri = rn - 2
                if ri < len(row_results) and msg not in row_results[ri]["errors"]:
                    row_results[ri]["errors"].append(msg)

    # ── 9. 数据库已有 SKU 检查（只读查询）───────────────────
    # Step 9-5E-fix：DB 已有 SKU 不是阻断 error，
    # create_only 模式下正式导入时将直接 skipped，不覆盖原数据。
    # 预览阶段标记为 warning，不阻断正式导入按钮。
    db_existing_msgs: List[str] = []
    if csv_skus:
        existing = db.query(Product).filter(
            Product.sku.in_(list(csv_skus.keys()))
        ).all()
        exist_map: Dict[str, Product] = {p.sku: p for p in existing}

        for sku, row_nums in csv_skus.items():
            prod = exist_map.get(sku)
            if prod is not None:
                msg = (
                    f"SKU '{sku}' 已存在于数据库中"
                    f"（产品 ID: prod-{prod.id:06d}，名称: {prod.name}），"
                    f"正式导入时将跳过，不会覆盖原数据。"
                )
                db_existing_msgs.append(msg)
                for rn in row_nums:
                    ri = rn - 2
                    if ri < len(row_results) and msg not in row_results[ri]["warnings"]:
                        row_results[ri]["warnings"].append(msg)
                        # 如果该行原本 status=='valid' 且现在有 warning，
                        # 将状态更新为 'warning'
                        if row_results[ri]["status"] == "valid":
                            row_results[ri]["status"] = "warning"

    # ── 10. 最终统计 ────────────────────────────────────────
    total = len(row_results)
    # 注意：DB 已有 SKU 已从 error 移到 warning，err_cnt 只统计真正的阻断错误
    err_cnt = sum(1 for r in row_results if r["errors"])
    warn_cnt = sum(1 for r in row_results if r["warnings"] and not r["errors"])
    valid_cnt = total - err_cnt

    # ── 11. 全局提示 ────────────────────────────────────────
    global_warnings: List[str] = []

    # 将 DB 已有 SKU 提示追加到全局 warnings（不阻断导入）
    if db_existing_msgs:
        global_warnings.extend(db_existing_msgs)

    # 库存口径确认 warning（仅当使用通用库存字段时）
    if not stock_caliber_is_explicit and "current_stock" in field_headers:
        global_warnings.append(
            "库存口径需确认：当前库存列将按「本地真实库存」预览。"
            "请确认 CSV 中该列不包含异地库存、虚拟库存或供应商现货。"
            "建议后续将列名改为「本地真实库存」或「实际库存」以明确口径。"
        )

    if recognized_stock_context:
        for ctx_field in recognized_stock_context:
            if ctx_field == "remote_stock":
                global_warnings.append(
                    "识别到异地/虚拟库存字段，当前系统暂不保存该字段，"
                    "也不会计入本地真实库存。"
                )
            elif ctx_field == "available_stock":
                global_warnings.append(
                    "识别到总/可售库存字段，该字段不能替代本地真实库存，"
                    "当前系统暂不保存。"
                )
            elif ctx_field == "stock_note":
                global_warnings.append(
                    "识别到库存说明/来源字段，当前系统暂不保存，仅供预览参考。"
                )

    if recognized_p1:
        global_warnings.append(
            f"识别到 {len(recognized_p1)} 个 P1 字段"
            f"（{', '.join(recognized_p1)}），"
            f"当前系统暂不保存。原始数据将在每行 p1_fields 中保留，"
            f"待产品模型扩展后可重新导入。"
        )

    if recognized_p2:
        global_warnings.append(
            f"识别到 {len(recognized_p2)} 个 P2 参考字段"
            f"（{', '.join(recognized_p2)}），"
            f"这些字段不导入，仅供预览对比。"
        )

    if "image_url" in field_headers:
        global_warnings.append(
            "识别到图片/产品图片字段，本轮不迁移图片文件。"
            "图片链接将在导入报告中保留，待独立图片迁移流程就绪后处理。"
        )

    can_import = (err_cnt == 0 and len(global_errors) == 0)

    return {
        "filename": filename,
        "encoding": encoding,
        "total_rows": total,
        "valid_rows": valid_cnt,
        "error_rows": err_cnt,
        "warning_rows": warn_cnt,
        "can_import": can_import,
        "columns": {
            "recognized_p0": recognized_p0,
            "recognized_p1": recognized_p1,
            "recognized_p2": recognized_p2,
            "recognized_stock_context": recognized_stock_context,
            "ignored": ignored_columns,
        },
        "rows": row_results,
        "errors": global_errors,
        "warnings": global_warnings,
    }


def _generate_batch_id(db: Session) -> str:
    """生成导入批次 ID: imp-YYYYMMDD-NNN

    基于当日已提交的 PRODUCTS_CSV_IMPORT 审计记录数 + 1。
    """
    today = datetime.now().strftime("%Y%m%d")
    today_prefix = datetime.now().strftime("%Y-%m-%d")
    count = db.query(AuditLog).filter(
        AuditLog.action_type == "PRODUCTS_CSV_IMPORT",
        AuditLog.timestamp.like(f"{today_prefix}%"),
    ).count()
    return f"imp-{today}-{count + 1:03d}"


# ============================================================
# API 路由
# ============================================================

@router.post("/products/preview")
async def preview_products_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """CSV 产品导入预览与校验（仅管理员）

    接收 CSV 文件，解析表头与数据行，逐行校验后返回预览结果。
    不写入数据库，不创建产品，不修改库存，上传文件不会落盘。
    """

    filename = file.filename or "unknown.csv"
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="请上传 .csv 格式的文件")

    try:
        raw_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"读取文件失败: {exc}")

    if len(raw_bytes) == 0:
        raise HTTPException(status_code=400, detail="文件为空，请上传有效的 CSV 文件")

    if len(raw_bytes) > MAX_FILE_SIZE_BYTES:
        size_mb = len(raw_bytes) / (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"文件大小 {size_mb:.1f} MB 超过限制（最大 2 MB）",
        )

    try:
        encoding, text = _detect_encoding(raw_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        result = _parse_and_validate_csv(text, filename, encoding, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return result


# ============================================================
# Step 9-5B：正式导入执行路由
# ============================================================

@router.post("/products/execute")
async def execute_products_import(
    file: UploadFile = File(...),
    mode: str = Form("create_only"),
    confirm_backup: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """执行产品 CSV 正式导入（仅管理员，Step 9-5B）

    **第一版：仅支持 create_only 模式**

    规则：
    1. CSV 中 SKU 不存在于数据库时 → 新增产品
    2. SKU 已存在时 → 跳过（skipped + warning），不覆盖、不更新
    3. 存在结构性 error / 行级 error 时 → 禁止整批导入
    4. 同一事务：全部成功或全部失败回滚

    字段写入：
    - 仅写入 P0 字段（sku, name, current_stock, min_stock, category, unit, location）
    - STOCK_CONTEXT 字段（异地库存/虚拟库存/总可售库存）永不写入
    - status 由系统按 current_stock ≤ min_stock 自动计算
    """
    # ── 0. 模式校验 ──────────────────────────────────────────
    if mode != "create_only":
        raise HTTPException(
            status_code=400,
            detail="当前版本仅支持 create_only 导入模式",
        )

    filename = file.filename or "unknown.csv"

    # ── 1. confirm_backup 检查 ───────────────────────────────
    if not confirm_backup:
        return {
            "success": False,
            "mode": "create_only",
            "batch_id": None,
            "file_name": filename,
            "file_encoding": None,
            "total_rows": 0,
            "created_count": 0,
            "skipped_count": 0,
            "warning_count": 0,
            "error_count": 0,
            "created_items": [],
            "skipped_items": [],
            "warnings": [],
            "errors": [
                "正式导入前请确认已完成数据库备份。"
                "请在设置页执行数据库备份后，设置 confirm_backup=true 并重试。"
            ],
            "detail": "需要确认数据库备份（confirm_backup=true）",
        }

    # ── 2. 文件校验（与 preview 相同） ───────────────────────
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="请上传 .csv 格式的文件")

    try:
        raw_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"读取文件失败: {exc}")

    if len(raw_bytes) == 0:
        raise HTTPException(status_code=400, detail="文件为空，请上传有效的 CSV 文件")

    if len(raw_bytes) > MAX_FILE_SIZE_BYTES:
        size_mb = len(raw_bytes) / (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"文件大小 {size_mb:.1f} MB 超过限制（最大 2 MB）",
        )

    try:
        encoding, text = _detect_encoding(raw_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # ── 3. 重新解析校验（不信任前端预览结果） ─────────────────
    try:
        preview = _parse_and_validate_csv(text, filename, encoding, db)
    except ValueError as exc:
        return {
            "success": False,
            "mode": "create_only",
            "batch_id": None,
            "file_name": filename,
            "file_encoding": encoding,
            "total_rows": 0,
            "created_count": 0,
            "skipped_count": 0,
            "warning_count": 0,
            "error_count": 1,
            "created_items": [],
            "skipped_items": [],
            "warnings": [],
            "errors": [str(exc)],
            "detail": f"CSV 解析失败: {exc}",
        }

    # ── 4. 判断是否有真实阻断错误 ─────────────────────────────
    # Step 9-5E-fix：_parse_and_validate_csv 已将 DB 已有 SKU 归为 warning，
    # 不再出现在 global_errors 或行级 errors 中。
    # 这里只需要检查是否还存在真正的阻断错误。
    real_errors: List[str] = list(preview.get("errors", []))

    has_real_row_error = False
    all_real_row_errors: List[str] = []
    for row in preview.get("rows", []):
        for e in row.get("errors", []):
            has_real_row_error = True
            all_real_row_errors.append(
                f"第 {row['row_number']} 行：{e}"
            )

    if real_errors or has_real_row_error:
        combined_errors = real_errors + all_real_row_errors
        return {
            "success": False,
            "mode": "create_only",
            "batch_id": None,
            "file_name": filename,
            "file_encoding": encoding,
            "total_rows": preview.get("total_rows", 0),
            "created_count": 0,
            "skipped_count": 0,
            "warning_count": len(preview.get("warnings", [])),
            "error_count": len(combined_errors),
            "created_items": [],
            "skipped_items": [],
            "warnings": preview.get("warnings", []),
            "errors": combined_errors,
            "detail": (
                f"导入失败：存在 {len(combined_errors)} 个阻断性错误"
                f"，请修正 CSV 后重新上传预览。未写入任何数据。"
            ),
        }

    # ── 6. 重新查询 DB 已有 SKU（避免并发） ──────────────────
    existing_skus_in_db: set = set()
    rows = preview.get("rows", [])
    if rows:
        all_csv_skus = {
            r["normalized"]["sku"]
            for r in rows
            if r.get("normalized", {}).get("sku")
        }
        if all_csv_skus:
            existing = db.query(Product).filter(
                Product.sku.in_(list(all_csv_skus))
            ).all()
            existing_skus_in_db = {p.sku for p in existing}

    # ── 7. 分类行：create 或 skip ────────────────────────────
    to_create: List[Dict[str, Any]] = []
    skipped_items: List[Dict[str, Any]] = []
    all_warnings: List[str] = list(preview.get("warnings", []))

    for row in rows:
        row_errors = row.get("errors", [])
        norm = row.get("normalized", {})
        sku = norm.get("sku")

        if row_errors:
            # 不会走到这里（已在步骤 4 拦截），保留防御
            continue

        if sku and sku in existing_skus_in_db:
            existing_prod = db.query(Product).filter(Product.sku == sku).first()
            reason = f"SKU '{sku}' 已存在于数据库"
            if existing_prod:
                reason += (
                    f"（产品 ID: prod-{existing_prod.id:06d}"
                    f"，名称: {existing_prod.name}）"
                )
            skipped_items.append({
                "row_number": row["row_number"],
                "sku": sku,
                "name": norm.get("name", ""),
                "reason": reason,
            })
            continue

        to_create.append(row)

    # ── 8. 无数据可导入 ──────────────────────────────────────
    if not to_create:
        return {
            "success": True,
            "mode": "create_only",
            "batch_id": None,
            "file_name": filename,
            "file_encoding": encoding,
            "total_rows": preview.get("total_rows", 0),
            "created_count": 0,
            "skipped_count": len(skipped_items),
            "warning_count": len(all_warnings),
            "error_count": len(real_errors),
            "created_items": [],
            "skipped_items": skipped_items,
            "warnings": all_warnings,
            "errors": real_errors,
            "detail": "所有数据行均被跳过（SKU 已存在或无有效数据），未写入任何数据。",
        }

    # ── 9. 事务写入 ──────────────────────────────────────────
    batch_id = _generate_batch_id(db)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    date_str = datetime.now().strftime("%Y-%m-%d")
    created_items: List[Dict[str, Any]] = []

    try:
        for row in to_create:
            norm = row["normalized"]
            status = (
                "低库存"
                if norm.get("current_stock", 0) <= norm.get("min_stock", 0)
                else "正常"
            )

            product = Product(
                sku=norm["sku"],
                name=(norm.get("name") or "")[:100],
                category=norm.get("category") or "耗材",
                current_stock=norm.get("current_stock", 0),
                min_stock=norm.get("min_stock", 0),
                unit=norm.get("unit") or "个",
                location=norm.get("location") or "",
                status=status,
                last_updated=date_str,
            )
            db.add(product)
            db.flush()  # 获取自增 id

            created_items.append({
                "row_number": row["row_number"],
                "sku": norm["sku"],
                "name": norm.get("name", ""),
                "product_id": f"prod-{product.id:06d}",
            })

        # ── 10. 审计日志（同一事务） ──────────────────────────
        created_skus = [it["sku"] for it in created_items]
        skipped_skus = [it["sku"] for it in skipped_items]
        skipped_reasons = {it["sku"]: it["reason"] for it in skipped_items}

        p1_archived = any(
            any(v for v in (row.get("p1_fields") or {}).values())
            for row in to_create
        )

        details = json.dumps({
            "batch_id": batch_id,
            "file_name": filename,
            "file_encoding": encoding,
            "total_rows": preview.get("total_rows", 0),
            "created_count": len(created_items),
            "skipped_count": len(skipped_items),
            "warning_count": len(all_warnings),
            "error_count": len(real_errors),
            "success": True,
            "mode": "create_only",
            "created_skus": created_skus,
            "skipped_skus": skipped_skus,
            "skipped_reasons": skipped_reasons,
            "warnings_summary": all_warnings[:20],
            "p1_fields_archived": p1_archived,
        }, ensure_ascii=False)

        audit = AuditLog(
            action_type="PRODUCTS_CSV_IMPORT",
            operator=current_user.username,
            timestamp=now_str,
            product_name=f"批量导入 {len(created_items)} 个产品",
            product_id=batch_id,
            details=details,
        )
        db.add(audit)

        # 提交事务
        db.commit()

    except Exception as exc:
        db.rollback()
        return {
            "success": False,
            "mode": "create_only",
            "batch_id": batch_id,
            "file_name": filename,
            "file_encoding": encoding,
            "total_rows": preview.get("total_rows", 0),
            "created_count": 0,
            "skipped_count": 0,
            "warning_count": 0,
            "error_count": 1,
            "created_items": [],
            "skipped_items": [],
            "warnings": [],
            "errors": [f"数据库写入失败: {exc}"],
            "detail": "导入失败，事务已回滚，未写入任何数据。请检查 CSV 数据后重试。",
        }

    # ── 11. 成功响应 ─────────────────────────────────────────
    return {
        "success": True,
        "mode": "create_only",
        "batch_id": batch_id,
        "file_name": filename,
        "file_encoding": encoding,
        "total_rows": preview.get("total_rows", 0),
        "created_count": len(created_items),
        "skipped_count": len(skipped_items),
        "warning_count": len(all_warnings),
        "error_count": len(real_errors),
        "created_items": created_items,
        "skipped_items": skipped_items,
        "warnings": all_warnings,
        "errors": real_errors,
        "detail": (
            f"导入成功：新增 {len(created_items)} 个产品"
            f"，跳过 {len(skipped_items)} 个已存在 SKU。"
        ),
        "backup_reminder": None,
    }
