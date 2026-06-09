#!/usr/bin/env python3
"""
自动扫描 data 目录，生成 index.json 资源索引
"""

import json
import re
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
OUTPUT_FILE = DATA_DIR / "index.json"
VERSION_HISTORY_FILE = REPO_ROOT / "metadata" / "version-history.json"
OUTPUT_VERSION_HISTORY_FILE = DATA_DIR / "version-history.json"
INDEX_SCHEMA_VERSION = "1.1"

# 类别配置
CATEGORIES = {
    "acg": {"name": "二次元", "nameEn": "ACG Characters"},
    "shenzhen": {"name": "深圳项目", "nameEn": "Shenzhen Projects"},
    "szcaee": {"name": "深圳文博会", "nameEn": "SZCAEE Exhibition"},
    "szmg": {"name": "深圳广电", "nameEn": "Shenzhen Media Group"},
    "sztu": {"name": "深圳技术大学", "nameEn": "SZTU"}
}

# 设备/子分类配置
SUBCATEGORIES = {
    "j04": {"name": "J04 扫描", "device": "J04"},
    "j05": {"name": "J05 扫描", "device": "J05"},
    "ad05": {"name": "AD05 扫描", "device": "AD05"},
    "yzx": {"name": "YZX 项目", "device": "YZX"},
    "2568": {"name": "2568", "device": "2568"},
    "phoenixfes26": {"name": "PhoenixFes26", "device": "PhoenixFes26"},
    "fireflyfes38": {"name": "FireflyFes38", "device": "FireflyFes38"},
    "fes": {"name": "FES", "device": "FES"},
}

STREAMING_SUBDIR_GLOB = "*/lod-meta.json"
NESTED_VOXEL_GLOB = "*/*.voxel.json"
TILED_VOXEL_MANIFEST = "tiled-voxel/voxel-tiles.json"
SCANNER_SUBCATEGORIES = {"j04", "j05", "ad05"}
LEGACY_VOXEL_COORDINATE_SPACE = "metaflow-rz180"
LEGACY_VOXEL_RZ180_ROUTES = {
    "/acg/2568/2026",
    "/acg/j05/xunyangpai",
    "/acg/phoenixfes26/huaijiao",
    "/acg/phoenixfes26/itasha",
    "/acg/phoenixfes26/silver-wolf",
    "/acg/phoenixfes26/stage",
    "/acg/fireflyfes38/azur-lane",
    "/acg/fireflyfes38/cyrene",
    "/acg/fireflyfes38/diaochan",
    "/acg/fireflyfes38/fireflyfes38",
    "/acg/fireflyfes38/fursuit",
    "/acg/fireflyfes38/nangong-yu",
    "/acg/fireflyfes38/remielle-dan",
    "/acg/fireflyfes38/remielle-dan-b",
    "/shenzhen/dayun",
    "/sztu/c1-bdi-206",
    "/sztu/fes/top10-26",
}
RESOURCE_METADATA_OVERRIDES = {
    ("acg", "phoenixfes26", "huaijiao"): {
        "title": "怀娇",
        "titleEn": "Huaijiao",
    },
    ("acg", "fireflyfes38", "nangong-yu"): {
        "title": "绝区零 南宫羽",
        "titleEn": "Nangong Yu",
        "viewer": {"syntheticAnimation": "figure8"},
    },
    ("acg", "fireflyfes38", "remielle-dan-b"): {
        "title": "绝区零 拉米尔",
        "titleEn": "Remielle Dan_B",
        "viewer": {"syntheticAnimation": "figure8"},
    },
    ("acg", "fireflyfes38", "remielle-dan"): {
        "title": "绝区零 拉米尔",
        "titleEn": "Remielle Dan",
        "viewer": {"syntheticAnimation": "figure8"},
    },
    ("acg", "fireflyfes38", "cyrene"): {
        "title": "崩坏星穹铁道 昔涟",
        "titleEn": "Cyrene",
        "viewer": {"syntheticAnimation": "figure8"},
    },
    ("acg", "fireflyfes38", "fursuit"): {
        "title": "国风兽装",
        "titleEn": "Fursuit",
        "viewer": {"syntheticAnimation": "figure8"},
    },
    ("acg", "fireflyfes38", "diaochan"): {
        "title": "王者荣耀 貂蝉 馥梦繁花",
        "titleEn": "Diaochan",
        "viewer": {"syntheticAnimation": "figure8"},
    },
    ("acg", "fireflyfes38", "fireflyfes38"): {
        "title": "FireflyFes38",
        "titleEn": "FireflyFes38",
    },
    ("acg", "fireflyfes38", "azur-lane"): {
        "title": "Azur Lane",
        "titleEn": "Azur Lane",
    },
}
RESOURCE_SLUG_OVERRIDES = {
    ("acg", "j05", "260315 184701 J05 08 寻洋派"): "xunyangpai",
    ("acg", "fireflyfes38", "260502 160157 01 绝区零 南宫羽"): "nangong-yu",
    ("acg", "fireflyfes38", "260502 160903 02b 绝区零 拉米尔"): "remielle-dan-b",
    ("acg", "fireflyfes38", "260502 161428 02 绝区零 拉米尔"): "remielle-dan",
    ("acg", "fireflyfes38", "260502 162735 scene 01"): "fireflyfes38",
    ("acg", "fireflyfes38", "260502 165708 scene 02 碧蓝航线"): "azur-lane",
    ("acg", "fireflyfes38", "260502 172930 03 崩坏星穹铁道 昔涟"): "cyrene",
    ("acg", "fireflyfes38", "260502 180249 04 国风兽装"): "fursuit",
    ("acg", "fireflyfes38", "260502 184535 05 王者荣耀 貂蝉 馥梦繁花"): "diaochan",
}
RESOURCE_ROUTE_ALIASES = {
    ("acg", "j05", "xunyangpai"): ["/acg/j05/寻洋派"],
}
STREAMING_MODEL_OVERRIDES = {
    ("acg", "fireflyfes38", "260502 162735 scene 01"): "streamed_noenv/lod-meta.json",
    ("acg", "fireflyfes38", "260502 165708 scene 02 碧蓝航线"): "streamed_noenv/lod-meta.json",
}
SETTINGS_FILE_OVERRIDES = {
    ("acg", "fireflyfes38", "260502 165708 scene 02 碧蓝航线"): "settings-merged.json",
}


