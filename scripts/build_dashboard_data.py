#!/usr/bin/env python3
"""Build dashboard data from the review sheet in the source workbook.

Usage:
  python scripts/build_dashboard_data.py 评论.xlsx data
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

THEMES = {
    "质量做工": ["质量", "做工", "材质", "厚实", "结实", "耐用", "不锈钢", "铜", "阀芯", "毛刺", "破损", "坏", "裂", "漏水"],
    "颜色外观": ["颜色", "色差", "外观", "颜值", "质感", "好看", "漂亮", "发黄", "掉色", "褪色", "光泽"],
    "效果性能": ["效果", "性能", "防水", "防臭", "排水", "粘", "牢", "覆盖", "遮盖", "耐磨", "防风", "隔音", "漏风", "起皮", "脱落", "起泡"],
    "安装施工": ["安装", "施工", "师傅", "打孔", "免打孔", "刷", "滚", "配比", "基层", "尺寸", "开孔", "不好装"],
    "气味环保": ["气味", "味道", "刺鼻", "环保", "甲醛", "净味", "无味", "入住", "有味"],
    "客服售后": ["客服", "售后", "服务", "退货", "退款", "补发", "赔偿", "处理", "推脱", "态度"],
    "物流包装": ["物流", "快递", "包装", "运输", "漏液", "破损", "少发", "漏发", "发货", "到货"],
}
CATEGORY_THEMES = {
    "地漏": ["质量做工", "颜色外观", "效果性能", "安装施工"], "艺术漆": ["效果性能", "颜色外观", "气味环保", "安装施工"],
    "水槽套餐": ["质量做工", "颜色外观", "安装施工", "客服售后"], "内墙乳胶漆": ["气味环保", "客服售后", "颜色外观", "效果性能"],
    "环氧漆(地坪漆)": ["效果性能", "安装施工", "客服售后", "质量做工"], "密封条": ["效果性能", "质量做工", "安装施工", "物流包装"],
    "外墙乳胶漆": ["颜色外观", "效果性能", "物流包装", "质量做工"], "瓷砖胶": ["质量做工", "物流包装", "效果性能", "客服售后"],
    "腻子": ["效果性能", "物流包装", "质量做工", "气味环保"], "毛巾架": ["质量做工", "颜色外观", "安装施工", "客服售后"],
    "角阀": ["质量做工", "颜色外观", "安装施工", "效果性能"], "金属漆": ["物流包装", "质量做工", "效果性能", "颜色外观"],
}
POSITIVE = ["满意", "不错", "很好", "好用", "漂亮", "好看", "质感", "结实", "厚实", "方便", "顺滑", "牢固", "没味", "无味", "低味", "值得", "推荐", "专业", "及时", "耐用", "省心", "效果好"]
NEGATIVE = ["差", "失望", "不好", "难用", "破损", "漏", "掉色", "色差", "起皮", "脱落", "起泡", "发黄", "刺鼻", "难闻", "少发", "漏发", "退货", "退款", "投诉", "推脱", "不理", "不符", "坏", "裂", "溢", "返味", "关不上", "不够", "误导", "麻烦"]
PEOPLE = {"装修业主": ["装修", "新房", "家装"], "DIY用户": ["自己动手", "自己刷", "自己装", "DIY", "新手"], "施工师傅": ["师傅", "工人", "瓦工", "油工"], "儿童/老人家庭": ["儿童", "孩子", "宝宝", "老人"], "租住用户": ["租房", "出租房", "房东"], "工程用户": ["工程", "车间", "工厂", "仓库"]}
SCENES = {"卫生间": ["卫生间", "浴室", "淋浴"], "厨房": ["厨房", "水槽", "洗碗机"], "阳台": ["阳台", "洗衣机"], "墙面翻新": ["旧墙", "墙面", "补墙", "翻新"], "地面施工": ["地面", "车库", "水泥地", "地坪"], "门窗改善": ["门窗", "门缝", "窗户", "漏风"], "户外环境": ["外墙", "围墙", "户外", "天井"], "金属翻新": ["暖气", "铁门", "铁艺", "彩钢瓦"]}
PURPOSES = {"改色美化": ["改色", "颜色", "美化", "好看", "漂亮"], "防水防漏": ["防水", "漏水", "防漏"], "防臭排水": ["防臭", "返味", "排水"], "牢固耐用": ["牢固", "耐用", "结实", "粘性"], "低味环保": ["环保", "无味", "低味", "甲醛"], "修补翻新": ["修补", "翻新", "补墙", "遮盖"], "安装省事": ["安装方便", "免打孔", "自己装", "省事"], "收纳省空间": ["收纳", "折叠", "省空间"]}
KEYWORDS = {"质量": ["质量"], "做工": ["做工", "毛刺"], "颜色": ["颜色", "色差", "掉色"], "效果": ["效果", "好用"], "安装": ["安装", "施工"], "客服": ["客服", "售后"], "物流": ["物流", "快递"], "包装": ["包装", "破损", "漏液"], "气味": ["气味", "味道", "刺鼻"], "环保": ["环保", "甲醛", "净味"], "材质": ["材质", "不锈钢", "黄铜", "全铜"], "尺寸适配": ["尺寸", "开孔", "适配", "太厚", "太薄"], "耐用": ["耐用", "结实", "牢固"], "防水": ["防水"], "防臭排水": ["防臭", "返味", "排水"], "遮盖力": ["遮盖", "覆盖"], "用量": ["用量", "不够", "面积"], "工具配套": ["工具", "刷子", "手套"], "性价比": ["性价比", "划算", "价格"], "品牌信任": ["品牌", "旗舰店", "正品"]}
PROBLEMS = {
    "地漏": [("排水与防臭冲突", ["排不出去", "排水慢", "溢", "返味", "反味"], "防臭芯阻力、管径或安装深度不匹配", "积水或返味，核心功能失效"), ("表面耐久与到货损伤", ["掉色", "褪色", "磕", "破损", "划痕"], "表面处理耐久或运输防护不足", "破坏高价品牌的品质预期"), ("安装适配不清", ["尺寸", "三通", "安装", "太高", "太深"], "选型信息没有覆盖管径、深度和排水结构", "返工并放大售后成本")],
    "艺术漆": [("实物色差与批次差", ["色差", "颜色不", "不一样", "发黄", "变色"], "屏幕、基层和补货批次共同影响显色", "整面返工且难以局部修复"), ("附着失败", ["起皮", "脱落", "翘", "开裂", "起泡"], "基层处理、间隔时间或罩面步骤缺失", "翻新效果短期失效"), ("DIY门槛被低估", ["难刷", "不好刷", "施工", "新手", "教程"], "宣传的简单操作与真实工序不一致", "增加试错、材料和人工成本")],
    "水槽套餐": [("开孔与设备不适配", ["开孔", "孔位", "净水器", "洗碗机", "尺寸"], "下单前缺少台面和外接设备确认", "安装后才暴露，返工成本高"), ("配件错漏阻断安装", ["少发", "漏发", "缺", "配件", "错发"], "多部件套餐清单与复核不足", "师傅等待或二次上门"), ("盆体或龙头质量", ["漏水", "生锈", "划痕", "变形", "坏"], "运输防护、焊接或部件品控波动", "影响厨房长期使用")],
    "内墙乳胶漆": [("环保承诺口径冲突", ["8小时", "入住", "甲醛", "味道", "刺鼻"], "营销承诺与客服解释条件不一致", "形成健康焦虑和品牌不信任"), ("上墙颜色偏差", ["色差", "颜色不", "太深", "太浅", "发黄"], "屏幕、色卡、光线和干燥过程影响判断", "整墙重刷"), ("旧墙问题与漆效混杂", ["发霉", "开裂", "起皮", "脱落", "基层"], "施工前未诊断墙体含水或旧涂层", "责任难界定、售后争议")],
    "环氧漆(地坪漆)": [("用量承诺不足", ["不够", "用量", "面积", "少了", "补买"], "基层粗糙度与施工方式未纳入估算", "中途停工并增加人工费"), ("补货批次色差", ["色差", "颜色不", "补货", "不一样"], "同一工程未锁定生产批次", "大面积地面难局部修复"), ("起泡起皮", ["起泡", "起皮", "脱落", "翘", "不开"], "含水率、配比、温度或养护条件不满足", "耐久性失效")],
    "密封条": [("厚度选择两难", ["太厚", "太薄", "关不上", "漏风", "门缝"], "缺少可操作的缝隙测量和规格匹配", "安装后仍漏风或无法关门"), ("背胶与安装失败", ["粘不", "掉", "背胶", "助粘", "脱落"], "表面清洁、胶层或固化时间不匹配", "短期失效并留下残胶"), ("气味与材质感", ["味道", "气味", "刺鼻", "硬", "薄"], "材料配方和厚薄预期不一致", "卧室等封闭空间体验差")],
    "外墙乳胶漆": [("雨后掉色掉粉", ["掉色", "掉粉", "下雨", "冲掉", "褪色"], "施工天气窗口或耐候性能不足", "外立面快速失效"), ("颜色氧化偏差", ["色差", "发黄", "变色", "颜色不"], "光照、批次和基层吸收差异", "大面积观感不一致"), ("工具与包装履约", ["少发", "漏发", "破损", "漏液", "工具"], "桶装防护或套装配货复核不足", "打断连续施工")],
    "瓷砖胶": [("运输破包", ["破损", "破包", "漏", "烂", "撒"], "大包装运输防护不足", "材料损耗且退货运费高"), ("产品选型混淆", ["双组份", "背胶", "型号", "不适合", "选错"], "砖尺寸、吸水率和基层的匹配信息不足", "空鼓脱落风险"), ("粘结与施工争议", ["脱落", "空鼓", "粘不", "不牢", "开裂"], "材料选择、配比与师傅工艺相互影响", "返工且责任难划分")],
    "腻子": [("产品用途误解", ["底漆", "面漆", "直接刷", "脱落", "起皮"], "用户混淆找平、补坑与改色功能", "错误施工导致墙皮失效"), ("局部修补色差", ["色差", "颜色不", "太白", "发黄"], "新旧墙面老化程度不同", "补丁明显"), ("打磨与遮盖不足", ["难打磨", "遮不", "盖不住", "不平", "颗粒"], "稠度、施工厚度或工具不匹配", "修补效果粗糙")],
    "毛巾架": [("免打孔坠落", ["掉下来", "掉了", "粘不", "砸", "脱落"], "墙面材质、潮湿环境与胶体承重不匹配", "可能砸伤人或损坏洁具"), ("材质与表面耐久", ["生锈", "掉漆", "划痕", "变色", "薄"], "潮湿耐腐蚀或表面处理不足", "长期观感和承重信任下降"), ("尺寸结构不适配", ["尺寸", "太大", "太小", "孔距", "安装"], "购买前缺少空间和孔距校验", "无法安装或影响动线")],
    "角阀": [("漏水与阀芯失效", ["漏水", "渗水", "坏", "关不", "阀芯"], "密封、阀芯或装配品控波动", "隐蔽工程存在财产安全风险"), ("材质预期差", ["全铜", "黄铜", "材质", "塑料", "生锈"], "材质描述与用户对重量、颜色的判断不一致", "削弱品牌信任"), ("墙体尺寸适配", ["尺寸", "螺纹", "太短", "太长", "装饰盖"], "贴砖厚度和接口深度未提前确认", "安装外露或无法连接")],
    "金属漆": [("免打磨理解偏差", ["打磨", "除锈", "起皮", "脱落", "粘不"], "宣传让用户忽略锈蚀等级与基层清洁", "附着失败"), ("覆盖面积不足", ["不够", "面积", "用量", "太少", "补买"], "喷涂与刷涂损耗、锈面粗糙度未区分", "中途补货并可能产生色差"), ("桶装漏液与工具丢失", ["漏液", "洒", "破损", "工具", "少发"], "桶盖二次密封与附件固定不足", "无法按计划开工")],
}

def usable(value):
    text = str(value).strip()
    return bool(text and text.lower() != "nan" and not re.fullmatch(r"[\W_\d]+", text) and len(re.sub(r"\s+", "", text)) >= 4)

def rates(rows, mapping, limit):
    result, n = [], len(rows)
    for label, terms in mapping.items():
        count = int(rows["text"].map(lambda text: any(term in text for term in terms)).sum())
        if count:
            result.append([label, count, round(count * 100 / n, 1)])
    return sorted(result, key=lambda item: (-item[1], item[0]))[:limit]

def matched_labels(text, mapping):
    return [label for label, terms in mapping.items() if any(term in text for term in terms)]

def problem_text_match(title, terms, text):
    if not any(term in text for term in terms):
        return False
    if title == "排水与防臭冲突":
        clear_failure = any(term in text for term in ["排不出去", "排水慢", "溢", "返味"])
        positive_anti_odor = any(term in text for term in ["防止反味", "没有反味", "无反味", "不反味", "隔绝反味"])
        if positive_anti_odor and not clear_failure:
            return False
    return True

def matched_problems(category, text):
    return [title for title, terms, _, _ in PROBLEMS[category] if problem_text_match(title, terms, text)]

def normalize_rating(value):
    value = str(value).strip()
    return value if value in {"好评", "中评", "差评"} else ""

def theme_detail(theme, rows):
    words = THEMES[theme]
    matched = rows[rows["text"].map(lambda text: any(word in text for word in words))].copy()
    count, total = len(matched), len(rows)
    rate = round(count * 100 / total, 1) if total else 0
    if not count:
        return {"count": 0, "rate": 0, "summary": "当前筛选范围内未检出足够的明确主题表达。", "quotes": []}
    positive = Counter(word for text in matched["text"] for word in POSITIVE if word in text)
    negative = Counter(word for text in matched["text"] for word in NEGATIVE if word in text)
    positive_text = "、".join(word for word, _ in positive.most_common(3)) or "功能达到预期"
    negative_text = "、".join(word for word, _ in negative.most_common(3)) or "风险表达较分散"
    confidence = "可优先跟踪" if count >= 100 else "方向性信号" if count >= 30 else "探索性信号"
    summary = f"命中{count}条去重评论，占当前筛选评论{rate}%，属于{confidence}。认可集中在“{positive_text}”，风险集中在“{negative_text}”；提及率不等于满意度。"
    candidates = matched[(matched["text"].str.len() >= 12) & (matched["text"].str.len() <= 220)].copy()
    if candidates.empty:
        candidates = matched.copy()
    candidates["rank"] = candidates.apply(lambda row: sum(row["text"].count(word) for word in words) * 3 + sum(word in row["text"] for word in POSITIVE + NEGATIVE) + min(float(row["helpful"]), 10) / 10, axis=1)
    quotes = []
    for _, row in candidates.sort_values("rank", ascending=False).head(2).iterrows():
        text = row["text"] if len(row["text"]) <= 180 else row["text"][:177] + "…"
        quotes.append({"text": text, "shop": row["shop"], "month": row["month"]})
    return {"count": count, "rate": rate, "summary": summary, "quotes": quotes}

def problem_details(category, rows):
    total, result = len(rows), []
    for title, terms, cause, impact in PROBLEMS[category]:
        matched = rows[rows["text"].map(lambda text: problem_text_match(title, terms, text))].copy()
        if matched.empty:
            continue
        matched["rank"] = matched.apply(lambda row: sum(term in row["text"] for term in terms) * 3 + min(float(row["helpful"]), 10) / 10 + min(len(row["text"]), 180) / 180, axis=1)
        quotes = []
        for _, row in matched[(matched["text"].str.len() >= 12)].sort_values("rank", ascending=False).head(2).iterrows():
            text = row["text"] if len(row["text"]) <= 220 else row["text"][:217] + "…"
            quotes.append({"text": text, "shop": row["shop"], "month": row["month"]})
        result.append({"title": title, "count": int(len(matched)), "rate": round(len(matched) * 100 / total, 1), "cause": cause, "impact": impact, "quotes": quotes})
    return sorted(result, key=lambda item: -item["count"])

def segment(rows, theme_names):
    rows = rows.drop_duplicates("text")
    total = len(rows)
    if not total:
        return None
    positive_count = int(rows["text"].map(lambda text: sum(word in text for word in POSITIVE) > sum(word in text for word in NEGATIVE)).sum())
    risk_count = int(rows["text"].map(lambda text: any(word in text for word in NEGATIVE)).sum())
    positive_rate, risk_rate = round(positive_count * 100 / total, 1), round(risk_count * 100 / total, 1)
    flags = {theme: rows["text"].map(lambda text, words=THEMES[theme]: any(word in text for word in words)) for theme in theme_names}
    co = []
    for index, first in enumerate(theme_names):
        for second in theme_names[index + 1:]:
            count = int((flags[first] & flags[second]).sum())
            if count:
                co.append([f"{first} × {second}", count, round(count * 100 / total, 1)])
    positive_terms = Counter(word for text in rows["text"] for word in POSITIVE if word in text).most_common(4)
    negative_terms = Counter(word for text in rows["text"] for word in NEGATIVE if word in text).most_common(4)
    return {"n": total, "score": round(max(1, min(5, 3 + .02 * (positive_rate - risk_rate))), 1), "positiveRate": positive_rate, "riskRate": risk_rate,
            "confidence": "稳定" if total >= 100 else "方向性" if total >= 30 else "探索性", "themes": {theme: theme_detail(theme, rows) for theme in theme_names},
            "people": rates(rows, PEOPLE, 3), "scenes": rates(rows, SCENES, 3), "purposes": rates(rows, PURPOSES, 4), "keywords": rates(rows, KEYWORDS, 8),
            "co": sorted(co, key=lambda item: -item[1])[:3], "problems": problem_details(rows.iloc[0]["category"], rows), "positiveTerms": [[word, count] for word, count in positive_terms], "negativeTerms": [[word, count] for word, count in negative_terms]}

def build(source, output):
    workbook = pd.ExcelFile(source)
    sheet_name = next((name for name in ("天猫_评论", "评论") if name in workbook.sheet_names), None)
    if sheet_name is None:
        raise ValueError(f"missing review sheet: expected one of ['天猫_评论', '评论'], found {workbook.sheet_names}")
    raw = pd.read_excel(workbook, sheet_name=sheet_name)
    required = {"店铺", "品类", "初评时间", "初评", "有用"}
    missing = required.difference(raw.columns)
    if missing:
        raise ValueError(f"missing columns: {sorted(missing)}")
    raw["date_value"] = pd.to_datetime(raw["初评时间"], errors="coerce")
    raw["shop"] = raw["店铺"].fillna("").astype(str).str.strip()
    raw["category"] = raw["品类"].fillna("").astype(str).str.strip()
    raw["rating"] = raw["评价类型"].map(normalize_rating) if "评价类型" in raw.columns else ""
    rating_source = raw[raw["date_value"].notna() & raw["shop"].ne("") & raw["category"].ne("")].copy()
    raw = raw[raw["初评"].map(usable) & raw["date_value"].notna()].copy()
    raw["text"] = raw["初评"].astype(str).str.strip(); raw["shop"] = raw["店铺"].astype(str).str.strip(); raw["category"] = raw["品类"].astype(str).str.strip()
    raw["date"] = raw["date_value"].dt.strftime("%Y-%m-%d")
    raw["month"] = raw["date_value"].map(lambda value: f"{value.year}年{value.month}月"); raw["helpful"] = pd.to_numeric(raw["有用"], errors="coerce").fillna(0)
    months = sorted(raw["month"].unique(), key=lambda label: tuple(map(int, re.findall(r"\d+", label))))
    result = {"months": months, "minDate": rating_source["date_value"].min().strftime("%Y-%m-%d"), "maxDate": rating_source["date_value"].max().strftime("%Y-%m-%d"), "categories": {}}
    for category, theme_names in CATEGORY_THEMES.items():
        category_rows = raw[raw["category"] == category]
        shops = category_rows["shop"].value_counts().index.tolist(); segments = {}
        for month in ["全部时间"] + months:
            month_rows = category_rows if month == "全部时间" else category_rows[category_rows["month"] == month]
            for shop in ["全部店铺"] + shops:
                rows = month_rows if shop == "全部店铺" else month_rows[month_rows["shop"] == shop]
                if not rows.empty:
                    segments[f"{month}|{shop}"] = segment(rows, theme_names)
        review_rows = []
        for _, row in category_rows.drop_duplicates("text").iterrows():
            text = row["text"]
            positive_terms = [word for word in POSITIVE if word in text]
            negative_terms = [word for word in NEGATIVE if word in text]
            review_rows.append({"text": text, "shop": row["shop"], "date": row["date"], "month": row["month"], "helpful": float(row["helpful"]),
                                "themes": matched_labels(text, {name: THEMES[name] for name in theme_names}),
                                "keywords": matched_labels(text, KEYWORDS), "purposes": matched_labels(text, PURPOSES),
                                "people": matched_labels(text, PEOPLE), "scenes": matched_labels(text, SCENES),
                                "problems": matched_problems(category, text), "positiveTerms": positive_terms,
                                "negativeTerms": negative_terms, "positive": len(positive_terms) > len(negative_terms),
                                "risk": bool(negative_terms)})
        category_rating_rows = rating_source[rating_source["category"] == category]
        rating_rows = [{"date": row["date_value"].strftime("%Y-%m-%d"), "shop": row["shop"], "rating": row["rating"]}
                       for _, row in category_rating_rows.iterrows()]
        rating_shops = category_rating_rows["shop"].value_counts().index.tolist()
        result["categories"][category] = {"shops": shops, "ratingShops": rating_shops, "segments": segments, "reviews": review_rows, "ratings": rating_rows}
    target = Path(output)
    if target.suffix == ".js":
        target.write_text("window.REVIEW_FILTER_DATA=" + json.dumps(result, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
        return
    category_dir = target / "categories"
    category_dir.mkdir(parents=True, exist_ok=True)
    files = {}
    for index, (name, payload) in enumerate(result["categories"].items()):
        filename = f"category-{index:02d}.js"
        category_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        category_script = f"window.REVIEW_CATEGORY_DATA=window.REVIEW_CATEGORY_DATA||{{}};window.REVIEW_CATEGORY_DATA[{json.dumps(name, ensure_ascii=False)}]={category_json};\n"
        (category_dir / filename).write_text(category_script, encoding="utf-8")
        files[name] = f"categories/{filename}"
    manifest = {"months": result["months"], "minDate": result["minDate"], "maxDate": result["maxDate"], "categories": files}
    manifest_json = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
    (target / "manifest.js").write_text(f"window.REVIEW_MANIFEST={manifest_json};\n", encoding="utf-8")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_dashboard_data.py SOURCE.xlsx OUTPUT.js")
    build(sys.argv[1], sys.argv[2])
