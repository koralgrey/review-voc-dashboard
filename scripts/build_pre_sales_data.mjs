import fs from "node:fs/promises";

const artifactTool = process.env.ARTIFACT_TOOL_PATH;
if (!artifactTool) throw new Error("请通过 ARTIFACT_TOOL_PATH 指定 artifact_tool.mjs 的本地路径。");
const { FileBlob, SpreadsheetFile } = await import(`file://${artifactTool}`);
const source = process.argv[2];
if (!source) throw new Error("请传入售前 Excel 源文件路径。");
const output = process.argv[3] || new URL("../data/pre-sales-data.js", import.meta.url).pathname;

const blob = await FileBlob.load(source);
const workbook = await SpreadsheetFile.importXlsx(blob);
const sheet = workbook.worksheets.getItem("客服日维度");
const values = sheet.getRange("A1:Q2395").values;
const headers = values[0].map(String);

const excelDate = value => {
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};
const number = value => {
  if (value == null || value === "" || value === "/") return null;
  const match = String(value).replace(/[,¥\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const percent = value => {
  const n = number(value);
  return Number.isFinite(n) ? n : null;
};

const raw = values.slice(1).map((row, index) => ({
  sourceRow: index + 2,
  date: excelDate(row[0]), platform: String(row[1] || "").trim(), shop: String(row[2] || "").trim(),
  consult: number(row[3]), sales: number(row[4]), salesShare: percent(row[5]), converted: number(row[6]), conversion: percent(row[7]),
  firstResponse: number(row[8]), avgResponse: number(row[9]), refundRate: percent(row[11]), dsr: number(row[12])
})).filter(row => row.date && row.platform && row.shop);

const keyMap = new Map();
raw.forEach(row => {
  const key = `${row.date}|§${row.platform}|§${row.shop}`;
  const list = keyMap.get(key) || [];
  list.push(row);
  keyMap.set(key, list);
});
const duplicateKeys = [...keyMap.entries()].filter(([, rows]) => rows.length > 1);
const duplicateSet = new Set(duplicateKeys.map(([key]) => key));
const clean = raw.filter(row => !duplicateSet.has(`${row.date}|§${row.platform}|§${row.shop}`) && row.consult != null);

function isoWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
const round = (n, digits = 4) => Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
function aggregate(grain) {
  const map = new Map();
  for (const row of clean) {
    const period = grain === "month" ? row.date.slice(0, 7) : isoWeek(row.date);
    const key = `${period}|§${row.platform}|§${row.shop}`;
    const out = map.get(key) || {period, platform:row.platform, shop:row.shop, consult:0, sales:0, converted:0, inquiryBase:0, storeSalesBase:0, shareSales:0, shareDays:0, firstWeighted:0, firstWeight:0, avgWeighted:0, avgWeight:0, days:0};
    out.consult += row.consult || 0;
    out.sales += row.sales || 0;
    out.converted += row.converted || 0;
    if (row.conversion > 0 && row.conversion <= 100 && row.converted != null) out.inquiryBase += row.converted / (row.conversion / 100);
    if (row.salesShare > 0 && row.salesShare <= 100 && row.sales != null) { out.storeSalesBase += row.sales / (row.salesShare / 100); out.shareSales += row.sales; out.shareDays += 1; }
    if (row.firstResponse != null && row.firstResponse >= 0) { out.firstWeighted += row.firstResponse * row.consult; out.firstWeight += row.consult; }
    if (row.avgResponse != null && row.avgResponse >= 0) { out.avgWeighted += row.avgResponse * row.consult; out.avgWeight += row.consult; }
    out.days += 1;
    map.set(key, out);
  }
  return [...map.values()].sort((a,b) => a.period.localeCompare(b.period) || a.platform.localeCompare(b.platform) || a.shop.localeCompare(b.shop)).map(row => ({
    p:row.period, pf:row.platform, s:row.shop, c:round(row.consult,0), a:round(row.sales,2), t:round(row.converted,0),
    ib:round(row.inquiryBase,2), sb:round(row.storeSalesBase,2), sa:round(row.shareSales,2), sd:row.shareDays, fw:round(row.firstWeighted,2), fn:round(row.firstWeight,0),
    aw:round(row.avgWeighted,2), an:round(row.avgWeight,0), d:row.days
  }));
}

const shops = [...new Set(clean.map(row => row.shop))].sort();
const latestByShop = Object.fromEntries(shops.map(shop => [shop, clean.filter(row => row.shop === shop).map(row => row.date).sort().at(-1)]));
const commonComplete = Object.values(latestByShop).sort()[0];
const refundAnomalies = raw.filter(row => row.refundRate > 100).map(row => ({date:row.date, platform:row.platform, shop:row.shop, value:row.refundRate, sourceRow:row.sourceRow}));
const blankRows = raw.filter(row => row.consult == null).map(row => ({date:row.date, platform:row.platform, shop:row.shop, sourceRow:row.sourceRow}));

const data = {
  meta:{sourceMin:clean.map(r=>r.date).sort()[0], sourceMax:clean.map(r=>r.date).sort().at(-1), commonComplete, platforms:[...new Set(clean.map(r=>r.platform))].sort(), shops, latestByShop, rawRows:raw.length, cleanRows:clean.length, duplicateGroups:duplicateKeys.length, blankRows:blankRows.length, refundAnomalies:refundAnomalies.length, sourceFile:source.split("/").at(-1)},
  month:aggregate("month"), week:aggregate("week"),
  audit:{duplicates:duplicateKeys.map(([key,rows])=>({key:key.replaceAll("|§"," / "), rows:rows.map(r=>r.sourceRow)})), blankRows, refundAnomalies}
};

await fs.writeFile(output, `window.PRE_SALES_DATA=${JSON.stringify(data)};\n`, "utf8");
console.log(JSON.stringify({output, bytes:(await fs.stat(output)).size, meta:data.meta, monthRows:data.month.length, weekRows:data.week.length}, null, 2));