def load_version_history():
    if not VERSION_HISTORY_FILE.exists():
        return {
            "current": {
                "displayVersion": "1.0",
                "appSemver": "1.0.0",
                "indexSchemaVersion": INDEX_SCHEMA_VERSION,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "gitRef": None,
                "historyUrl": "/data/version-history.json",
            },
            "defaultResourceVersion": "1.0",
            "entries": [],
        }

    return json.loads(VERSION_HISTORY_FILE.read_text(encoding="utf-8"))


def route_matches_pattern(route, pattern):
    if pattern == "*":
        return True
    if pattern.endswith("*"):
        return route.startswith(pattern[:-1])
    return route == pattern


def resource_matches_change(resource, change):
    route = resource.get("route")
    if not route:
        return False

    routes = change.get("routes") or []
    if route in routes:
        return True

    return any(
        route_matches_pattern(route, pattern)
        for pattern in (change.get("routePatterns") or [])
    )


def apply_resource_versions(resources, version_history):
    default_version = version_history.get("defaultResourceVersion") or "1.0"

    for resource in resources:
        resource["version"] = {
            "addedIn": default_version,
            "updatedIn": default_version,
        }

    for entry in version_history.get("entries", []):
        display_version = entry.get("displayVersion")
        if not display_version:
            continue

        for change in entry.get("resourceChanges", []):
            action = change.get("action", "update")
            for resource in resources:
                if not resource_matches_change(resource, change):
                    continue

                if action == "add":
                    resource["version"]["addedIn"] = display_version
                    resource["version"]["updatedIn"] = display_version
                else:
                    resource["version"]["updatedIn"] = display_version


