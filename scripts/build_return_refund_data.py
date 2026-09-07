#!/usr/bin/env python3
"""Build compact browser data from the standard refund-rate workbook.

The source is a weekly SKU/store detail table. Every dashboard rate is
recalculated after filtering as summed returns divided by summed shipments;
source row rates are never averaged.
"""

from __future__ import annotations

import calendar
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(
    "/Users/koralgrey/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
    "xwechat_files/chenjiahui977450_57c0/msg/file/2026-08/"
    "2026年退款率.xlsx"
)
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", str(ROOT / "data")))
OUTPUT_FULL = OUTPUT_DIR / "return-refund-data.js"
OUTPUT_SUMMARY = OUTPUT_DIR / "return-refund-summary-data.js"
XML_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
REQUIRED_COLUMNS = [
    "周", "部门", "客户", "店铺", "商品编码", "商品名称", "运营一级大类",
    "产品一级分类", "运营二级品类", "运营产品简称", "产品规格", "产品颜色",
    "实发数量", "实发金额", "实退数量", "实退金额",
]


def clean(value, fallback=""):
    text = str(value or "").strip()
    if text.upper() in {"#N/A", "N/A", "NAN", "NONE", "NULL", "0"}:
        return fallback
    return text if text else fallback


def number(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def round_number(value):
    rounded = round(float(value), 2)
    return int(rounded) if rounded.is_integer() else rounded


def add_metric(target, returned_qty, shipped_qty, returned_amount, shipped_amount):
    target[0] += returned_qty
    target[1] += shipped_qty
    target[2] += returned_amount
    target[3] += shipped_amount


def serial_metric(values):
    return [round_number(value) for value in values]


def write_js(path, variable, payload):
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(f"window.{variable}={encoded};\n", encoding="utf-8")


def read_shared_strings(archive):
    strings = []
    with archive.open("xl/sharedStrings.xml") as stream:
        for _, element in ET.iterparse(stream, events=("end",)):
            if element.tag == XML_NS + "si":
                strings.append("".join(node.text or "" for node in element.iter(XML_NS + "t")))
                element.clear()
    return strings


def worksheet_path(archive, name):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    relationship_map = {
        item.attrib["Id"]: item.attrib["Target"]
        for item in relationships
        if item.tag.endswith("Relationship")
    }
    for sheet in workbook.find(XML_NS + "sheets"):
        if sheet.attrib.get("name") == name:
            target = relationship_map[sheet.attrib[REL_NS + "id"]]
            return "xl/" + target.lstrip("/")
    raise ValueError(f"源文件缺少工作表：{name}")


def cell_value(cell, shared_strings):
    value_node = cell.find(XML_NS + "v")
    raw = value_node.text if value_node is not None else None
    if cell.attrib.get("t") == "s" and raw is not None:
        return shared_strings[int(raw)]
    inline = cell.find(XML_NS + "is")
    if inline is not None:
        return "".join(node.text or "" for node in inline.iter(XML_NS + "t"))
    return raw


def iter_source_rows(archive, path, shared_strings):
    headers = {}
    with archive.open(path) as stream:
        for _, element in ET.iterparse(stream, events=("end",)):
            if element.tag != XML_NS + "row":
                continue
            row_number = int(element.attrib.get("r", "0"))
            values = {}
            for cell in element.findall(XML_NS + "c"):
                reference = cell.attrib.get("r", "")
                column = "".join(char for char in reference if char.isalpha())
                values[column] = cell_value(cell, shared_strings)
            if row_number == 1:
                headers = {column: clean(value) for column, value in values.items()}
                missing = [column for column in REQUIRED_COLUMNS if column not in headers.values()]
                if missing:
                    raise ValueError(f"源文件字段缺失：{'、'.join(missing)}")
            elif headers:
                yield {header: values.get(column) for column, header in headers.items()}
            element.clear()


def platform_name(department, customer, shop):
    department = clean(department, "其他")
    if department == "经销商":
        return "分销商"
    if department == "天猫平台":
        return "天猫"
    if department == "京东平台":
        return "京东"
    if department == "拼多多":
        return "拼多多"
    if department == "兴趣电商":
        clue = f"{clean(customer)} {clean(shop)}"
        for keyword, label in (("抖音", "抖音"), ("快手", "快手"), ("视频号", "视频号"), ("小红书", "小红书")):
            if keyword in clue:
                return label
        return "兴趣电商"
    return department


def main():
    source = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        raise FileNotFoundError(f"找不到退款率源文件：{source}")
    year_match = re.search(r"(20\d{2})", source.stem)
    source_year = int(year_match.group(1)) if year_match else datetime.now().year
    file_date = datetime.fromtimestamp(source.stat().st_mtime).date()

    week_rows = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    month_rows = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    week_totals = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    month_totals = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    category_week = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    category_month = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])
    week_end_dates = {}
    source_rows = active_rows = classified_rows = 0
    classified_ship_qty = total_ship_qty = 0.0
    missing_category_rows = missing_product_rows = 0
    negative_return_amount_rows = refund_qty_gt_ship_rows = refund_amount_gt_ship_rows = 0

    with zipfile.ZipFile(source) as archive:
        shared_strings = read_shared_strings(archive)
        path = worksheet_path(archive, "聚水潭")
        for row in iter_source_rows(archive, path, shared_strings):
            week = int(number(row.get("周")))
            if week < 1 or week > 53:
                continue
            source_rows += 1
            shipped_qty = number(row.get("实发数量"))
            shipped_amount = number(row.get("实发金额"))
            returned_qty = number(row.get("实退数量"))
            returned_amount = number(row.get("实退金额"))
            if not any((shipped_qty, shipped_amount, returned_qty, returned_amount)):
                continue
            active_rows += 1

            raw_cat1 = clean(row.get("运营一级大类"))
            raw_cat2 = clean(row.get("运营二级品类"))
            cat1 = raw_cat1 if raw_cat1 and raw_cat1 != "-" else "待匹配"
            cat2 = raw_cat2 if raw_cat2 and raw_cat2 != "-" else "待匹配"
            product = clean(row.get("运营产品简称"), clean(row.get("商品名称"), "未填写产品"))
            code = clean(row.get("商品编码"), "无编码")
            sku_name = clean(row.get("商品名称"), product)
            platform = platform_name(row.get("部门"), row.get("客户"), row.get("店铺"))
            shop = clean(row.get("店铺"), "未填写店铺")

            total_ship_qty += shipped_qty
            if cat1 != "待匹配" and cat2 != "待匹配":
                classified_rows += 1
                classified_ship_qty += shipped_qty
            else:
                missing_category_rows += 1
            if not clean(row.get("商品名称")):
                missing_product_rows += 1
            if returned_amount < 0:
                negative_return_amount_rows += 1
            if returned_qty > shipped_qty:
                refund_qty_gt_ship_rows += 1
            if returned_amount > shipped_amount:
                refund_amount_gt_ship_rows += 1

            week_end = date.fromisocalendar(source_year, week, 7)
            week_period = f"{source_year}-W{week:02d}"
            month_period = week_end.strftime("%Y-%m")
            week_end_dates[week_period] = week_end
            key = (platform, shop, cat1, cat2, product, code, sku_name)
            add_metric(week_rows[(week_period, *key)], returned_qty, shipped_qty, returned_amount, shipped_amount)
            add_metric(month_rows[(month_period, *key)], returned_qty, shipped_qty, returned_amount, shipped_amount)
            add_metric(week_totals[week_period], returned_qty, shipped_qty, returned_amount, shipped_amount)
            add_metric(month_totals[month_period], returned_qty, shipped_qty, returned_amount, shipped_amount)
            add_metric(category_week[(week_period, cat1, cat2)], returned_qty, shipped_qty, returned_amount, shipped_amount)
            add_metric(category_month[(month_period, cat1, cat2)], returned_qty, shipped_qty, returned_amount, shipped_amount)

    week_periods = sorted(week_totals)
    month_periods = sorted(month_totals)
    source_min = date.fromisocalendar(source_year, int(week_periods[0][-2:]), 1)
    source_max = min(file_date, week_end_dates[week_periods[-1]])
    complete_weeks = [period for period in week_periods if week_end_dates[period] <= source_max]
    complete_months = []
    for period in month_periods:
        year, month = map(int, period.split("-"))
        month_end = date(year, month, calendar.monthrange(year, month)[1])
        if source_min <= date(year, month, 1) and month_end <= source_max:
            complete_months.append(period)

    maturity_days = 15
    maturity_cutoff = source_max - timedelta(days=maturity_days)
    mature_weeks = [period for period in complete_weeks if week_end_dates[period] <= maturity_cutoff]
    mature_months = []
    for period in complete_months:
        year, month = map(int, period.split("-"))
        if date(year, month, calendar.monthrange(year, month)[1]) <= maturity_cutoff:
            mature_months.append(period)

    anomaly_weeks = []
    for index in range(1, len(week_periods) - 1):
        period = week_periods[index]
        if period not in mature_weeks:
            continue
        previous = week_totals[week_periods[index - 1]]
        current = week_totals[period]
        following = week_totals[week_periods[index + 1]]
        if not all((previous[1], previous[3], current[1], current[3], following[1], following[3])):
            continue
        current_qty_rate = current[0] / current[1]
        current_amount_rate = current[2] / current[3]
        adjacent_qty_rate = ((previous[0] / previous[1]) + (following[0] / following[1])) / 2
        adjacent_amount_rate = ((previous[2] / previous[3]) + (following[2] / following[3])) / 2
        if current_qty_rate < adjacent_qty_rate * 0.5 and current_amount_rate < adjacent_amount_rate * 0.5:
            anomaly_weeks.append(period)

    platforms = sorted({key[1] for key in week_rows})
    shops = sorted({(key[1], key[2]) for key in week_rows})
    cat1_values = sorted({key[3] for key in week_rows})
    cat2_values = sorted({(key[3], key[4]) for key in week_rows})
    sku_values = sorted({(key[3], key[4], key[5], key[6], key[7]) for key in week_rows})
    platform_index = {value: index for index, value in enumerate(platforms)}
    shop_index = {value: index for index, value in enumerate(shops)}
    cat1_index = {value: index for index, value in enumerate(cat1_values)}
    cat2_index = {value: index for index, value in enumerate(cat2_values)}
    sku_index = {value: index for index, value in enumerate(sku_values)}

    def encode(source, periods):
        period_index = {value: index for index, value in enumerate(periods)}
        records = []
        for key, values in sorted(source.items()):
            period, platform, shop, cat1, cat2, product, code, sku_name = key
            records.append([
                period_index[period], cat1_index[cat1], cat2_index[(cat1, cat2)],
                sku_index[(cat1, cat2, product, code, sku_name)], *serial_metric(values),
                platform_index[platform], shop_index[(platform, shop)],
            ])
        return records

    meta = {
        "source": source.name,
        "sourceSheet": "聚水潭",
        "sourceRows": source_rows,
        "activeRows": active_rows,
        "classifiedRows": classified_rows,
        "classifiedRowCoverage": round(classified_rows / active_rows * 100, 2) if active_rows else 0,
        "classifiedQuantityCoverage": round(classified_ship_qty / total_ship_qty * 100, 2) if total_ship_qty else 0,
        "sourceMin": source_min.isoformat(),
        "sourceMax": source_max.isoformat(),
        "latestWeek": week_periods[-1],
        "latestCompleteWeek": complete_weeks[-1] if complete_weeks else "",
        "latestMatureWeek": mature_weeks[-1] if mature_weeks else "",
        "latestCompleteMonth": complete_months[-1] if complete_months else "",
        "latestMatureMonth": mature_months[-1] if mature_months else "",
        "maturityDays": maturity_days,
        "anomalyWeeks": anomaly_weeks,
        "monthRule": "按自然周结束日归属月份，从实退/实发分子分母重新汇总",
        "platformRule": "部门映射平台；经销商显示为分销商，兴趣电商按客户和店铺拆分",
        "quantityRule": "实退数量合计 ÷ 实发数量合计",
        "amountRule": "实退金额合计 ÷ 实发金额合计",
        "quality": {
            "missingCategoryRows": missing_category_rows,
            "missingProductRows": missing_product_rows,
            "negativeReturnAmountRows": negative_return_amount_rows,
            "refundQtyGreaterThanShipRows": refund_qty_gt_ship_rows,
            "refundAmountGreaterThanShipRows": refund_amount_gt_ship_rows,
        },
    }
    full = {
        "meta": meta,
        "periods": {
            "week": week_periods,
            "month": month_periods,
            "completeWeek": complete_weeks,
            "completeMonth": complete_months,
            "matureWeek": mature_weeks,
            "matureMonth": mature_months,
        },
        "platforms": platforms,
        "shops": [[platform_index[platform], shop] for platform, shop in shops],
        "cat1": cat1_values,
        "cat2": [[cat1_index[cat1], cat2] for cat1, cat2 in cat2_values],
        "sku": [[cat1_index[c1], cat2_index[(c1, c2)], product, code, name] for c1, c2, product, code, name in sku_values],
        "week": encode(week_rows, week_periods),
        "month": encode(month_rows, month_periods),
    }

    def summary_rows(source):
        return [[period, cat1, cat2, *serial_metric(values)] for (period, cat1, cat2), values in sorted(source.items())]

    summary = {
        "meta": meta,
        "weekTotals": [[period, *serial_metric(week_totals[period])] for period in week_periods],
        "monthTotals": [[period, *serial_metric(month_totals[period])] for period in month_periods],
        "categoryWeek": summary_rows(category_week),
        "categoryMonth": summary_rows(category_month),
    }

    write_js(OUTPUT_FULL, "RETURN_REFUND_DATA", full)
    write_js(OUTPUT_SUMMARY, "RETURN_REFUND_SUMMARY", summary)
    print(json.dumps({
        "full": str(OUTPUT_FULL),
        "fullBytes": OUTPUT_FULL.stat().st_size,
        "summaryBytes": OUTPUT_SUMMARY.stat().st_size,
        "meta": meta,
        "platforms": platforms,
        "shopCount": len(shops),
        "weekPeriods": [week_periods[0], week_periods[-1], len(week_periods)],
        "monthPeriods": month_periods,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
