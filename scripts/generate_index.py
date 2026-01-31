#!/usr/bin/env python3
"""
自动扫描 data 目录，生成 index.json 资源索引
"""

import os
import json
import re
from pathlib import Path
from datetime import datetime

DATA_DIR = Path("/Volumes/Prism/Metaflow/data")
OUTPUT_FILE = DATA_DIR / "index.json"

# 类别配置
CATEGORIES = {
    "acg": {"name": "二次元", "nameEn": "ACG Characters"},
    "szcaee": {"name": "深圳文博会", "nameEn": "SZCAEE Exhibition"},
    "szmg": {"name": "深圳广电", "nameEn": "Shenzhen Media Group"},
    "sztu": {"name": "深圳技术大学", "nameEn": "SZTU"}
}

# 设备/子分类配置
SUBCATEGORIES = {
    "j04": {"name": "J04 扫描", "device": "J04"},
    "ad05": {"name": "AD05 扫描", "device": "AD05"},
    "yzx": {"name": "YZX 项目", "device": "YZX"}
}

def slugify(text):
    """将中文名称转换为 URL slug"""
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

def scan_resource_folder(folder_path, category, subcategory=None):
    """扫描单个资源文件夹"""
    folder_name = folder_path.name
    parsed = parse_folder_name(folder_name)
    
    # 查找文件
    sog_files = list(folder_path.glob("*.sog"))
    ply_files = list(folder_path.glob("*.compressed.ply"))
    settings_file = folder_path / "settings.json"
    jpg_files = list(folder_path.glob("*.jpg")) + list(folder_path.glob("*.png"))
    
    if not sog_files:
        return None  # 没有模型文件，跳过
    
    # 区分主模型和 LOD 文件
    main_model = None
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
        else:
            main_model = sog
    
    if not main_model:
        # 如果只有 LOD 文件，取第一个作为主模型
        if lod_files:
            main_model = folder_path / lod_files[0]["file"].split("/")[-1].replace("_LOD1", "")
            if not main_model.exists():
                main_model = sog_files[0]
                lod_files = []
        else:
            return None
    
    # 查找对应的环境 PLY
    model_base = main_model.stem  # 不含扩展名
    environment_ply = None
    for ply in ply_files:
        if "environment" in ply.name.lower() or "point_cloud" in ply.name.lower():
            environment_ply = ply
            break
    
    # 生成 ID 和路由
    title = parsed["title"]
    slug = slugify(title)
    
    # 构建路由
    route_parts = [category]
    if subcategory:
        route_parts.append(subcategory)
    route_parts.append(slug)
    route = "/" + "/".join(route_parts)
    
    # 读取 settings.json 获取额外信息
    settings_data = None
    if settings_file.exists():
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings_data = json.load(f)
        except:
            pass
    
    # 计算文件大小
    model_size = main_model.stat().st_size if main_model.exists() else 0
    env_size = environment_ply.stat().st_size if environment_ply else 0
    
    resource = {
        "id": slug,
        "title": title,
        "titleEn": slug.replace("-", " ").title(),
        "category": [category] + ([subcategory] if subcategory else []),
        "route": route,
        "source": "scanner" if subcategory in ["j04", "ad05"] else "photogrammetry",
        "files": {
            "model": str(main_model.relative_to(DATA_DIR)) if main_model.exists() else None,
            "environment": str(environment_ply.relative_to(DATA_DIR)) if environment_ply else None,
            "settings": str(settings_file.relative_to(DATA_DIR)) if settings_file.exists() else None,
            "thumbnail": str(jpg_files[0].relative_to(DATA_DIR)) if jpg_files else None
        },
        "fileSize": {
            "model": model_size,
            "environment": env_size,
            "total": model_size + env_size
        },
        "meta": {
            "date": parsed["date"],
            "device": parsed["device"] or (subcategory.upper() if subcategory else None),
            "folderName": folder_name
        }
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
                
                subcategory = subcategory_dir.name.lower()
                
                # yzx 是特殊情况，直接包含文件
                if subcategory == "yzx":
                    # 检查是否直接包含 sog 文件
                    if list(subcategory_dir.glob("*.sog")):
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
    
    return resources

def main():
    print("🔍 扫描 data 目录...")
    resources = scan_data_directory()
    
    # 按类别和日期排序
    resources.sort(key=lambda x: (x["category"][0], x["meta"]["date"] or "", x["id"]))
    
    # 生成索引
    index = {
        "version": "1.0",
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
    
    print(f"\n✅ 已生成: {OUTPUT_FILE}")
    
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