def build_release_metadata(version_history):
    current = version_history.get("current", {})
    return {
        "displayVersion": current.get("displayVersion", "1.0"),
        "appSemver": current.get("appSemver", "1.0.0"),
        "schemaVersion": current.get("indexSchemaVersion", INDEX_SCHEMA_VERSION),
        "historyUrl": current.get("historyUrl", "/data/version-history.json"),
        "updatedAt": current.get("date"),
        "gitRef": current.get("gitRef"),
    }

def slugify(text):
    """将中文名称转换为 URL slug"""
    text = re.sub(r'^\d+\s+', '', text).strip()

    # 常见名称映射
    name_map = {
        "明日方舟 史尔特尔": "surtr",
        "间谍过家家 约尔1": "yor1",
        "间谍过家家 约尔2": "yor2",
        "王者荣耀 小乔 纯白花嫁": "xiaoqiao",
        "王者荣耀 西施 织梦人": "xishi",
        "王者荣耀 朵莉亚1": "dolia1",
        "王者荣耀 朵莉亚2": "dolia2",
        "王者荣耀 少司缘": "shaosiyuan",
        "王者荣耀 公孙离 花间舞": "gongsunli",
        "原神 散兵": "wanderer",
        "赛博朋克边缘行者 露西": "lucy",
        "电锯人 电次": "denji",
        "小林家的龙女仆 托尔": "tohru",
        "守护甜心 日奈森亚梦": "amu",
        "境界的彼方 栗山未来": "mirai",
        "假面骑士 build创骑 极狐 景和将军形态": "kamen-rider",
        "福瑞": "furry",
        "痛车": "itasha",
        "场景 ggc高谷仓": "ggc",
        "三角洲": "delta-force",
        "如鸢 诸葛亮": "zhugeliang",
        "魔道祖师 江厌离": "jiangyanli",
        "紫罗兰永恒花园 薇尔莉特·伊芙加登": "violet",
        "最终幻想 萨菲罗斯": "sephiroth",
        "葬送的芙莉莲 芙莉莲辛美尔": "frieren",
        "黑执事 夏尔": "ciel",
        "重返未來1999 贝丽尔": "beryl",
        "第五人格 红夫人 小女孩": "bloodyqueen",
        "原神 娜维娅": "navia",
        "崩铁 银狼": "silver-wolf",
        "舞台": "stage",
    }
    
    for cn, en in name_map.items():
        if cn in text:
            return en
    
    # 尝试从文件名中提取英文部分
    # 例如: "260118 182644 J04 Surtr.sog" -> "surtr"
    match = re.search(r'[A-Za-z][A-Za-z0-9_\- ]+', text)
    if match:
        slug = match.group().strip().lower().replace(' ', '-').replace('_', '-')
        # 清理多余的连字符
        slug = re.sub(r'-+', '-', slug)
        return slug
    
    return text.lower().replace(' ', '-')

def parse_folder_name(folder_name):
    """解析文件夹名称，提取日期、设备、标题"""
    # 格式1: "260118 182644 J04 明日方舟 史尔特尔"
    match = re.match(r'^(\d{6})\s+(\d{6})?\s*([A-Z0-9]+)?\s+(.+)$', folder_name)
    if match:
        date_str = match.group(1)
        device = match.group(3) or ""
        title = match.group(4) or folder_name
        # 解析日期 YYMMDD
        try:
            date = datetime.strptime("20" + date_str, "%Y%m%d").strftime("%Y-%m-%d")
        except:
            date = None
        return {"date": date, "device": device, "title": title}
    
    # 格式2: "250424 SZTU C2-Lib"
    match = re.match(r'^(\d{6})\s+(.+)$', folder_name)
    if match:
        date_str = match.group(1)
        title = match.group(2)
        try:
            date = datetime.strptime("20" + date_str, "%Y%m%d").strftime("%Y-%m-%d")
        except:
            date = None
        return {"date": date, "device": None, "title": title}
    
    # 格式3: 图片重建的长文件名 "foxiang_r2j-3-2_full_14.95MSplats..."
    match = re.match(r'^([a-z]+)_.*_(\d{6}).*$', folder_name, re.IGNORECASE)
    if match:
        title = match.group(1)
        date_str = match.group(2)
        try:
            date = datetime.strptime("20" + date_str, "%Y%m%d").strftime("%Y-%m-%d")
        except:
            date = None
        return {"date": date, "device": None, "title": title}
    
    return {"date": None, "device": None, "title": folder_name}


