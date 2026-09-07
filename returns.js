(() => {
  "use strict";
  const D = window.RETURN_REFUND_DATA;
  if (!D) return;

  const $ = selector => document.querySelector(selector);
  const root = $("#returnRefundWorkspace");
  const kpis = $("#returnKpis");
  const body = $("#returnDashboardBody");
  const startSelect = $("#returnStart");
  const endSelect = $("#returnEnd");
  const platformSelect = $("#returnPlatform");
  const shopSelect = $("#returnShop");
  const scope = $("#returnScope");
  const fmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
  const money = value => `¥${new Intl.NumberFormat("zh-CN", {maximumFractionDigits:1}).format(Number(value || 0))}`;
  const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const state = { grain:"month", start:"", end:"", platform:-1, shop:-1, cat1:-1, cat2:-1, chart:"trend", metric:"quantityRate", direction:"desc" };
  const indexes = { week:new Map(), month:new Map() };

  for (const grain of ["week", "month"]) {
    D[grain].forEach(record => {
      const period = record[0];
      if (!indexes[grain].has(period)) indexes[grain].set(period, []);
      indexes[grain].get(period).push(record);
    });
  }

  const periods = () => D.periods[state.grain];
  const selectedPeriods = () => {
    const all = periods(), start = all.indexOf(state.start), end = all.indexOf(state.end);
    if (start < 0 || end < 0) return [];
    return all.slice(Math.min(start, end), Math.max(start, end) + 1);
  };
  function setDefaultRange() {
    const matureMonths = D.periods.matureMonth || D.periods.completeMonth || [];
    const all = state.grain === "month" && matureMonths.length ? matureMonths : periods();
    if (state.grain === "week") {
      state.start = all.at(-4) || all[0] || "";
      state.end = all.at(-1) || "";
    } else {
      state.start = all[0] || "";
      state.end = all.at(-1) || "";
    }
  }
  function previousPeriods(list) {
    const all = periods(), index = all.indexOf(list[0]);
    return index >= list.length ? all.slice(index - list.length, index) : [];
  }
  function records(periodList = selectedPeriods()) {
    const list = [];
    periodList.forEach(period => (indexes[state.grain].get(periods().indexOf(period)) || []).forEach(record => {
      if (state.platform >= 0 && record[8] !== state.platform) return;
      if (state.shop >= 0 && record[9] !== state.shop) return;
      if (state.cat1 >= 0 && record[1] !== state.cat1) return;
      if (state.cat2 >= 0 && record[2] !== state.cat2) return;
      list.push(record);
    }));
    return list;
  }
  function aggregate(list) {
    const out = { returnQty:0, shipQty:0, returnAmount:0, shipAmount:0 };
    list.forEach(record => {
      out.returnQty += Number(record[4] || 0);
      out.shipQty += Number(record[5] || 0);
      out.returnAmount += Number(record[6] || 0);
      out.shipAmount += Number(record[7] || 0);
    });
    out.quantityRate = out.shipQty ? out.returnQty / out.shipQty * 100 : NaN;
    out.amountRate = out.shipAmount ? out.returnAmount / out.shipAmount * 100 : NaN;
    return out;
  }
  const change = (current, previous) => Number.isFinite(current) && Number.isFinite(previous) && previous !== 0 ? current - previous : NaN;
  const rate = value => Number.isFinite(value) ? `${value !== 0 && Math.abs(value) < 0.01 ? value.toFixed(3) : value.toFixed(2)}%` : "—";
  const delta = value => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}pp` : "—";
  const trendLabel = period => state.grain === "month" ? period.slice(5) + "月" : period.slice(-3);
  const periodName = () => state.grain === "month" ? "月度" : "周度";
  const metricLabel = () => state.metric === "amountRate" ? "按金额退款率" : "按数量退款率";
  function periodStatus(period) {
    if ((D.meta.anomalyWeeks || []).includes(period)) return {label:"源数据待核查", kind:"anomaly"};
    if (state.grain === "month") {
      if (!(D.periods.completeMonth || []).includes(period)) return {label:"不完整月", kind:"partial"};
      if (!(D.periods.matureMonth || D.periods.completeMonth || []).includes(period)) return {label:"未成熟", kind:"immature"};
    } else {
      if (!(D.periods.completeWeek || []).includes(period)) return {label:"不完整周", kind:"partial"};
      if (D.meta.latestMatureWeek && period > D.meta.latestMatureWeek) return {label:"未满15天", kind:"immature"};
    }
    return null;
  }
  function statusBadge(period) {
    const status = periodStatus(period);
    return status ? `<em class="period-status ${status.kind}">${status.label}</em>` : "";
  }

  function currentLevel() {
    if (state.cat2 >= 0) return "sku";
    if (state.cat1 >= 0) return "cat2";
    return "cat1";
  }
  function groupKey(record, level) {
    if (level === "cat1") return record[1];
    if (level === "cat2") return record[2];
    return record[3];
  }
  function groupName(key, level) {
    if (level === "cat1") return D.cat1[key] || "待匹配";
    if (level === "cat2") return D.cat2[key]?.[1] || "待匹配";
    const sku = D.sku[key] || [];
    return sku[4] || sku[2] || "未填写SKU";
  }
  function groupMeta(key, level) {
    if (level !== "sku") return "";
    const sku = D.sku[key] || [];
    return `${sku[2] || "未匹配产品"} · ${sku[3] || "无编码"}`;
  }
  function grouped(periodList = selectedPeriods(), level = currentLevel()) {
    const map = new Map();
    records(periodList).forEach(record => {
      const key = groupKey(record, level);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(record);
    });
    return [...map].map(([key, list]) => ({ key, name:groupName(key, level), meta:groupMeta(key, level), values:aggregate(list) }));
  }

  function buildCombo(element, values, current, allLabel, onChange) {
    const open = element.classList.contains("open");
    const selected = values.find(item => String(item.value) === String(current));
    element.innerHTML = `<button type="button" class="combo-display"><span>${safe(selected?.label || allLabel)}</span><b>⌄</b></button><div class="combo-menu"><input type="search" placeholder="输入关键词模糊搜索"><div class="combo-options"><button type="button" class="combo-option ${current < 0 ? "active" : ""}" data-value="-1">${safe(allLabel)}</button>${values.map(item => `<button type="button" class="combo-option ${String(item.value) === String(current) ? "active" : ""}" data-value="${item.value}">${safe(item.label)}</button>`).join("")}</div></div>`;
    element.classList.toggle("open", open);
    const input = element.querySelector("input");
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      element.querySelectorAll(".combo-option").forEach(option => option.hidden = query && !option.textContent.toLowerCase().includes(query));
    });
    element.querySelector(".combo-display").addEventListener("click", event => {
      event.stopPropagation();
      document.querySelectorAll(".combo.open").forEach(combo => { if (combo !== element) combo.classList.remove("open"); });
      element.classList.toggle("open");
      if (element.classList.contains("open")) setTimeout(() => input.focus(), 0);
    });
    element.querySelectorAll(".combo-option").forEach(option => option.addEventListener("click", () => {
      element.classList.remove("open");
      onChange(Number(option.dataset.value));
    }));
  }

  function refreshControls() {
    const all = periods();
    if (!all.includes(state.start) || !all.includes(state.end)) setDefaultRange();
    const options = all.map(period => `<option value="${period}">${period}</option>`).join("");
    startSelect.innerHTML = options; endSelect.innerHTML = options;
    startSelect.value = state.start; endSelect.value = state.end;
    platformSelect.innerHTML = `<option value="-1">全部平台</option>${D.platforms.map((label,value)=>`<option value="${value}">${safe(label)}</option>`).join("")}`;
    platformSelect.value = String(state.platform);
    const shopOptions = D.shops.map((item,value)=>({value,platform:item[0],label:item[1]})).filter(item=>state.platform<0||item.platform===state.platform);
    if(state.shop>=0&&!shopOptions.some(item=>item.value===state.shop))state.shop=-1;
    shopSelect.innerHTML = `<option value="-1">全部店铺</option>${shopOptions.map(item=>`<option value="${item.value}">${safe(item.label)}</option>`).join("")}`;
    shopSelect.value = String(state.shop);
    document.querySelectorAll("[data-return-grain]").forEach(button => button.classList.toggle("active", button.dataset.returnGrain === state.grain));
    const cat1Options = D.cat1.map((label, value) => ({label, value}));
    buildCombo($("#returnCat1Combo"), cat1Options, state.cat1, "全部一级大类", value => {state.cat1=value;state.cat2=-1;refresh();});
    const cat2Options = D.cat2.map((item, value) => ({value,label:item[1],cat1:item[0]})).filter(item => state.cat1 < 0 || item.cat1 === state.cat1);
    buildCombo($("#returnCat2Combo"), cat2Options, state.cat2, "全部二级品类", value => {state.cat2=value;if(value>=0)state.cat1=D.cat2[value][0];refresh();});
    const c1 = state.cat1 >= 0 ? D.cat1[state.cat1] : "全部一级大类";
    const c2 = state.cat2 >= 0 ? D.cat2[state.cat2][1] : "全部二级品类";
    const platform = state.platform >= 0 ? D.platforms[state.platform] : "全部平台";
    const shop = state.shop >= 0 ? D.shops[state.shop][1] : "全部店铺";
    const flagged = selectedPeriods().filter(period => periodStatus(period));
    scope.innerHTML = `<span>当前分析范围</span><strong>${safe(state.start)} 至 ${safe(state.end)} · ${safe(platform)} · ${safe(shop)} · ${safe(c1)} · ${safe(c2)}</strong>${flagged.length?`<small>${flagged.map(period=>`${safe(trendLabel(period))}${statusBadge(period)}`).join(" ")}</small>`:""}`;
  }

  function renderKpis() {
    const current = aggregate(records()), priorPeriods = previousPeriods(selectedPeriods()), previous = priorPeriods.length === selectedPeriods().length ? aggregate(records(priorPeriods)) : null;
    const cards = [
      {label:"发货退货退款率（按数量）",value:rate(current.quantityRate),delta:previous?delta(change(current.quantityRate,previous.quantityRate)):"—",note:"实退数量合计 ÷ 实发数量合计"},
      {label:"发货退货退款率（按金额）",value:rate(current.amountRate),delta:previous?delta(change(current.amountRate,previous.amountRate)):"—",note:"实退金额合计 ÷ 实发金额合计"}
    ];
    kpis.innerHTML = cards.map((card,index) => `<article class="return-kpi ${index ? "amount" : "order"}"><span>${card.label}</span><strong>${card.value}</strong><b class="${card.delta.startsWith("+") ? "bad" : card.delta.startsWith("-") ? "good" : ""}">较前一等长期 ${card.delta}</b><small>${card.note}</small></article>`).join("");
  }

  function seriesFor(level, key = null) {
    return selectedPeriods().map(period => {
      const list = records([period]);
      const filtered = key === null ? list : list.filter(record => groupKey(record, level) === key);
      return {period, ...aggregate(filtered)};
    });
  }
  function trendSvg(series, compact = false) {
    const W=1000,H=compact?250:390,L=62,R=55,T=62,B=52,iw=W-L-R,ih=H-T-B;
    const quantityValues=series.map(item=>item.quantityRate),amountValues=series.map(item=>item.amountRate),finite=[...quantityValues,...amountValues].filter(Number.isFinite),max=Math.max(1,...finite)*1.14;
    const x=index=>L+(series.length===1?iw/2:index*iw/(series.length-1)),y=value=>T+ih-(Number.isFinite(value)?value:0)/max*ih;
    const path=values=>values.map((value,index)=>Number.isFinite(value)?`${index&&Number.isFinite(values[index-1])?"L":"M"}${x(index)},${y(value)}`:"").join(" ");
    let svg=`<svg class="return-trend-svg" viewBox="0 0 ${W} ${H}">`;
    for(let index=0;index<4;index++){const gy=T+index*ih/3;svg+=`<line x1="${L}" y1="${gy}" x2="${W-R}" y2="${gy}" stroke="var(--line)"/>`;}
    svg+=`<text x="${L}" y="${T-23}" fill="var(--muted)" font-size="13">退款率 0–${max.toFixed(1)}%</text><path d="${path(quantityValues)}" fill="none" stroke="var(--red)" stroke-width="4"/><path d="${path(amountValues)}" fill="none" stroke="var(--green)" stroke-width="4" stroke-dasharray="10 8"/>`;
    series.forEach((item,index)=>{
      const previous=index?series[index-1]:null;
      const tip=safe(JSON.stringify({period:item.period,quantity:item.quantityRate,amount:item.amountRate,quantityMom:previous?change(item.quantityRate,previous.quantityRate):NaN,amountMom:previous?change(item.amountRate,previous.amountRate):NaN}));
      svg+=`<text x="${x(index)}" y="${H-17}" text-anchor="middle" fill="var(--muted)" font-size="13">${safe(trendLabel(item.period))}</text>`;
      if(Number.isFinite(item.quantityRate))svg+=`<g class="return-chart-node" data-return-tip="${tip}"><circle cx="${x(index)}" cy="${y(item.quantityRate)}" r="7" fill="var(--panel)" stroke="var(--red)" stroke-width="4"/><text x="${x(index)}" y="${Math.max(18,y(item.quantityRate)-13)}" text-anchor="middle" fill="var(--red)" font-size="12" font-weight="800">${rate(item.quantityRate)}</text></g>`;
      if(Number.isFinite(item.amountRate))svg+=`<g class="return-chart-node" data-return-tip="${tip}"><circle cx="${x(index)}" cy="${y(item.amountRate)}" r="7" fill="var(--panel)" stroke="var(--green)" stroke-width="4"/><text x="${x(index)}" y="${Math.min(H-B+25,y(item.amountRate)+23)}" text-anchor="middle" fill="var(--green)" font-size="12" font-weight="800">${rate(item.amountRate)}</text></g>`;
    });
    return svg+`</svg>`;
  }

  function trendPanel() {
    return `<div class="return-legend"><span><i></i>红色实线：按数量退款率</span><span><i class="green"></i>绿色虚线：按金额退款率</span></div>${trendSvg(seriesFor(currentLevel()))}<div class="notice">${state.grain==="month"?`月度按自然周结束日归属，再从实退/实发分子分母重新汇总。默认选择满足 ${D.meta.maturityDays||15} 天观察窗的成熟月（截至 ${D.meta.latestMatureMonth||"—"}），未成熟或不完整周期仅供观察。`:`最近4周使用源表自然周；完整周截止 ${D.meta.latestCompleteWeek||"—"}，正式结论成熟截止 ${D.meta.latestMatureWeek||"—"}。`}${(D.meta.anomalyWeeks||[]).length?`源表 ${D.meta.anomalyWeeks.join("、")} 全盘指标异常偏低，已标记待核查。`:""}</div>`;
  }

  function quadrantPanel() {
    const level=currentLevel(),items=grouped().filter(item=>Number.isFinite(item.values.quantityRate)&&Number.isFinite(item.values.amountRate)).sort((a,b)=>b.values.shipAmount-a.values.shipAmount).slice(0,45),total=aggregate(records());
    if(!items.length)return `<div class="empty">当前筛选没有可用象限数据</div>`;
    const W=1000,H=470,L=78,R=40,T=46,B=68,maxX=Math.max(total.quantityRate*1.4,...items.map(item=>item.values.quantityRate),1),maxY=Math.max(total.amountRate*1.4,...items.map(item=>item.values.amountRate),1),x=value=>L+value/maxX*(W-L-R),y=value=>T+(H-T-B)-value/maxY*(H-T-B),bx=x(total.quantityRate),by=y(total.amountRate);
    let svg=`<svg class="return-quadrant-svg" viewBox="0 0 ${W} ${H}"><rect x="${L}" y="${T}" width="${bx-L}" height="${by-T}" fill="rgba(240,139,0,.08)"/><rect x="${bx}" y="${T}" width="${W-R-bx}" height="${by-T}" fill="rgba(223,45,34,.08)"/><rect x="${L}" y="${by}" width="${bx-L}" height="${H-B-by}" fill="rgba(15,155,141,.08)"/><rect x="${bx}" y="${by}" width="${W-R-bx}" height="${H-B-by}" fill="rgba(31,115,239,.07)"/><line x1="${bx}" y1="${T}" x2="${bx}" y2="${H-B}" stroke="var(--muted)" stroke-dasharray="6 6"/><line x1="${L}" y1="${by}" x2="${W-R}" y2="${by}" stroke="var(--muted)" stroke-dasharray="6 6"/><text x="${L+12}" y="${T+24}" fill="var(--orange)" font-weight="800">低频高金额</text><text x="${W-R-12}" y="${T+24}" text-anchor="end" fill="var(--red)" font-weight="800">高频且高金额 · 优先处理</text><text x="${L+12}" y="${H-B-12}" fill="var(--green)" font-weight="800">相对健康</text><text x="${W-R-12}" y="${H-B-12}" text-anchor="end" fill="var(--blue)" font-weight="800">高频低金额</text>`;
    items.forEach((item,index)=>{const color=item.values.quantityRate>total.quantityRate&&item.values.amountRate>total.amountRate?"var(--red)":item.values.quantityRate>total.quantityRate?"var(--blue)":item.values.amountRate>total.amountRate?"var(--orange)":"var(--green)",radius=Math.max(5,Math.min(15,5+Math.sqrt(item.values.shipAmount/Math.max(1,total.shipAmount))*30)),tip=safe(JSON.stringify({name:item.name,quantity:item.values.quantityRate,amount:item.values.amountRate,shipQty:item.values.shipQty,shipAmount:item.values.shipAmount}));svg+=`<g class="return-risk-node" data-return-key="${item.key}" data-return-level="${level}" data-return-risk-tip="${tip}"><circle cx="${x(item.values.quantityRate)}" cy="${y(item.values.amountRate)}" r="${radius}" fill="${color}" opacity=".86"/><text x="${x(item.values.quantityRate)+radius+5}" y="${y(item.values.amountRate)-radius-2}" fill="var(--text)" font-size="11">${safe(item.name.length>10?item.name.slice(0,9)+"…":item.name)}</text></g>`;});
    svg+=`<text x="${(L+W-R)/2}" y="${H-18}" text-anchor="middle" fill="var(--muted)">按数量退款率</text><text transform="translate(20 ${(T+H-B)/2}) rotate(-90)" text-anchor="middle" fill="var(--muted)">按金额退款率</text></svg>`;
    return `${svg}<div class="muted-box">虚线为当前父级范围的动态基准：数量 ${rate(total.quantityRate)}，金额 ${rate(total.amountRate)}。气泡大小表示发货金额，点击可继续下钻。</div>`;
  }

  function rankingTable() {
    const level=currentLevel(),items=grouped(),prior=previousPeriods(selectedPeriods()),metric=state.metric,lastPeriods=selectedPeriods().slice(-4);
    const buildMap=list=>{const map=new Map();list.forEach(record=>{const key=groupKey(record,level);if(!map.has(key))map.set(key,[]);map.get(key).push(record);});return new Map([...map].map(([key,value])=>[key,aggregate(value)]));};
    const priorMap=prior.length===selectedPeriods().length?buildMap(records(prior)):new Map(),trendMaps=lastPeriods.map(period=>buildMap(records([period])));
    const rows=items.map(item=>({...item,previous:priorMap.get(item.key)||null,trend:trendMaps.map(map=>map.get(item.key)||{quantityRate:NaN,amountRate:NaN})})).filter(item=>Number.isFinite(item.values[metric])).sort((a,b)=>(state.direction==="desc"?-1:1)*(a.values[metric]-b.values[metric]));
    const levelLabel=level==="cat1"?"运营一级大类":level==="cat2"?"运营二级品类":"SKU明细";
    const max=Math.max(1,...rows.map(item=>item.values[metric]));
    return `<div class="section-head"><div><span class="section-index">03 · 排名与下钻</span><h2>${levelLabel}退款风险排名</h2><p class="subtitle">只比较两项核心退款率，默认按当前指标降序</p></div><div class="return-head-actions">${state.cat1>=0?`<button class="back" data-return-back>← 返回上一级</button>`:""}<div class="return-sort"><select id="returnSortMetric"><option value="quantityRate" ${metric==="quantityRate"?"selected":""}>按数量退款率</option><option value="amountRate" ${metric==="amountRate"?"selected":""}>按金额退款率</option></select><button data-return-direction="desc" class="${state.direction==="desc"?"active":""}">降序</button><button data-return-direction="asc" class="${state.direction==="asc"?"active":""}">升序</button></div></div></div><div class="table-wrap"><table style="min-width:1260px"><thead><tr><th>${levelLabel}</th><th>风险规模</th><th>按数量</th><th>较前一等长期</th><th>按金额</th><th>较前一等长期</th><th>分母覆盖</th><th>近4期趋势（${metricLabel()}）</th><th>下钻</th></tr></thead><tbody>${rows.map((item,index)=>{const quantityChange=item.previous?change(item.values.quantityRate,item.previous.quantityRate):NaN,amountChange=item.previous?change(item.values.amountRate,item.previous.amountRate):NaN;return `<tr class="return-row" data-return-key="${item.key}" data-return-level="${level}"><td><span class="rank">${index+1}</span><strong>${safe(item.name)}</strong>${item.meta?`<br><small>${safe(item.meta)}</small>`:""}</td><td><div class="bar"><i style="width:${Math.max(3,item.values[metric]/max*100)}%"></i></div></td><td><b>${rate(item.values.quantityRate)}</b></td><td class="${quantityChange>0?"bad":quantityChange<0?"good":""}">${delta(quantityChange)}</td><td><b>${rate(item.values.amountRate)}</b></td><td class="${amountChange>0?"bad":amountChange<0?"good":""}">${delta(amountChange)}</td><td><small>${fmt.format(item.values.shipQty)}件<br>${money(item.values.shipAmount)}</small></td><td><small class="return-period-trend">${item.trend.map((value,i)=>`<span>${safe(trendLabel(lastPeriods[i]))} ${rate(value[metric])}${statusBadge(lastPeriods[i])}</span>`).join("<b>→</b>")}</small></td><td><button class="drill">${level==="sku"?"查看":"下钻"} ›</button></td></tr>`;}).join("")}</tbody></table></div>`;
  }

  function breadcrumb() {
    const platform=state.platform>=0?D.platforms[state.platform]:"全部平台",shop=state.shop>=0?D.shops[state.shop][1]:"全部店铺",c1=state.cat1>=0?D.cat1[state.cat1]:"全部一级大类",c2=state.cat2>=0?D.cat2[state.cat2][1]:"全部二级品类";
    return `<div class="return-breadcrumb"><div><span class="section-index">01 · 当前层级</span><strong>${safe(c1)} › ${safe(c2)}</strong><small>${safe(platform)} · ${safe(shop)} · ${periodName()}趋势 · 可下钻至 SKU</small></div>${state.cat1>=0?`<button class="back" data-return-back>← 返回上一级</button>`:""}</div>`;
  }
  function renderBody() {
    const quality=D.meta.quality||{};
    body.innerHTML = `<section class="return-breadcrumb-card panel">${breadcrumb()}</section><article class="card return-analysis-card"><div class="section-head"><div><span class="section-index">02 · 可视化</span><h2>${periodName()}退款风险分析</h2><p class="subtitle">趋势与象限共用同一组时间、平台、店铺、一级大类和二级品类筛选</p></div><div class="return-chart-tabs"><button data-return-chart="trend" class="${state.chart==="trend"?"active":""}">趋势分析</button><button data-return-chart="quadrant" class="${state.chart==="quadrant"?"active":""}">风险象限</button></div></div>${state.chart==="trend"?trendPanel():quadrantPanel()}</article><article class="card return-ranking-card">${rankingTable()}</article><div class="notice">数据源：${safe(D.meta.source)} · ${safe(D.meta.sourceSheet||"聚水潭")}。${safe(D.meta.platformRule||"")} 分类有效行覆盖率 ${Number(D.meta.classifiedRowCoverage||0).toFixed(2)}%；待匹配 ${fmt.format(quality.missingCategoryRows||0)} 行、负数退款金额 ${fmt.format(quality.negativeReturnAmountRows||0)} 行均保留备查。</div>`;
    bindTips();
  }
  function refresh(){refreshControls();renderKpis();renderBody();}

  function drill(level,key){
    if(level==="cat1"){state.cat1=Number(key);state.cat2=-1;refresh();return;}
    if(level==="cat2"){state.cat2=Number(key);state.cat1=D.cat2[state.cat2][0];refresh();return;}
    const sku=D.sku[Number(key)]||[],values=aggregate(records().filter(record=>record[3]===Number(key))),series=seriesFor("sku",Number(key));
    window.DASHBOARD_MODAL?.open({title:`${sku[4]||sku[2]||"SKU明细"}`,subtitle:`${sku[2]||"未匹配产品"} · ${sku[3]||"无编码"} · ${state.start} 至 ${state.end}`,html:`<div class="modal-summary"><span>按数量 <b>${rate(values.quantityRate)}</b></span><span>按金额 <b>${rate(values.amountRate)}</b></span><span>发货数量 <b>${fmt.format(values.shipQty)}</b></span><span>发货金额 <b>${money(values.shipAmount)}</b></span></div>${trendSvg(series,true)}<div class="muted-box">率值均由当前筛选范围的实退/实发分子分母重新计算。</div>`});
  }
  function bindTips(){
    const tooltip=$("#tooltip");
    document.querySelectorAll("[data-return-tip]").forEach(node=>{node.onmouseenter=()=>{const data=JSON.parse(node.dataset.returnTip);tooltip.innerHTML=`<b>${safe(data.period)}</b><br>按数量：${rate(data.quantity)}<br>环比：${delta(data.quantityMom)}<br>按金额：${rate(data.amount)}<br>环比：${delta(data.amountMom)}${state.grain==="month"?"<br>同比：—（源表无去年基期）":""}`;tooltip.style.display="block";};node.onmousemove=event=>{tooltip.style.left=`${event.clientX+14}px`;tooltip.style.top=`${event.clientY+14}px`;};node.onmouseleave=()=>tooltip.style.display="none";});
    document.querySelectorAll("[data-return-risk-tip]").forEach(node=>{node.onmouseenter=()=>{const data=JSON.parse(node.dataset.returnRiskTip);tooltip.innerHTML=`<b>${safe(data.name)}</b><br>按数量：${rate(data.quantity)}<br>按金额：${rate(data.amount)}<br>发货数量：${fmt.format(data.shipQty)}<br>发货金额：${money(data.shipAmount)}`;tooltip.style.display="block";};node.onmousemove=event=>{tooltip.style.left=`${event.clientX+14}px`;tooltip.style.top=`${event.clientY+14}px`;};node.onmouseleave=()=>tooltip.style.display="none";});
  }

  root.addEventListener("click",event=>{
    const grain=event.target.closest("[data-return-grain]");if(grain){state.grain=grain.dataset.returnGrain;setDefaultRange();refresh();return;}
    const chart=event.target.closest("[data-return-chart]");if(chart){state.chart=chart.dataset.returnChart;renderBody();return;}
    const direction=event.target.closest("[data-return-direction]");if(direction){state.direction=direction.dataset.returnDirection;renderBody();return;}
    const back=event.target.closest("[data-return-back]");if(back){if(state.cat2>=0)state.cat2=-1;else state.cat1=-1;refresh();return;}
    const target=event.target.closest("[data-return-key]");if(target){drill(target.dataset.returnLevel,Number(target.dataset.returnKey));return;}
  });
  root.addEventListener("change",event=>{
    if(event.target===startSelect){state.start=event.target.value;if(state.start>state.end)state.end=state.start;refresh();}
    if(event.target===endSelect){state.end=event.target.value;if(state.end<state.start)state.start=state.end;refresh();}
    if(event.target===platformSelect){state.platform=Number(event.target.value);state.shop=-1;refresh();}
    if(event.target===shopSelect){state.shop=Number(event.target.value);if(state.shop>=0)state.platform=D.shops[state.shop][0];refresh();}
    if(event.target.id==="returnSortMetric"){state.metric=event.target.value;renderBody();}
  });
  document.addEventListener("click",event=>{if(!event.target.closest(".combo"))document.querySelectorAll(".combo.open").forEach(combo=>combo.classList.remove("open"));});

  setDefaultRange();
  window.RETURN_REFUND_APP = { render:refresh };
  refresh();
})();
