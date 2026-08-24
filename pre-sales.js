(() => {
  "use strict";
  const D = window.PRE_SALES_DATA;
  if (!D) return;

  const $ = selector => document.querySelector(selector);
  const pre = $("#preSalesWorkspace"), weekly = $("#weeklyReviewWorkspace"), after = $("#afterSalesWorkspace"), returns = $("#returnRefundWorkspace");
  const kpis = $("#preKpis"), body = $("#preDashboardBody");
  const platformSelect = $("#prePlatform"), shopSelect = $("#preShop"), startSelect = $("#preStart"), endSelect = $("#preEnd"), scope = $("#preScope");
  const fmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
  const money = value => `¥${fmt.format(Number(value || 0))}`;
  const pct = value => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "—";
  const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  const state = { page:"analysis", grain:"month", start:"", end:"", platform:"", shop:"", metric:"sales", radarMode:"platform" };
  let workspace = "weekly", afterSalesPromise = null, returnRefundPromise = null;

  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = src; script.onload = resolve;
    script.onerror = () => reject(new Error(`加载失败：${src}`)); document.head.appendChild(script);
  });
  function ensureAfterSales() {
    if (window.AFTER_SALES_DATA) return Promise.resolve();
    if (afterSalesPromise) return afterSalesPromise;
    $("#dataStatus").textContent = "正在加载售后分析数据…";
    $("#dashboardBody").innerHTML = `<article class="card loading-card"><div class="loading-dot"></div><h2>正在加载售后数据…</h2><p class="subtitle">首次进入售后页加载，后续切换直接使用缓存。</p></article>`;
    afterSalesPromise = loadScript("../data/after-sales-data.js?v=20260821-10").then(() => loadScript("../after-sales.js?v=20260824-18")).catch(error => {
      afterSalesPromise = null;
      $("#dashboardBody").innerHTML = `<article class="card"><div class="empty">${safe(error.message)}，请刷新后重试。</div></article>`;
      throw error;
    });
    return afterSalesPromise;
  }
  function ensureReturnRefund() {
    if (window.RETURN_REFUND_APP) return Promise.resolve();
    if (returnRefundPromise) return returnRefundPromise;
    $("#dataStatus").textContent = "正在加载退货退款分析数据…";
    $("#returnDashboardBody").innerHTML = `<article class="card loading-card"><div class="loading-dot"></div><h2>正在加载退货退款数据…</h2><p class="subtitle">SKU明细仅在首次进入本页时加载，后续切换直接使用缓存。</p></article>`;
    returnRefundPromise = loadScript("../data/return-refund-data.js?v=20260824-20").then(() => loadScript("../returns.js?v=20260824-20")).catch(error => {
      returnRefundPromise = null;
      $("#returnDashboardBody").innerHTML = `<article class="card"><div class="empty">${safe(error.message)}，请刷新后重试。</div></article>`;
      throw error;
    });
    return returnRefundPromise;
  }

  const rows = () => state.grain === "month" ? D.month : D.week;
  const periods = () => [...new Set(rows().map(row => row.p))].sort();
  function isoWeek(dateString) {
    const date = new Date(`${dateString}T00:00:00Z`), day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - start) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  function previousMonth(month) {
    const [year, value] = month.split("-").map(Number), date = new Date(Date.UTC(year, value - 2, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const currentPartial = () => state.grain === "month" ? D.meta.sourceMax.slice(0, 7) : isoWeek(D.meta.sourceMax);
  const maxComplete = () => state.grain === "month" ? previousMonth(D.meta.commonComplete.slice(0, 7)) : isoWeek(D.meta.commonComplete);
  function setDefaultRange() {
    const all = periods();
    if (state.grain === "week") {
      const complete = all.filter(period => period <= maxComplete());
      state.start = complete.at(-4) || all[0] || ""; state.end = complete.at(-1) || all.at(-1) || "";
    } else {
      const currentYear = D.meta.sourceMax.slice(0, 4), yearPeriods = all.filter(period => period.startsWith(currentYear));
      state.start = yearPeriods[0] || all[0] || ""; state.end = all.at(-1) || "";
    }
  }
  function selectedPeriods() {
    const all = periods(), start = all.indexOf(state.start), end = all.indexOf(state.end);
    if (start < 0 || end < 0) return [];
    return all.slice(Math.min(start, end), Math.max(start, end) + 1);
  }
  function previousPeriods(list) {
    const all = periods(), index = all.indexOf(list[0]);
    return index < list.length ? [] : all.slice(index - list.length, index);
  }
  function filtered(periodList = selectedPeriods(), extra = {}) {
    const set = new Set(periodList);
    const platform = extra.platform !== undefined ? extra.platform : state.platform;
    const shop = extra.shop !== undefined ? extra.shop : state.shop;
    return rows().filter(row => set.has(row.p) && (!platform || row.pf === platform) && (!shop || row.s === shop));
  }
  function combine(list) {
    const result = { consult:0, sales:0, converted:0, inquiryBase:0, storeSalesBase:0, shareSales:0, shareDays:0, fw:0, fn:0, aw:0, an:0, refundWeighted:0, refundWeight:0, days:0 };
    list.forEach(row => {
      result.consult += row.c || 0; result.sales += row.a || 0; result.converted += row.t || 0; result.inquiryBase += row.ib || 0;
      result.storeSalesBase += row.sb || 0; result.shareSales += row.sa || 0; result.shareDays += row.sd || 0;
      result.fw += row.fw || 0; result.fn += row.fn || 0; result.aw += row.aw || 0; result.an += row.an || 0;
      result.refundWeighted += row.rw || 0; result.refundWeight += row.rn || 0; result.days += row.d || 0;
    });
    result.conversion = result.inquiryBase ? result.converted / result.inquiryBase * 100 : NaN;
    result.salesShareCoverage = result.days ? result.shareDays / result.days * 100 : 0;
    result.salesShare = result.storeSalesBase && result.salesShareCoverage >= 90 ? result.shareSales / result.storeSalesBase * 100 : NaN;
    result.salesPerConsult = result.consult ? result.sales / result.consult : NaN;
    result.first = result.fn ? result.fw / result.fn : NaN; result.avg = result.an ? result.aw / result.an : NaN;
    result.refund = result.refundWeight ? result.refundWeighted / result.refundWeight : NaN;
    result.daily = result.days ? result.consult / result.days : NaN;
    return result;
  }
  const change = (current, previous) => Number.isFinite(current) && Number.isFinite(previous) && previous !== 0 ? (current / previous - 1) * 100 : NaN;
  const metrics = {
    consult:{ label:"咨询人数", key:"consult", format:value=>`${fmt.format(value)}人`, short:value=>fmt.format(value), note:"有效客服咨询人数" },
    sales:{ label:"销售额", key:"sales", format:money, short:value=>value>=10000?`${(value/10000).toFixed(1)}万`:money(value), note:"客服销售额（去退）" },
    salesShare:{ label:"销售占比", key:"salesShare", format:value=>Number.isFinite(value)?`${value.toFixed(2)}%`:"—", short:value=>`${value.toFixed(1)}%`, note:"客服销售额 ÷ 店铺销售额" },
    converted:{ label:"成交人数", key:"converted", format:value=>`${fmt.format(value)}人`, short:value=>fmt.format(value), note:"原表询单成交人数" },
    conversion:{ label:"转化率", key:"conversion", format:value=>Number.isFinite(value)?`${value.toFixed(2)}%`:"—", short:value=>`${value.toFixed(1)}%`, note:"按原表口径加权估算" },
    first:{ label:"首次响应", key:"first", format:value=>Number.isFinite(value)?`${value.toFixed(2)}秒`:"—", short:value=>`${value.toFixed(1)}秒`, note:"越低越好", inverse:true },
    avg:{ label:"平均响应", key:"avg", format:value=>Number.isFinite(value)?`${value.toFixed(2)}秒`:"—", short:value=>`${value.toFixed(1)}秒`, note:"越低越好", inverse:true },
    refund:{ label:"退款率", key:"refund", format:value=>Number.isFinite(value)?`${value.toFixed(2)}%`:"—", short:value=>`${value.toFixed(1)}%`, note:"异常值不纳入汇总", inverse:true }
  };
  const metric = () => metrics[state.metric];
  function metricCardDisplay(id, value, definition) {
    const full = definition.format(value);
    if (!Number.isFinite(value)) return {display:full, full};
    if (id === "sales") {
      if (Math.abs(value) >= 100000000) return {display:`¥${(value / 100000000).toFixed(2)}亿`, full};
      if (Math.abs(value) >= 10000) return {display:`¥${(value / 10000).toFixed(1)}万`, full};
    }
    if (["consult", "converted"].includes(id) && Math.abs(value) >= 10000000) return {display:`${(value / 10000).toFixed(1)}万人`, full};
    return {display:full, full};
  }

  function refreshControls() {
    const all = periods();
    if (!state.start || !all.includes(state.start) || !state.end || !all.includes(state.end)) setDefaultRange();
    const options = all.map(period => `<option value="${period}">${period}</option>`).join("");
    startSelect.innerHTML = options; endSelect.innerHTML = options; startSelect.value = state.start; endSelect.value = state.end;
    platformSelect.innerHTML = `<option value="">全部平台</option>${D.meta.platforms.map(value => `<option value="${safe(value)}">${safe(value)}</option>`).join("")}`; platformSelect.value = state.platform;
    const shops = D.meta.shops.filter(shop => !state.platform || D.month.some(row => row.pf === state.platform && row.s === shop));
    if (state.shop && !shops.includes(state.shop)) state.shop = "";
    shopSelect.innerHTML = `<option value="">全部店铺</option>${shops.map(value => `<option value="${safe(value)}">${safe(value)}</option>`).join("")}`; shopSelect.value = state.shop;
    document.querySelectorAll("[data-pre-grain]").forEach(button => button.classList.toggle("active", button.dataset.preGrain === state.grain));
    document.querySelectorAll("[data-pre-page]").forEach(button => button.classList.toggle("active", button.dataset.prePage === state.page));
    scope.textContent = `${state.start} 至 ${state.end} · ${state.platform || "全部平台"} · ${state.shop || "全部店铺"}`;
  }
  function renderKpis() {
    if (state.page === "audit") {
      const cards = [["原始记录",fmt.format(D.meta.rawRows),"客服日维度"],["重复日组",fmt.format(D.meta.duplicateGroups),"已从正式汇总剔除"],["空指标行",fmt.format(D.meta.blankRows),"不计入经营合计"],["退款率异常",fmt.format(D.meta.refundAnomalies),"大于100%，待确认口径"]];
      kpis.className = "kpis";
      kpis.innerHTML = cards.map(([label,value,note]) => `<article class="kpi"><span class="label">${label}</span><strong>${value}</strong><small>${note}</small></article>`).join(""); return;
    }
    const current = combine(filtered()), priorList = previousPeriods(selectedPeriods()), previous = combine(filtered(priorList));
    const comparable = priorList.length === selectedPeriods().length;
    kpis.className = "pre-metric-grid";
    kpis.innerHTML = Object.entries(metrics).map(([id, definition]) => {
      const value = current[definition.key]; let note = definition.note;
      if (id === "refund" && !Number.isFinite(value)) note = `${D.meta.refundAnomalies}条异常，暂不汇总`;
      else if (comparable && Number.isFinite(value)) note = `较前期 ${pct(change(value, previous[definition.key]))}`;
      const shown = metricCardDisplay(id, value, definition);
      return `<button class="pre-metric-card ${state.metric===id?"active":""}" data-pre-metric="${id}" title="${safe(definition.label)}：${safe(shown.full)}"><span>${definition.label}</span><strong class="pre-metric-value">${safe(shown.display)}</strong><small>${note}${shown.display!==shown.full?` · 悬停看完整值`:""}</small></button>`;
    }).join("");
  }

  const periodSeries = () => selectedPeriods().map(period => ({ period, values:combine(filtered([period])) }));
  function yoyValue(period, key) {
    if (state.grain !== "month") return NaN;
    const target = `${Number(period.slice(0,4))-1}-${period.slice(5)}`;
    return combine(filtered([target]))[key];
  }
  function trendChart() {
    const definition = metric(), list = periodSeries(), values = list.map(item => item.values[definition.key]), valid = values.filter(Number.isFinite);
    if (!valid.length) return `<div class="empty"><strong>${definition.label}暂无可用趋势数据</strong><br>当前源数据只保留退款率异常清单，未将有效退款率写入月/周汇总。</div>`;
    const width=1000,height=380,left=72,right=45,top=58,bottom=58,innerWidth=width-left-right,innerHeight=height-top-bottom;
    const min=definition.inverse?Math.min(...valid):0,max=Math.max(...valid),padding=Math.max((max-min)*.15,max*.08,1),domainMin=definition.inverse?Math.max(0,min-padding):0,domainMax=max+padding;
    const x=index=>left+(list.length===1?innerWidth/2:index*innerWidth/(list.length-1));
    const y=value=>top+innerHeight-(value-domainMin)/Math.max(1e-9,domainMax-domainMin)*innerHeight;
    let path="";
    values.forEach((value,index)=>{if(Number.isFinite(value))path+=`${path&&Number.isFinite(values[index-1])?"L":"M"}${x(index)},${y(value)} `;});
    let svg=`<svg class="trend-svg" viewBox="0 0 ${width} ${height}">`;
    for(let index=0;index<4;index++){const gridY=top+index*innerHeight/3;svg+=`<line x1="${left}" y1="${gridY}" x2="${width-right}" y2="${gridY}" stroke="var(--line)"/>`;}
    svg+=`<text x="${left}" y="${top-17}" fill="var(--muted)" font-size="12">${safe(definition.label)} · ${definition.inverse?"越低越好":"越高越好"}</text><path d="${path.trim()}" fill="none" stroke="var(--red)" stroke-width="4"/>`;
    list.forEach((item,index)=>{
      const value=values[index];svg+=`<text x="${x(index)}" y="${height-20}" text-anchor="middle" fill="var(--muted)" font-size="12">${safe(item.period.replace(/^\d{4}-/,""))}</text>`;
      if(!Number.isFinite(value))return;
      const previous=index?values[index-1]:NaN,yoy=yoyValue(item.period,definition.key);
      const tip=safe(JSON.stringify({period:item.period,label:definition.label,value:definition.format(value),mom:change(value,previous),yoy:change(value,yoy),partial:item.period===currentPartial()}));
      svg+=`<g class="pre-chart-node" data-pre-tip="${tip}"><circle cx="${x(index)}" cy="${y(value)}" r="7" fill="white" stroke="var(--red)" stroke-width="4"/><text x="${x(index)}" y="${Math.max(18,y(value)-13)}" text-anchor="middle" fill="var(--red)" font-size="12" font-weight="800">${safe(definition.short(value))}</text></g>`;
    });
    return `${svg}</svg><div class="notice">${currentPartial()} 为部分周期；月度悬停显示环比和同比，周度显示较上周变化。</div>`;
  }
  function groupItems(level) {
    const source=filtered(), names=[...new Set(source.map(row=>level==="platform"?row.pf:row.s))];
    return names.map(name=>{
      const extra=level==="platform"?{platform:name,shop:""}:{shop:name};
      return {name,platform:level==="platform"?name:source.find(row=>row.s===name)?.pf||"",values:combine(filtered(selectedPeriods(),extra))};
    });
  }
  function structureChart() {
    const level=state.platform?"shop":"platform",definition=metric();
    const items=groupItems(level).filter(item=>Number.isFinite(item.values[definition.key]));
    if(!items.length)return `<div class="empty">当前指标暂无可用结构数据</div>`;
    const max=Math.max(...items.map(item=>item.values[definition.key]));
    return `<div class="structure-list">${items.sort((a,b)=>definition.inverse?a.values[definition.key]-b.values[definition.key]:b.values[definition.key]-a.values[definition.key]).map((item,index)=>`<button class="structure-row" data-pre-platform="${safe(item.platform)}" ${level==="shop"?`data-pre-shop="${safe(item.name)}"`:""}><span class="rank">${index+1}</span><strong>${safe(item.name)}</strong><span class="bar"><i style="width:${Math.max(4,item.values[definition.key]/max*100)}%"></i></span><em>${definition.format(item.values[definition.key])}</em></button>`).join("")}</div>`;
  }
  function miniTrend(shop,key) {
    return selectedPeriods().slice(-4).map(period=>{
      const value=combine(filtered([period],{shop}))[key];
      return `${period.replace(/^\d{4}-/,"")} ${Number.isFinite(value)?metric().short(value):"—"}`;
    }).join(" → ");
  }
  function rankingTable() {
    const definition=metric(),shops=[...new Set(filtered().map(row=>row.s))];
    const items=shops.map(shop=>({shop,platform:filtered().find(row=>row.s===shop)?.pf||"",values:combine(filtered(selectedPeriods(),{shop}))})).filter(item=>Number.isFinite(item.values[definition.key])).sort((a,b)=>definition.inverse?a.values[definition.key]-b.values[definition.key]:b.values[definition.key]-a.values[definition.key]);
    if(!items.length)return `<div class="empty">当前指标暂无店铺排名</div>`;
    return table(["店铺",definition.label,"咨询人数","咨询产值","转化率","平均响应","近4期趋势"],items.map((item,index)=>`<tr class="click-row" data-pre-platform="${safe(item.platform)}" data-pre-shop="${safe(item.shop)}"><td><span class="rank">${index+1}</span>${safe(item.shop)}<br><small>${safe(item.platform)}</small></td><td><strong>${definition.format(item.values[definition.key])}</strong></td><td>${fmt.format(item.values.consult)}</td><td>${money(item.values.salesPerConsult)}</td><td>${Number.isFinite(item.values.conversion)?`${item.values.conversion.toFixed(1)}%`:"—"}</td><td>${Number.isFinite(item.values.avg)?`${item.values.avg.toFixed(1)}秒`:"—"}</td><td><small>${safe(miniTrend(item.shop,definition.key))}</small></td></tr>`),"1120px");
  }
  function funnel() {
    const current=combine(filtered()),inferred=current.inquiryBase;
    return `<div class="funnel-flow"><div class="funnel-step"><span>01</span><small>咨询人数</small><strong>${fmt.format(current.consult)}</strong><i style="width:100%"></i></div><div class="funnel-arrow">→</div><div class="funnel-step"><span>02</span><small>推算有效询单</small><strong>${fmt.format(inferred)}</strong><i style="width:${Math.max(18,Math.min(100,inferred/Math.max(1,current.consult)*100))}%"></i></div><div class="funnel-arrow">→</div><div class="funnel-step"><span>03</span><small>询单成交人数</small><strong>${fmt.format(current.converted)}</strong><i style="width:${Math.max(18,Math.min(100,current.converted/Math.max(1,inferred)*100))}%"></i></div><div class="funnel-arrow">→</div><div class="funnel-step sales"><span>04</span><small>客服销售额</small><strong>${money(current.sales)}</strong><i style="width:100%"></i></div></div><div class="funnel-notes"><b>询单转化率 ${Number.isFinite(current.conversion)?current.conversion.toFixed(1)+"%":"—"}</b><b>每次咨询产值 ${money(current.salesPerConsult)}</b><b>日均咨询人数 ${fmt.format(current.daily)}</b></div>`;
  }
  const radarColors=["#2f6fed","#22b98b","#f6ad17","#ed6549","#8a63d2","#25a5b8","#6b778c"];
  function radar() {
    const level=state.radarMode;let items=groupItems(level).sort((a,b)=>b.values.sales-a.values.sales).slice(0,7);
    if(!items.length)return `<div class="empty">当前筛选没有可对比对象</div>`;
    const hasRefund=items.some(item=>Number.isFinite(item.values.refund));
    const axes=[{label:"咨询规模",key:"consult"},{label:"销售贡献",key:"sales"},{label:"转化效率",key:"conversion"},{label:"响应速度",key:"avg",inverse:true},{label:hasRefund?"低退款":"咨询产值",key:hasRefund?"refund":"salesPerConsult",inverse:hasRefund}];
    const score=(value,axis)=>{const values=items.map(item=>item.values[axis.key]).filter(Number.isFinite);if(!Number.isFinite(value)||!values.length)return 0;const min=Math.min(...values),max=Math.max(...values);if(max===min)return 65;const normalized=axis.inverse?(max-value)/(max-min):(value-min)/(max-min);return 20+normalized*80;};
    const width=600,height=455,centerX=300,centerY=205,radius=142;
    const point=(axisIndex,value)=>{const angle=(-90+axisIndex*360/axes.length)*Math.PI/180,distance=radius*value/100;return [centerX+Math.cos(angle)*distance,centerY+Math.sin(angle)*distance];};
    let svg=`<svg class="radar-svg" viewBox="0 0 ${width} ${height}">`;
    for(let ring=1;ring<=5;ring++)svg+=`<polygon points="${axes.map((_,index)=>point(index,ring*20).join(",")).join(" ")}" fill="${ring%2?"rgba(47,111,237,.025)":"none"}" stroke="var(--line)"/>`;
    axes.forEach((axis,index)=>{const end=point(index,100),label=point(index,118);svg+=`<line x1="${centerX}" y1="${centerY}" x2="${end[0]}" y2="${end[1]}" stroke="var(--line)"/><text x="${label[0]}" y="${label[1]}" text-anchor="middle" dominant-baseline="middle" fill="var(--muted)" font-size="13">${safe(axis.label)}</text>`;});
    items.forEach((item,itemIndex)=>{const scores=axes.map(axis=>score(item.values[axis.key],axis)),points=scores.map((value,index)=>point(index,value)),color=radarColors[itemIndex%radarColors.length];const tip=safe(JSON.stringify({name:item.name,axes:axes.map((axis,index)=>({label:axis.label,value:axis.key==="sales"?money(item.values[axis.key]):axis.key==="consult"?fmt.format(item.values[axis.key]):`${Number(item.values[axis.key]).toFixed(1)}${["conversion","refund"].includes(axis.key)?"%":axis.key==="avg"?"秒":""}`,score:scores[index].toFixed(0)}))}));svg+=`<polygon class="radar-series" data-radar-tip="${tip}" points="${points.map(value=>value.join(",")).join(" ")}" fill="${color}20" stroke="${color}" stroke-width="3"/>${points.map(value=>`<circle cx="${value[0]}" cy="${value[1]}" r="4" fill="${color}"/>`).join("")}`;});
    svg+=`</svg>`;
    return `${svg}<div class="radar-legend">${items.map((item,index)=>`<span><i style="background:${radarColors[index%radarColors.length]}"></i>${safe(item.name)}</span>`).join("")}</div><div class="muted-box">归一化评分仅用于结构比较。${hasRefund?"退款率越低得分越高。":"有效退款率尚未进入汇总，当前暂用咨询产值作为第五维。"}</div>`;
  }
  function opportunities() {
    const complete=periods().filter(period=>period<=maxComplete()),currentPeriod=complete.at(-1),previousPeriod=complete.at(-2);
    if(!currentPeriod||!previousPeriod)return [];
    const shops=[...new Set(filtered([currentPeriod]).map(row=>row.s))],findings=[];
    shops.forEach(shop=>{const platform=rows().find(row=>row.s===shop)?.pf||"",current=combine(filtered([currentPeriod],{shop})),previous=combine(filtered([previousPeriod],{shop})),consultChange=change(current.consult,previous.consult),salesChange=change(current.sales,previous.sales),conversionDelta=current.conversion-previous.conversion,avgChange=change(current.avg,previous.avg);
      if(consultChange>5&&conversionDelta<-1)findings.push({priority:"P1",shop,platform,title:"咨询增长但转化下降",detail:`咨询 ${pct(consultChange)}，转化下降 ${Math.abs(conversionDelta).toFixed(1)}pp`,action:"检查流量来源、主推产品和客服话术"});
      if(salesChange<-10)findings.push({priority:"P1",shop,platform,title:"客服销售额明显下降",detail:`较上期 ${pct(salesChange)}`,action:"下钻咨询量、转化率和客单产出"});
      if(avgChange>10&&current.avg>15)findings.push({priority:"P2",shop,platform,title:"平均响应持续变慢",detail:`本期 ${current.avg.toFixed(1)}秒，较上期 ${pct(avgChange)}`,action:"检查排班、峰值时段与接待分配"});
      if(current.conversion>=40&&consultChange<0)findings.push({priority:"机会",shop,platform,title:"高转化但咨询规模下降",detail:`转化 ${current.conversion.toFixed(1)}%，咨询 ${pct(consultChange)}`,action:"评估增加有效流量和重点商品曝光"});
    });
    const order={P1:0,P2:1,"机会":2};return findings.sort((a,b)=>order[a.priority]-order[b.priority]).slice(0,8);
  }
  function opportunityList() {const list=opportunities();if(!list.length)return `<div class="empty">最新两个完整周期未触发明显异常规则</div>`;return `<div class="opportunity-list">${list.map(item=>`<button class="opportunity-item" data-pre-platform="${safe(item.platform)}" data-pre-shop="${safe(item.shop)}"><span class="priority ${item.priority==="机会"?"opportunity":""}">${item.priority}</span><div><strong>${safe(item.shop)} · ${safe(item.title)}</strong><p>${safe(item.detail)}</p><small>建议：${safe(item.action)}</small></div><em>查看店铺 ›</em></button>`).join("")}</div>`;}
  function detailTable() {const items=[...new Set(filtered().map(row=>row.s))].map(shop=>({shop,platform:filtered().find(row=>row.s===shop)?.pf||"",values:combine(filtered(selectedPeriods(),{shop}))})).sort((a,b)=>b.values.sales-a.values.sales);return table(["平台 / 店铺","咨询人数","销售额(去退)","销售占比","成交人数","转化率","首次响应","平均响应","退款率"],items.map(item=>`<tr class="click-row" data-pre-platform="${safe(item.platform)}" data-pre-shop="${safe(item.shop)}"><td>${safe(item.platform)}<br><strong>${safe(item.shop)}</strong></td><td>${fmt.format(item.values.consult)}</td><td>${money(item.values.sales)}</td><td>${Number.isFinite(item.values.salesShare)?`${item.values.salesShare.toFixed(1)}%`:"—"}</td><td>${fmt.format(item.values.converted)}</td><td>${Number.isFinite(item.values.conversion)?`${item.values.conversion.toFixed(1)}%`:"—"}</td><td>${Number.isFinite(item.values.first)?`${item.values.first.toFixed(1)}秒`:"—"}</td><td>${Number.isFinite(item.values.avg)?`${item.values.avg.toFixed(1)}秒`:"—"}</td><td>${Number.isFinite(item.values.refund)?`${item.values.refund.toFixed(1)}%`:"—"}</td></tr>`),"1180px");}
  function keyConclusion() {const list=opportunities();if(!list.length)return `当前筛选期暂无明显量增效降信号；建议继续观察${metric().label}趋势。`;const first=list[0];return `${first.shop}：${first.title}。${first.detail}，建议${first.action}。`;}
  function renderAnalysis() {
    const drillBack = state.platform || state.shop ? `<section class="pre-drill-bar"><div><span>当前下钻</span><strong>${safe(state.platform || "全部平台")}${state.shop?` › ${safe(state.shop)}`:""}</strong></div><button class="back" data-pre-back>← 返回上一级</button></section>` : "";
    body.innerHTML=`${drillBack}<section class="pre-conclusion"><strong>关键结论</strong><span>${safe(keyConclusion())}</span><em>点击指标卡、排名或异常项继续下钻</em></section>
      <div class="grid"><article class="card"><div class="section-head"><div><span class="section-index">01 · 趋势</span><h2>${safe(metric().label)}趋势</h2><p class="subtitle">节点显示当期值，悬停查看环比与同比</p></div></div>${trendChart()}</article><article class="card"><div class="section-head"><div><span class="section-index">02 · 结构</span><h2>${state.platform?"店铺":"平台"}${safe(metric().label)}结构</h2><p class="subtitle">响应顶部筛选，点击可继续定位</p></div></div>${structureChart()}</article></div>
      <article class="card pre-section"><div class="section-head"><div><span class="section-index">03 · 转化链路</span><h2>咨询转化与销售产出</h2><p class="subtitle">将规模、转化和销售贡献放在同一条链路判断</p></div></div>${funnel()}</article>
      <div class="grid equal pre-section"><article class="card"><div class="section-head"><div><span class="section-index">04 · 综合能力</span><h2>平台运营效率雷达</h2><p class="subtitle">归一化评分仅作结构对比</p></div><div class="radar-switch"><button data-radar-mode="platform" class="${state.radarMode==="platform"?"active":""}">平台</button><button data-radar-mode="shop" class="${state.radarMode==="shop"?"active":""}">店铺</button></div></div>${radar()}</article><article class="card"><div class="section-head"><div><span class="section-index">05 · 排名</span><h2>店铺${safe(metric().label)}排名</h2><p class="subtitle">默认按当前指标优先级排序，点击店铺下钻</p></div></div>${rankingTable()}</article></div>
      <article class="card pre-section"><div class="section-head"><div><span class="section-index">06 · 行动</span><h2>异常与机会清单</h2><p class="subtitle">基于最近两个完整周期自动识别量增效降、销售下滑和响应变慢</p></div></div>${opportunityList()}</article>
      <article class="card pre-section"><div class="section-head"><div><span class="section-index">07 · 明细</span><h2>店铺经营全指标明细</h2><p class="subtitle">点击店铺进入单店筛选；退款率异常不参与汇总和排名</p></div></div>${detailTable()}</article>`;
    bindTips();
  }
  function table(headers,rowHtml,minWidth="820px"){return `<div class="table-wrap"><table style="min-width:${minWidth}"><thead><tr>${headers.map(header=>`<th>${header}</th>`).join("")}</tr></thead><tbody>${rowHtml.join("")}</tbody></table></div>`;}
  function renderAudit(){const duplicates=D.audit.duplicates,refunds=D.audit.refundAnomalies.slice().sort((a,b)=>b.value-a.value);body.innerHTML=`<section class="audit-summary"><strong>数据健康提醒</strong><span>当前有 ${D.meta.duplicateGroups} 组重复记录、${D.meta.blankRows} 行核心指标为空、${D.meta.refundAnomalies} 条退款率超过100%。异常数据不参与正式经营判断。</span></section><div class="grid equal"><article class="card"><h2>重复与空行备查</h2><p class="subtitle">重复日数据不自动猜测保留项，已从正式汇总剔除</p>${table(["重复键","来源行"],duplicates.map(item=>`<tr><td>${safe(item.key)}</td><td>${item.rows.join("、")}</td></tr>`))}<div class="muted-box">另有 ${D.audit.blankRows.length} 行核心指标为空，未计入经营汇总。</div></article><article class="card"><h2>退款率异常备查</h2><p class="subtitle">原表数值大于100%，当前不用于汇总、雷达或绩效排名</p>${table(["日期 / 店铺","退款率","来源行"],refunds.map(item=>`<tr><td>${item.date}<br><small>${safe(item.platform)} / ${safe(item.shop)}</small></td><td class="bad">${item.value.toFixed(2)}%</td><td>${item.sourceRow}</td></tr>`))}</article></div><article class="card pre-section"><h2>口径与完整性说明</h2><div class="quality-grid"><div><strong>周期完整性</strong><p>各店共同完整截止日 ${D.meta.commonComplete}；${currentPartial()} 为部分周期。</p></div><div><strong>平台转化口径</strong><p>京东使用出库转化，其他平台主要使用询单口径，跨平台仅作经营观察。</p></div><div><strong>响应字段</strong><p>拼多多首次响应缺失，不参与首次响应排名与综合评分。</p></div><div><strong>销售占比</strong><p>有效填报覆盖率不足90%时显示“—”，避免部分月份放大。</p></div></div></article>`;}
  function bindTips(){const tooltip=$("#tooltip");document.querySelectorAll("[data-pre-tip]").forEach(node=>{node.onmouseenter=()=>{const data=JSON.parse(node.dataset.preTip);tooltip.innerHTML=`<b>${safe(data.period)}${data.partial?" · 部分周期":""}</b><br>${safe(data.label)}：${safe(data.value)}<br>环比：${pct(data.mom)}${state.grain==="month"?`<br>同比：${pct(data.yoy)}`:""}`;tooltip.style.display="block";};node.onmousemove=event=>{tooltip.style.left=`${event.clientX+14}px`;tooltip.style.top=`${event.clientY+14}px`;};node.onmouseleave=()=>{tooltip.style.display="none";};});document.querySelectorAll("[data-radar-tip]").forEach(node=>{node.onmouseenter=()=>{const data=JSON.parse(node.dataset.radarTip);tooltip.innerHTML=`<b>${safe(data.name)}</b><br>${data.axes.map(axis=>`${safe(axis.label)}：${safe(axis.value)}｜得分 ${axis.score}`).join("<br>")}`;tooltip.style.display="block";};node.onmousemove=event=>{tooltip.style.left=`${event.clientX+14}px`;tooltip.style.top=`${event.clientY+14}px`;};node.onmouseleave=()=>{tooltip.style.display="none";};});}
  function updateStatus(){if(workspace==="pre")$("#dataStatus").textContent=`售前 ${D.meta.sourceMin} 至 ${D.meta.sourceMax} · 各店共同完整至 ${D.meta.commonComplete} · 页面版本 v20`;else if(workspace==="weekly")$("#dataStatus").textContent="上周复盘 · 各模块按自身最新成熟周复盘 · 页面版本 v20";else if(workspace==="returns"&&window.RETURN_REFUND_DATA)$("#dataStatus").textContent=`退货退款 ${window.RETURN_REFUND_DATA.meta.sourceMin} 至 ${window.RETURN_REFUND_DATA.meta.sourceMax} · 成熟月截止 ${window.RETURN_REFUND_DATA.meta.latestMatureMonth||"—"} · 页面版本 v20`;else if(window.AFTER_SALES_DATA)$("#dataStatus").textContent=`售后 ${window.AFTER_SALES_DATA.meta.afterSalesMin} 至 ${window.AFTER_SALES_DATA.meta.afterSalesMax} · 销售至 ${window.AFTER_SALES_DATA.meta.salesMax} · 页面版本 v20`;}
  function refresh(){refreshControls();renderKpis();if(state.page==="audit")renderAudit();else renderAnalysis();updateStatus();}
  if(!window.CS_THEME_BOUND){window.CS_THEME_BOUND=true;$("#themeBtn").addEventListener("click",()=>{document.body.classList.toggle("dark");$("#themeBtn").textContent=document.body.classList.contains("dark")?"浅色模式":"深色模式";});}
  document.addEventListener("click",async event=>{const workspaceButton=event.target.closest("[data-workspace]");if(workspaceButton){workspace=workspaceButton.dataset.workspace;pre.hidden=workspace!=="pre";weekly.hidden=workspace!=="weekly";after.hidden=workspace!=="after";returns.hidden=workspace!=="returns";document.querySelectorAll("[data-workspace]").forEach(button=>button.classList.toggle("active",button.dataset.workspace===workspace));if(workspace==="after"||workspace==="weekly"){try{await ensureAfterSales();}catch{return;}}if(workspace==="returns"){try{await ensureReturnRefund();}catch{return;}window.RETURN_REFUND_APP?.render();}if(workspace==="weekly")window.WEEKLY_REVIEW_APP?.render();if(workspace==="pre")refresh();updateStatus();return;}const pageButton=event.target.closest("[data-pre-page]");if(pageButton){state.page=pageButton.dataset.prePage;refresh();return;}const metricButton=event.target.closest("[data-pre-metric]");if(metricButton){state.metric=metricButton.dataset.preMetric;refresh();return;}const grainButton=event.target.closest("[data-pre-grain]");if(grainButton){state.grain=grainButton.dataset.preGrain;setDefaultRange();refresh();return;}const radarButton=event.target.closest("[data-radar-mode]");if(radarButton){state.radarMode=radarButton.dataset.radarMode;refresh();return;}const back=event.target.closest("[data-pre-back]");if(back){if(state.shop)state.shop="";else state.platform="";refresh();return;}const drill=event.target.closest("[data-pre-shop], [data-pre-platform]");if(drill){if(drill.dataset.prePlatform)state.platform=drill.dataset.prePlatform;if(drill.dataset.preShop)state.shop=drill.dataset.preShop;refresh();}});
  document.addEventListener("change",event=>{if(event.target===platformSelect){state.platform=event.target.value;state.shop="";refresh();}if(event.target===shopSelect){state.shop=event.target.value;refresh();}if(event.target===startSelect){state.start=event.target.value;if(state.start>state.end)state.end=state.start;refresh();}if(event.target===endSelect){state.end=event.target.value;if(state.end<state.start)state.start=state.end;refresh();}});
  setDefaultRange();refresh();ensureAfterSales().then(()=>{window.WEEKLY_REVIEW_APP?.render();updateStatus();}).catch(()=>{});
})();