def find_settings_file(folder_path):
    """查找 settings 文件，优先标准命名，再接受 settings-*.json"""
    standard_file = folder_path / "settings.json"
    if standard_file.exists():
        return standard_file

    settings_candidates = sorted(
        file for file in folder_path.glob("settings*.json")
        if file.is_file()
    )
    return settings_candidates[0] if settings_candidates else None


def find_thumbnail_file(folder_path):
    thumbnails = sorted(
        file for pattern in ("*.jpg", "*.png")
        for file in folder_path.glob(pattern)
        if file.is_file()
    )
    return thumbnails[0] if thumbnails else None


def find_voxel_file(folder_path):
    preferred = folder_path / "walk.voxel.json"
    if preferred.exists():
        return preferred

    voxel_candidates = sorted(
        file for file in folder_path.glob("*.voxel.json")
        if file.is_file()
    )
    if voxel_candidates:
        return voxel_candidates[0]

    nested_candidates = sorted(
        file for file in folder_path.glob(NESTED_VOXEL_GLOB)
        if file.is_file()
    )
    return nested_candidates[0] if nested_candidates else None


def find_voxel_manifest_file(folder_path):
    preferred = folder_path / TILED_VOXEL_MANIFEST
    if preferred.exists():
        return preferred
    return None


def find_streaming_model_file(folder_path):
    for name in ("lod-meta.json", "meta.json"):
        candidate = folder_path / name
        if candidate.exists():
            return candidate

    nested_candidates = sorted(
        file for file in folder_path.glob(STREAMING_SUBDIR_GLOB)
        if file.is_file()
    )
    if nested_candidates:
        return nested_candidates[0]
    return None


def normalize_subcategory_key(name):
    lowered = name.strip().lower()
    if lowered in SUBCATEGORIES:
        return lowered
    return re.sub(r'[^a-z0-9]+', '', lowered)


def has_direct_resource_files(folder_path):
    if list(folder_path.glob("*.sog")):
        return True

    return any((folder_path / name).exists() for name in ("lod-meta.json", "meta.json"))


def strip_json_comments(text):
    """移除 JSONC 中的 // 和 /* */ 注释"""
    result = []
    in_string = False
    string_quote = ''
    escape = False
    i = 0

    while i < len(text):
        char = text[i]
        next_char = text[i + 1] if i + 1 < len(text) else ''

        if in_string:
            result.append(char)
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == string_quote:
                in_string = False
            i += 1
            continue

        if char in ('"', "'"):
            in_string = True
            string_quote = char
            result.append(char)
            i += 1
            continue

        if char == '/' and next_char == '/':
            i += 2
            while i < len(text) and text[i] not in '\r\n':
                i += 1
            continue

        if char == '/' and next_char == '*':
            i += 2
            while i + 1 < len(text) and not (text[i] == '*' and text[i + 1] == '/'):
                i += 1
            i += 2
            continue

        result.append(char)
        i += 1

    return ''.join(result)


def load_settings_json(settings_file):
    if not settings_file or not settings_file.exists():
        return None

    try:
        return json.loads(settings_file.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        try:
            stripped = strip_json_comments(settings_file.read_text(encoding='utf-8'))
            return json.loads(stripped)
        except Exception:
            return None
    except Exception:
        return None


def get_voxel_size(voxel_file):
    if not voxel_file:
        return 0

    total = voxel_file.stat().st_size
    voxel_bin = voxel_file.with_suffix(".bin")
    if voxel_bin.exists():
        total += voxel_bin.stat().st_size
    return total


def get_voxel_manifest_size(manifest_file):
    if not manifest_file:
        return 0

    total = manifest_file.stat().st_size
    try:
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    except Exception:
        return total

    manifest_dir = manifest_file.parent
    for tile in manifest.get("tiles", []):
        url = tile.get("url")
        if not isinstance(url, str):
            continue
        if url.startswith("/") or "://" in url:
            continue
        tile_json = (manifest_dir / url).resolve()
        try:
            tile_json.relative_to(manifest_dir.resolve())
        except ValueError:
            continue
        if not tile_json.exists() or not tile_json.is_file():
            continue
        total += tile_json.stat().st_size
        tile_bin = tile_json.with_suffix(".bin")
        if tile_bin.exists() and tile_bin.is_file():
            total += tile_bin.stat().st_size
    return total


def get_streaming_model_size(folder_path, settings_file=None, thumbnail_file=None, voxel_file=None, voxel_manifest_file=None, environment_file=None, extra_excluded_paths=None):
    excluded_paths = {
        path.resolve()
        for path in (settings_file, thumbnail_file, voxel_file, voxel_manifest_file, environment_file)
        if path is not None and path.exists()
    }
    if extra_excluded_paths:
        excluded_paths.update(
            path.resolve()
            for path in extra_excluded_paths
            if path is not None and path.exists()
        )

    if voxel_file:
        voxel_bin = voxel_file.with_suffix(".bin")
        if voxel_bin.exists():
            excluded_paths.add(voxel_bin.resolve())

    if voxel_manifest_file:
        excluded_paths.add(voxel_manifest_file.parent.resolve())

    total = 0
    for file in folder_path.rglob("*"):
        if not file.is_file() or file.name.startswith('.'):
            continue
        if any(parent.resolve() in excluded_paths for parent in file.parents):
            continue
        if file.resolve() in excluded_paths:
            continue
        total += file.stat().st_size

    return total

def scan_resource_folder(folder_path, category, subcategory=None):
    """扫描单个资源文件夹"""
    folder_name = folder_path.name
    parsed = parse_folder_name(folder_name)
    
    # 查找文件
    sog_files = list(folder_path.glob("*.sog"))
    ply_files = list(folder_path.glob("*.compressed.ply"))
    streaming_model_file = find_streaming_model_file(folder_path)
    streaming_model_override = STREAMING_MODEL_OVERRIDES.get((category, subcategory, folder_name))
    if streaming_model_override:
        streaming_model_file = folder_path / streaming_model_override
    settings_file = find_settings_file(folder_path)
    settings_file_override = SETTINGS_FILE_OVERRIDES.get((category, subcategory, folder_name))
    if settings_file_override:
        settings_file = folder_path / settings_file_override
    thumbnail_file = find_thumbnail_file(folder_path)
    voxel_file = find_voxel_file(folder_path)
    voxel_manifest_file = find_voxel_manifest_file(folder_path)

    if not sog_files and not streaming_model_file:
        return None  # 没有模型文件，跳过
    
    # 区分主模型和 LOD 文件
    main_model = None
    model_mode = "legacy-sog"
    lod_files = []
    
    for sog in sog_files:
        if "_LOD" in sog.name:
            # 提取 LOD 级别
            match = re.search(r'_LOD(\d+)', sog.name)
            level = int(match.group(1)) if match else 1
            lod_files.append({
                "level": level,
                "file": str(sog.relative_to(DATA_DIR)),
                "size": sog.stat().st_size
            })
        elif not streaming_model_override:
            main_model = sog
    
    if streaming_model_override and streaming_model_file and streaming_model_file.exists():
        main_model = streaming_model_file
        model_mode = "streaming-json"
    elif not main_model and streaming_model_file:
        main_model = streaming_model_file
        model_mode = "streaming-json"
    elif not main_model:
        # 如果只有 LOD 文件，取第一个作为主模型
        if lod_files:
            main_model = folder_path / lod_files[0]["file"].split("/")[-1].replace("_LOD1", "")
            if not main_model.exists():
                main_model = sog_files[0]
                lod_files = []
        else:
            return None
    
    # 查找对应的环境 PLY
    environment_ply = None
    for ply in ply_files:
        if "environment" in ply.name.lower() or "point_cloud" in ply.name.lower():
            environment_ply = ply
            break
    
    # 生成 ID 和路由
    title = parsed["title"]
    slug = RESOURCE_SLUG_OVERRIDES.get(
        (category, subcategory, folder_name),
        slugify(title)
    )
    
    # 构建路由
    route_parts = [category]
    if subcategory:
        route_parts.append(subcategory)
    route_parts.append(slug)
    route = "/" + "/".join(route_parts)
    
    # 读取 settings 获取额外信息
    settings_data = load_settings_json(settings_file)
    
    # 计算文件大小
    if model_mode == "streaming-json":
        model_size = get_streaming_model_size(
            folder_path,
            settings_file=settings_file,
            thumbnail_file=thumbnail_file,
            voxel_file=voxel_file,
            voxel_manifest_file=voxel_manifest_file,
            environment_file=environment_ply,
            extra_excluded_paths=sog_files if streaming_model_override else None
        )
    else:
        model_size = main_model.stat().st_size if main_model.exists() else 0
    env_size = environment_ply.stat().st_size if environment_ply else 0
    thumbnail_size = thumbnail_file.stat().st_size if thumbnail_file else 0
    voxel_size = get_voxel_size(voxel_file)
    voxel_manifest_size = get_voxel_manifest_size(voxel_manifest_file)
    
    resource = {
        "id": slug,
        "title": title,
        "titleEn": slug.replace("-", " ").title(),
        "category": [category] + ([subcategory] if subcategory else []),
        "route": route,
        "source": "scanner" if subcategory in SCANNER_SUBCATEGORIES else "photogrammetry",
        "files": {
            "model": str(main_model.relative_to(DATA_DIR)) if main_model.exists() else None,
            "environment": str(environment_ply.relative_to(DATA_DIR)) if environment_ply else None,
            "settings": str(settings_file.relative_to(DATA_DIR)) if settings_file and settings_file.exists() else None,
            "thumbnail": str(thumbnail_file.relative_to(DATA_DIR)) if thumbnail_file else None
        },
        "fileSize": {
            "model": model_size,
            "environment": env_size,
            "thumbnail": thumbnail_size,
            "total": model_size + env_size + thumbnail_size
        },
        "meta": {
            "date": parsed["date"],
            "device": parsed["device"] or (subcategory.upper() if subcategory else None),
            "folderName": folder_name
        }
    }

    metadata_override = RESOURCE_METADATA_OVERRIDES.get((category, subcategory, slug))
    if metadata_override:
        viewer_override = metadata_override.get("viewer")
        resource.update({
            key: value
            for key, value in metadata_override.items()
            if key != "viewer"
        })
        if viewer_override:
            resource["viewer"] = {
                **resource.get("viewer", {}),
                **viewer_override,
            }

    route_aliases = RESOURCE_ROUTE_ALIASES.get((category, subcategory, slug))
    if route_aliases:
        resource["aliases"] = route_aliases

    if voxel_file:
        resource["files"]["voxel"] = str(voxel_file.relative_to(DATA_DIR))
        resource["fileSize"]["voxel"] = voxel_size
        resource["fileSize"]["total"] += voxel_size

    if voxel_manifest_file:
        resource["files"]["voxelManifest"] = str(voxel_manifest_file.relative_to(DATA_DIR))
        resource["fileSize"]["voxelManifest"] = voxel_manifest_size
        resource["fileSize"]["total"] += voxel_manifest_size

    if (voxel_file or voxel_manifest_file) and route in LEGACY_VOXEL_RZ180_ROUTES:
        resource["viewer"] = {
            **resource.get("viewer", {}),
            "voxelCoordinateSpace": LEGACY_VOXEL_COORDINATE_SPACE
        }

    if model_mode == "streaming-json" and (voxel_file or voxel_manifest_file):
        resource["viewer"] = {
            **resource.get("viewer", {}),
            "defaultCameraMode": "fly"
        }
    
    # 添加 LOD 信息
    if lod_files:
        resource["files"]["lod"] = sorted(lod_files, key=lambda x: x["level"])
        # 如果原模型超过 80MB，标记推荐使用 LOD
        if model_size > 80 * 1024 * 1024:
            resource["fileSize"]["recommended"] = "lod1"
    
    # 添加相机动画信息
    if settings_data and "animTracks" in settings_data:
        anim = settings_data["animTracks"][0] if settings_data["animTracks"] else None
        if anim:
            resource["animation"] = {
                "duration": anim.get("duration"),
                "frameRate": anim.get("frameRate"),
                "loopMode": anim.get("loopMode")
            }
    
    return resource

def scan_data_directory():
    """扫描整个 data 目录"""
    resources = []
    
    for category_dir in DATA_DIR.iterdir():
        if not category_dir.is_dir() or category_dir.name.startswith('.'):
            continue
        
        category = category_dir.name.lower()
        
        # ACG 目录有子分类
        if category == "acg":
            for subcategory_dir in category_dir.iterdir():
                if not subcategory_dir.is_dir() or subcategory_dir.name.startswith('.'):
                    continue
                
                subcategory = normalize_subcategory_key(subcategory_dir.name)

                # 直接包含资源文件的目录，例如 yzx
                if has_direct_resource_files(subcategory_dir):
                    resource = scan_resource_folder(subcategory_dir, category, subcategory)
                    if resource:
                        resources.append(resource)
                    continue
                
                # 正常的子目录结构
                for resource_dir in subcategory_dir.iterdir():
                    if not resource_dir.is_dir() or resource_dir.name.startswith('.'):
                        continue
                    
                    resource = scan_resource_folder(resource_dir, category, subcategory)
                    if resource:
                        resources.append(resource)
        else:
            # 其他类别直接包含资源文件夹
            for resource_dir in category_dir.iterdir():
                if not resource_dir.is_dir() or resource_dir.name.startswith('.'):
                    continue
                
                resource = scan_resource_folder(resource_dir, category)
                if resource:
                    resources.append(resource)
                    continue

                # 支持类似 SZTU/FES/<resource> 的命名分组目录
                subcategory = normalize_subcategory_key(resource_dir.name)
                for nested_resource_dir in resource_dir.iterdir():
                    if not nested_resource_dir.is_dir() or nested_resource_dir.name.startswith('.'):
                        continue

                    resource = scan_resource_folder(nested_resource_dir, category, subcategory)
                    if resource:
                        resources.append(resource)
    
    return resources

def main():
    print("🔍 扫描 data 目录...")
    version_history = load_version_history()
    resources = scan_data_directory()
    
    # 按类别和日期排序
    resources.sort(key=lambda x: (x["category"][0], x["meta"]["date"] or "", x["id"]))
    apply_resource_versions(resources, version_history)
    
    # 生成索引
    index = {
        "version": "1.0",
        "schemaVersion": version_history.get("current", {}).get("indexSchemaVersion", INDEX_SCHEMA_VERSION),
        "release": build_release_metadata(version_history),
        "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
        "totalResources": len(resources),
        "categories": CATEGORIES,
        "subcategories": SUBCATEGORIES,
        "resources": resources
    }
    
    # 统计信息
    total_size = sum(r["fileSize"]["total"] for r in resources)
    print(f"\n📊 统计信息:")
    print(f"   总资源数: {len(resources)}")
    print(f"   总大小: {total_size / 1024 / 1024:.1f} MB")
    
    # 按类别统计
    by_category = {}
    for r in resources:
        cat = r["category"][0]
        by_category[cat] = by_category.get(cat, 0) + 1
    
    for cat, count in sorted(by_category.items()):
        print(f"   - {cat}: {count} 个资源")
    
    # 写入文件
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    with open(OUTPUT_VERSION_HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(version_history, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 已生成: {OUTPUT_FILE}")
    print(f"✅ 已生成: {OUTPUT_VERSION_HISTORY_FILE}")
    print(f"   当前版本: {index['release']['displayVersion']} / {index['release']['appSemver']}")
    
    # 输出部分资源预览
    print(f"\n📋 资源列表预览:")
    for r in resources[:10]:
        size_mb = r["fileSize"]["total"] / 1024 / 1024
        lod_mark = " [LOD]" if r["files"].get("lod") else ""
        env_mark = " +env" if r["files"].get("environment") else ""
        print(f"   {r['route']:40} {size_mb:6.1f}MB{lod_mark}{env_mark}")
    
    if len(resources) > 10:
        print(f"   ... 还有 {len(resources) - 10} 个资源")

if __name__ == "__main__":
    main()
