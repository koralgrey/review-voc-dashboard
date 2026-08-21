(() => {
  "use strict";
  const D = window.AFTER_SALES_DATA;
  if (!D) return;
  const $ = (s) => document.querySelector(s);
  const body = $("#dashboardBody"), kpis = $("#kpis"), issueSelect = $("#issueSelect"), rangeSelect = $("#rangeSelect");
  const fmt = new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 1});
  const money = (n) => `¥${fmt.format(Number(n || 0))}`;
  const pct = (n) => Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(1)}%` : "—";
  const safe = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sum = (rows, key) => rows.reduce((a, r) => a + Number(r[key] || 0), 0);
  const group = (rows, key, metrics=["count","qty","amount"]) => {
    const m = new Map();
    rows.forEach(r => { const k = r[key] || "未分类"; const x = m.get(k) || {[key]:k}; metrics.forEach(v => x[v] = (x[v] || 0) + Number(r[v] || 0)); x.maxSingle = Math.max(x.maxSingle || 0, Number(r.maxSingle || 0)); m.set(k,x); });
    return [...m.values()];
  };
  const change = (a,b) => b > 0 ? (a / b - 1) * 100 : (a > 0 ? Infinity : 0);
  const state = {
    module:"cause", grain:"month", range:"ytd", cat1:"", cat2:"", issue:"", product:"",
    causeLevel:"issues", causeIssue:"", rateLevel:"categories", rateCategory:null,
    compLevel:"categories", compCategory:null, compIssue:"", actionTab:"product",
    rateSort:{key:"count",dir:-1}, compSort:{key:"amount",dir:-1}, actionSort:{key:"priority",dir:-1}
  };

  const DATA_VERSION = "20260821-7";
  const dataRows = (type, grain=state.grain) => {
    const key=`${type}${grain === "month" ? "Month" : "Week"}`;
    return type==="productSales" ? (window.AFTER_SALES_PRODUCT_SALES?.[key] || []) : (D[key] || []);
  };
  let productDataPromise=null;
  function ensureProductData(){
    if(window.AFTER_SALES_PRODUCT_SALES) return Promise.resolve();
    if(productDataPromise) return productDataPromise;
    body.innerHTML=`<article class="card loading-card"><div class="loading-dot"></div><h2>正在加载产品级明细…</h2><p class="subtitle">首次进入产品下钻或行动清单时加载，后续操作将直接使用缓存。</p></article>`;
    productDataPromise=new Promise((resolve,reject)=>{
      const script=document.createElement("script");script.src=`../data/after-sales-product-sales.js?v=${DATA_VERSION}`;
      script.onload=()=>resolve();script.onerror=()=>reject(new Error("产品级数据加载失败"));document.head.appendChild(script);
    }).catch(err=>{productDataPromise=null;body.innerHTML=`<article class="card"><div class="empty">${safe(err.message)}，请刷新后重试。</div></article>`;throw err;});
    return productDataPromise;
  }
  const salesIndexCache = new Map();
  function salesIndex(periods, productMode){
    const cacheKey=`${state.grain}|${productMode?"product":"category"}|${periods.join(",")}`;
    if(salesIndexCache.has(cacheKey)) return salesIndexCache.get(cacheKey);
    const periodSet=new Set(periods), index=new Map([["all",0]]), rows=dataRows(productMode?"productSales":"sales");
    const inc=(key,value)=>index.set(key,(index.get(key)||0)+value);
    rows.forEach(r=>{if(!periodSet.has(r.period))return;const q=Number(r.qty||0);inc("all",q);inc(`c1|${r.cat1}`,q);inc(`c2|${r.cat1}|${r.cat2}`,q);if(productMode)inc(`p|${r.cat1}|${r.cat2}|${r.product}`,q);});
    salesIndexCache.set(cacheKey,index);return index;
  }
  const periodCache={};
  function periodInfo(grain=state.grain){
    if(periodCache[grain]) return periodCache[grain];
    const issues=[...new Set(dataRows("issues",grain).map(r=>r.period))].filter(Boolean).sort();
    const sales=[...new Set(dataRows("sales",grain).filter(r=>Number(r.qty)>0).map(r=>r.period))].filter(Boolean).sort();
    const issueSet=new Set(issues), salesSet=new Set(sales), all=[...new Set([...issues,...sales])].sort(), common=sales.filter(p=>issueSet.has(p));
    const currentPartial=grain==="month"?(D.meta.afterSalesMax||"").slice(0,7):issues.at(-1);
    const maxComplete=(grain==="week"?common.filter(p=>p<currentPartial):common.filter(p=>p<currentPartial)).at(-1)||"";
    const firstPartial=issues[0]||"";
    return periodCache[grain]={issues,sales,all,issueSet,salesSet,maxComplete,currentPartial,firstPartial};
  }
  const allPeriods = (grain=state.grain) => periodInfo(grain).all;
  const issuePeriods = (grain=state.grain) => periodInfo(grain).issues;
  const salesPeriods = (grain=state.grain) => periodInfo(grain).sales;
  const maxComplete = (grain=state.grain) => periodInfo(grain).maxComplete;
  function isCompleteIssuePeriod(period,grain=state.grain){const x=periodInfo(grain);return x.issueSet.has(period)&&x.salesSet.has(period)&&period!==x.firstPartial&&period<=x.maxComplete;}
  function rangeOptions(){
    if(state.grain === "week") return [
      ["recent4","最近4个完整销售周"],["recent8","最近8个完整销售周"],["latest","最新完整销售周"],["current","当前售后周（售后率暂不计算）"]
    ];
    const years=[...new Set(issuePeriods("month").map(p=>p.slice(0,4)))].sort().reverse(), current=(D.meta.afterSalesMax||"2026").slice(0,4);
    const yearOptions=years.map(y=>{const ps=issuePeriods("month").filter(p=>p.startsWith(y)),months=`${ps[0]?.slice(5)}–${ps.at(-1)?.slice(5)}月`;return [y===current?"ytd":`year-${y}`,y===current?`${y}年累计（月度）`:`${y}年可用期（${months}）`]});
    return [...yearOptions,["last6","最近6个完整月"],["latest","最新完整月"],["mtd","本月至今（售后率暂不计算）"]];
  }
  function periodsFor(range=state.range, grain=state.grain){
    const all=allPeriods(grain), complete=maxComplete(grain), completed=all.filter(p=>p<=complete);
    if(grain === "week"){
      if(range==="latest") return completed.slice(-1);
      if(range==="recent8") return completed.slice(-8);
      if(range==="current") return issuePeriods(grain).slice(-1);
      return completed.slice(-4);
    }
    const latestIssue=issuePeriods(grain).at(-1);
    if(range==="latest") return completed.slice(-1);
    if(range==="last6") return completed.slice(-6);
    if(range==="mtd") return latestIssue ? [latestIssue] : [];
    const year=range.startsWith("year-")?range.slice(5):(D.meta.afterSalesMax||"2026").slice(0,4);
    return issuePeriods(grain).filter(p=>p.startsWith(year));
  }
  function previousPeriods(periods, grain=state.grain){
    const all=allPeriods(grain), i=all.indexOf(periods[0]);
    return i>0 ? all.slice(Math.max(0,i-periods.length),i) : [];
  }
  function validComparison(periods,previous,grain=state.grain){return periods.length>0&&previous.length===periods.length&&periods.every(p=>isCompleteIssuePeriod(p,grain))&&previous.every(p=>isCompleteIssuePeriod(p,grain));}
  const eligible = periods => periods.filter(p=>isCompleteIssuePeriod(p,state.grain));
  const rowIds=new WeakMap();let rowId=0;const filterCache=new Map();
  function filtered(rows, periods=periodsFor(), opts={}){
    if(!rowIds.has(rows))rowIds.set(rows,++rowId);const product=opts.product??state.product,key=`${rowIds.get(rows)}|${periods.join(",")}|${state.cat1}|${state.cat2}|${state.issue}|${product}`;
    if(filterCache.has(key))return filterCache.get(key);const periodSet=new Set(periods);
    const result=rows.filter(r => periodSet.has(r.period)&&(!state.cat1 || r.cat1===state.cat1)&&(!state.cat2 || r.cat2===state.cat2)&&(!state.issue || r.issue===state.issue)&&(!product || r.product===product));
    if(filterCache.size>500)filterCache.clear();filterCache.set(key,result);return result;
  }
  function salesQty(periods=periodsFor(), cat1=state.cat1, cat2=state.cat2, product=state.product){
    const index=salesIndex(periods,Boolean(product));
    if(product) return index.get(`p|${cat1}|${cat2}|${product}`)||0;
    if(cat2) return index.get(`c2|${cat1}|${cat2}`)||0;
    if(cat1) return index.get(`c1|${cat1}`)||0;
    return index.get("all")||0;
  }
  function rateFor(count, periods=periodsFor(), cat1=state.cat1, cat2=state.cat2, product=state.product){
    const ep=eligible(periods); if(!ep.length) return NaN;
    const q=salesQty(ep,cat1,cat2,product); return q>0 ? count/q*10000 : NaN;
  }

  function createCombo(el, allLabel, getOptions, getter, setter){
    function render(){
      const value=getter(), opts=getOptions();
      el.innerHTML=`<button type="button" class="combo-display"><span>${safe(value||allLabel)}</span><b>⌄</b></button><div class="combo-menu"><input type="search" placeholder="输入关键字模糊搜索"><div class="combo-options"></div></div>`;
      const list=el.querySelector(".combo-options"), input=el.querySelector("input");
      const paint=q=>{const terms=String(q||"").toLowerCase().split(/\s+/).filter(Boolean); const shown=opts.filter(v=>terms.every(t=>v.toLowerCase().includes(t))); list.innerHTML=`<button class="combo-option ${!value?"active":""}" data-value="">${safe(allLabel)}</button>`+shown.map(v=>`<button class="combo-option ${v===value?"active":""}" data-value="${safe(v)}">${safe(v)}</button>`).join("")+(shown.length?"":"<div class='empty'>无匹配项</div>");};
      paint(""); el.querySelector(".combo-display").onclick=()=>{el.classList.toggle("open"); if(el.classList.contains("open")) setTimeout(()=>input.focus(),0)};
      input.oninput=()=>paint(input.value); list.onclick=e=>{const b=e.target.closest("[data-value]");if(!b)return; setter(b.dataset.value);el.classList.remove("open"); refresh();};
    }
    el._render=render; render();
  }
  const cat1Combo=$("#cat1Combo"), cat2Combo=$("#cat2Combo");
  const categoryRows=()=>dataRows("issues");
  createCombo(cat1Combo,"全部大类",()=>[...new Set(categoryRows().map(r=>r.cat1))].filter(Boolean).sort(),()=>state.cat1,v=>{state.cat1=v;state.cat2="";state.issue="";resetDrills();});
  createCombo(cat2Combo,"全部品类",()=>[...new Set(categoryRows().filter(r=>!state.cat1||r.cat1===state.cat1).map(r=>r.cat2))].filter(Boolean).sort(),()=>state.cat2,v=>{state.cat2=v;state.issue="";resetDrills();});
  document.addEventListener("click",e=>{if(!e.target.closest(".combo")) document.querySelectorAll(".combo.open").forEach(x=>x.classList.remove("open"));});

  function issueOptions(){
    const periods=periodsFor(), compMode=state.module==="comp"||(state.module==="action"&&state.actionTab==="finance"); let rows;
    if(compMode) rows=dataRows("comp"); else rows=dataRows("issues");
    rows=rows.filter(r=>periods.includes(r.period)&&(!state.cat1||r.cat1===state.cat1)&&(!state.cat2||r.cat2===state.cat2));
    const totalCount=sum(rows,"count"), totalAmount=sum(rows,"amount"), items=group(rows,"issue");
    items.sort((a,b)=>compMode?b.amount-a.amount:b.count-a.count);
    const label=compMode ? `全部问题（${fmt.format(totalCount)}笔 / ${money(totalAmount)}）` : `全部问题（${fmt.format(totalCount)}）`;
    issueSelect.innerHTML=`<option value="">${safe(label)}</option>`+items.filter(x=>x.count>0).map(x=>`<option value="${safe(x.issue)}">${safe(x.issue)}（${fmt.format(x.count)}${compMode?`笔 / ${money(x.amount)}`:""}）</option>`).join("");
    if(!items.some(x=>x.issue===state.issue)) state.issue="";
    issueSelect.value=state.issue;
  }
  function resetDrills(){state.product="";state.causeLevel="issues";state.causeIssue="";state.rateLevel="categories";state.rateCategory=null;state.compLevel="categories";state.compCategory=null;state.compIssue="";}
  function refreshControls(){
    cat1Combo._render();cat2Combo._render();
    const opts=rangeOptions();if(!opts.some(x=>x[0]===state.range))state.range=opts[0][0];
    rangeSelect.innerHTML=opts.map(([v,l])=>`<option value="${v}">${l}</option>`).join("");rangeSelect.value=state.range;issueOptions();
    document.querySelectorAll("[data-grain]").forEach(b=>b.classList.toggle("active",b.dataset.grain===state.grain));
    document.querySelectorAll("[data-module]").forEach(b=>b.classList.toggle("active",b.dataset.module===state.module));
  }

  function card(label,value,note){return `<article class="kpi"><span class="label">${label}</span><strong>${value}</strong><small>${note}</small></article>`}
  function currentMetrics(){
    const periods=periodsFor(), prev=previousPeriods(periods), issues=filtered(dataRows("issues"),periods), prevIssues=filtered(dataRows("issues"),prev), comps=filtered(dataRows("comp"),periods);
    const count=sum(issues,"count"), prevCount=sum(prevIssues,"count"), r=rateFor(sum(filtered(dataRows("issues"),eligible(periods)),"count"),periods);
    const issueAgg=group(issues,"issue"), high=issueAgg.filter(x=>x.count>=Math.max(5,count*.03)).length;
    if(state.module==="comp"){
      const amount=sum(comps,"amount"), records=sum(comps,"count"), audits=D.compensationAudit.filter(a=>(!state.cat1||a.cat1===state.cat1)&&(!state.cat2||a.cat2===state.cat2));
      kpis.innerHTML=card("赔偿总额",money(amount),"已排除疑似异常录入")+card("赔偿记录数",fmt.format(records),"选定时间与筛选范围")+card("单笔平均赔偿",records?money(amount/records):"—","赔偿总额 ÷ 赔偿记录数")+card("疑似录入异常",fmt.format(audits.length),"保留备查，不计入正式合计");
    }else if(state.module==="action"){
      const products=new Set(issues.map(r=>`${r.code}|${r.product}`)).size, compProducts=new Set(comps.map(r=>`${r.code}|${r.product}`)).size;
      kpis.innerHTML=card("问题产品数",fmt.format(products),"当前时间范围")+card("高频具体问题",fmt.format(high),"自动标记优先排查")+card("涉及赔偿产品",fmt.format(compProducts),"财务异常清单范围")+card("赔偿金额",money(sum(comps,"amount")),"已排除疑似录入错误");
    }else{
      const comparable=validComparison(periods,prev);
      kpis.innerHTML=card("有效售后登记",fmt.format(count),"排除重复登记")+card("每万件登记售后数",Number.isFinite(r)?r.toFixed(1):"—",Number.isFinite(r)?"售后数 ÷ 正向销售件数 × 10,000":"当前周期未完整对齐")+card("较上期变化",comparable?pct(change(count,prevCount)):"—",comparable?"同长度上一周期":"基期不完整，不计算")+card("高关注问题",fmt.format(high),"高频、高发生率或持续增长");
    }
  }

  function sortControls(scope, current, items){return `<div class="toolbar">${items.map(([k,l])=>`<button class="sort-btn ${current.key===k?"active":""}" data-sort-scope="${scope}" data-sort-key="${k}">${l} ${current.key===k?(current.dir<0?"↓":"↑"):"⇅"}</button>`).join("")}</div>`}
  function table(headers, rows, min="720px"){return `<div class="table-wrap"><table style="min-width:${min}"><thead><tr>${headers.map((h,i)=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`}
  const valClass=n=>n>0?"bad":n<0?"good":"";

  function trendData(){
    const periods=periodsFor(), issues=dataRows("issues"), counts=[], rates=[];
    periods.forEach(p=>{
      const rows=filtered(issues,[p]); const c=sum(rows,"count"), ep=eligible([p]);
      counts.push(c); rates.push(ep.length?rateFor(c,[p]):NaN);
    });
    return {periods,counts,rates};
  }
  function lineChart(){
    const {periods,counts,rates}=trendData(); if(!periods.length)return `<div class="empty">当前筛选无趋势数据</div>`;
    const W=1000,H=390,L=65,R=60,T=55,B=55, iw=W-L-R, ih=H-T-B, cmax=Math.max(1,...counts), rmax=Math.max(1,...rates.filter(Number.isFinite));
    const x=i=>L+(periods.length===1?iw/2:i*iw/(periods.length-1)), yc=v=>T+ih-(v/cmax)*ih, yr=v=>T+ih-(v/rmax)*ih;
    const path=(arr,yf)=>arr.map((v,i)=>Number.isFinite(v)?`${i===0||!Number.isFinite(arr[i-1])?"M":"L"}${x(i)},${yf(v)}`:"").join(" ");
    const metrics=new Map(periods.map((p,i)=>[p,{count:counts[i],rate:rates[i]}]));
    const metricAt=p=>{if(metrics.has(p))return metrics.get(p);if(!periodInfo().issueSet.has(p))return {count:NaN,rate:NaN};const c=sum(filtered(dataRows("issues"),[p]),"count"),r=isCompleteIssuePeriod(p)?rateFor(c,[p]):NaN,x={count:c,rate:r};metrics.set(p,x);return x;};
    const prior=(p,offset)=>{const all=allPeriods(),idx=all.indexOf(p);return idx>=offset?all[idx-offset]:""};
    const compared=(p,value,offset,key)=>{const q=prior(p,offset);if(!q||!isCompleteIssuePeriod(p)||!isCompleteIssuePeriod(q))return NaN;return change(value,metricAt(q)[key]);};
    let svg=`<div class="legend"><span><i></i>红色实线：售后数量</span><span><i class="green"></i>绿色虚线：每万件售后数</span></div><svg class="trend-svg" viewBox="0 0 ${W} ${H}">`;
    for(let i=0;i<4;i++){const y=T+i*ih/3;svg+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="var(--line)"/><text x="${L}" y="${y-8}" fill="var(--muted)" font-size="12">${i===0?`数量 0–${fmt.format(cmax)}`:""}</text>`}
    svg+=`<text x="${W-R}" y="${T-8}" text-anchor="end" fill="var(--muted)" font-size="12">每万件 0–${rmax.toFixed(1)}</text><path d="${path(counts,yc)}" fill="none" stroke="var(--red)" stroke-width="4"/><path d="${path(rates,yr)}" fill="none" stroke="var(--green)" stroke-width="4" stroke-dasharray="10 8"/>`;
    periods.forEach((p,i)=>{
      const cm=compared(p,counts[i],1,"count"), cy=compared(p,counts[i],state.grain==="month"?12:52,"count");
      const rm=compared(p,rates[i],1,"rate"), ry=compared(p,rates[i],state.grain==="month"?12:52,"rate");
      const tip=safe(JSON.stringify({p,count:counts[i],rate:rates[i],cm,cy,rm,ry}));
      svg+=`<text x="${x(i)}" y="${H-18}" text-anchor="middle" fill="var(--muted)" font-size="13">${safe(p.replace(/^\d{4}-/,""))}</text>`;
      svg+=`<g class="chart-node" data-tip="${tip}"><circle cx="${x(i)}" cy="${yc(counts[i])}" r="6" fill="white" stroke="var(--red)" stroke-width="4"/><text x="${x(i)}" y="${Math.max(18,yc(counts[i])-11)}" text-anchor="middle" fill="var(--red)" font-weight="800" font-size="12">${fmt.format(counts[i])}</text></g>`;
      if(Number.isFinite(rates[i]))svg+=`<g class="chart-node" data-tip="${tip}"><circle cx="${x(i)}" cy="${yr(rates[i])}" r="6" fill="white" stroke="var(--green)" stroke-width="4"/><text x="${x(i)}" y="${Math.min(H-B+28,yr(rates[i])+19)}" text-anchor="middle" fill="var(--green)" font-weight="800" font-size="12">${rates[i].toFixed(1)}</text></g>`;
    });
    return svg+`</svg><div class="notice">最新售后至 ${safe(D.meta.afterSalesMax)}，销售数据至 ${safe(D.meta.salesMax)}。红线看绝对数是否下降，绿线用于排除销量变化；2025 年售后明细始于 ${safe(D.meta.afterSalesMin)}，不完整或缺失基期的每万件、同比和环比均显示“—”。</div>`;
  }
  function bindTooltips(){
    const tip=$("#tooltip");document.querySelectorAll(".chart-node").forEach(n=>{n.onmouseenter=e=>{const d=JSON.parse(n.dataset.tip);tip.innerHTML=`<b>${safe(d.p)}</b><br>售后数：${fmt.format(d.count)}<br>环比：${pct(d.cm)}｜同比：${pct(d.cy)}<br>每万件：${Number.isFinite(d.rate)?d.rate.toFixed(1):"—"}<br>环比：${pct(d.rm)}｜同比：${pct(d.ry)}`;tip.style.display="block";};n.onmousemove=e=>{tip.style.left=`${e.clientX+14}px`;tip.style.top=`${e.clientY+14}px`};n.onmouseleave=()=>tip.style.display="none";});
  }

  function causeTable(){
    const periods=periodsFor(), rows=filtered(dataRows("issues"),periods,{product:""}), total=sum(rows,"count"), prev=previousPeriods(periods);
    if(state.causeLevel==="products"){
      const rr=rows.filter(r=>r.issue===state.causeIssue), rateRows=filtered(dataRows("issues"),eligible(periods),{product:""}).filter(r=>r.issue===state.causeIssue), rateMap=new Map(group(rateRows,"product").map(x=>[x.product,x.count])), pp=group(rr,"product");
      pp.forEach(x=>{x.code=rr.find(r=>r.product===x.product)?.code||"";x.rate=rateFor(rateMap.get(x.product)||0,periods,state.cat1,state.cat2,x.product)});pp.sort((a,b)=>b.count-a.count);
      return `<div class="section-head"><div><h2>${safe(state.causeIssue)}：问题产品下钻</h2><p class="subtitle">选择产品后，右侧趋势图同步到该产品与问题</p></div><button class="back" data-action="cause-back">← 返回 TOP 10</button></div>`+table(["产品 / 编码","售后数","占比","每万件","趋势"],pp.map((x,i)=>`<tr><td><span class="rank">${i+1}</span>${safe(x.product)}<br><small>${safe(x.code||"无编码")}</small></td><td>${fmt.format(x.count)}</td><td>${(x.count/Math.max(1,sum(rr,"count"))*100).toFixed(1)}%</td><td>${Number.isFinite(x.rate)?x.rate.toFixed(1):"—"}</td><td><button class="drill" data-action="select-product" data-product="${safe(x.product)}" data-issue="${safe(state.causeIssue)}">同步趋势</button></td></tr>`));
    }
    const comparable=validComparison(periods,prev),gg=group(rows,"issue");gg.forEach(x=>{const pr=group(filtered(dataRows("issues"),prev,{product:""}).filter(r=>r.issue===x.issue),"issue")[0];x.delta=comparable?change(x.count,pr?.count||0):NaN});gg.sort((a,b)=>b.count-a.count);const top=gg.slice(0,10),max=top[0]?.count||1;
    return `<div class="section-head"><div><h2>TOP 10 高频问题</h2><p class="subtitle">问题数量、占比与较上期变化</p></div></div>`+table(["具体问题","规模","数量","占比","较上期","下钻"],top.map((x,i)=>`<tr><td><span class="rank">${i+1}</span>${safe(x.issue)}</td><td><div class="bar"><i style="width:${x.count/max*100}%"></i></div></td><td>${fmt.format(x.count)}</td><td>${(x.count/Math.max(1,total)*100).toFixed(1)}%</td><td class="${valClass(x.delta)}">${pct(x.delta)}</td><td><button class="drill" data-action="cause-drill" data-issue="${safe(x.issue)}">产品下钻 ›</button></td></tr>`));
  }
  function renderCause(){body.innerHTML=`<div class="grid"><article class="card">${causeTable()}</article><article class="card"><h2>问题月/周趋势</h2><h3>${safe(state.product||state.issue||state.causeIssue||"全部问题")}</h3><div class="chart-wrap">${lineChart()}</div></article></div>`;bindTooltips();}

  function rateRanking(){
    const periods=periodsFor(), issues=dataRows("issues"), product="";
    if(state.rateLevel==="reasons"&&state.rateCategory){
      const c=state.rateCategory, rr=issues.filter(r=>periods.includes(r.period)&&r[c.key]===c.value&&(!state.cat1||r.cat1===state.cat1)&&(!state.cat2||r.cat2===state.cat2));
      let rows=group(rr,"issue"), rateMap=new Map(group(rr.filter(r=>eligible(periods).includes(r.period)),"issue").map(x=>[x.issue,x.count]));const q=salesQty(eligible(periods),c.key==="cat1"?c.value:state.cat1,c.key==="cat2"?c.value:state.cat2,"");rows.forEach(x=>x.rate=q>0?(rateMap.get(x.issue)||0)/q*10000:NaN);rows.sort((a,b)=>(a[state.rateSort.key]||0)-(b[state.rateSort.key]||0)).reverse();if(state.rateSort.dir>0)rows.reverse();
      let cumulative=0,total=sum(rows,"count");return `<div class="section-head"><div><h2>${safe(c.value)}：售后原因下钻</h2><p class="subtitle">默认按售后总数降序，核心问题以累计80%标记</p></div><button class="back" data-action="rate-back">← 返回品类排名</button></div>${sortControls("rate",state.rateSort,[["count","售后总数"],["rate","每万件"]])}`+table(["售后原因","售后总数","占比","每万件","问题集中度"],rows.map((x,i)=>{const before=cumulative;cumulative+=x.count;return `<tr><td><span class="rank">${i+1}</span>${safe(x.issue)}</td><td>${fmt.format(x.count)}</td><td>${(x.count/Math.max(1,total)*100).toFixed(1)}%</td><td><span class="pill">${Number.isFinite(x.rate)?x.rate.toFixed(1):"—"}</span></td><td>${before/Math.max(1,total)<.8?'<span class="tag red">Pareto核心</span>':"长尾"}</td></tr>`})) + `<div class="muted-box">每万件原因数 = 该原因售后数 ÷ 该品类正向销售件数 × 10,000。样本较少时建议同时看绝对数。</div>`;
    }
    const level=state.cat1?"cat2":"cat1", label=level==="cat1"?"一级大类":"二级品类";
    const scoped=issues.filter(r=>periods.includes(r.period)&&(!state.cat1||r.cat1===state.cat1)&&(!state.cat2||r.cat2===state.cat2));
    let rows=group(scoped,level), rateMap=new Map(group(scoped.filter(r=>eligible(periods).includes(r.period)),level).map(x=>[x[level],x.count]));
    rows.forEach(x=>{const c1=level==="cat1"?x.cat1:state.cat1,c2=level==="cat2"?x.cat2:"";x.qty=salesQty(eligible(periods),c1,c2,"");x.rate=x.qty>0?(rateMap.get(x[level])||0)/x.qty*10000:NaN});
    rows.sort((a,b)=>(a[state.rateSort.key]||0)-(b[state.rateSort.key]||0));if(state.rateSort.dir<0)rows.reverse();
    return `<div class="section-head"><div><h2>${label}排名</h2><p class="subtitle">默认按选定时间售后总数降序；售后率优先，数量辅助判断</p></div></div>${sortControls("rate",state.rateSort,[["count","售后总数"],["rate","每万件"]])}`+table(["品类","售后总数","销售件数","每万件","原因下钻"],rows.map((x,i)=>`<tr><td><span class="rank">${i+1}</span>${safe(x[level])}</td><td>${fmt.format(x.count)}</td><td>${fmt.format(x.qty)}</td><td><span class="pill">${Number.isFinite(x.rate)?x.rate.toFixed(1):"—"}</span></td><td><button class="drill" data-action="rate-drill" data-key="${level}" data-value="${safe(x[level])}">查看原因 ›</button></td></tr>`));
  }
  function renderRate(){body.innerHTML=`<div class="grid"><article class="card"><h2>品类售后率趋势</h2><h3>${safe(state.cat2||state.cat1||"全部品类")} · 数量与每万件登记数</h3><div class="chart-wrap">${lineChart()}</div></article><article class="card">${rateRanking()}</article></div>`;bindTooltips();}

  function compTable(){
    const periods=periodsFor(), completePeriods=eligible(periods), base=filtered(dataRows("comp"),periods,{product:""}), eligibleBase=filtered(dataRows("comp"),completePeriods,{product:""});let rows,title,back="",nextAction="";
    if(state.compLevel==="categories"){
      const level=state.cat1?"cat2":"cat1", amountMap=new Map(group(eligibleBase,level).map(x=>[x[level],x.amount]));rows=group(base,level);rows.forEach(x=>{x.name=x[level];const c1=level==="cat1"?x.name:state.cat1,c2=level==="cat2"?x.name:"";x.qty=salesQty(completePeriods,c1,c2,"");x.per10k=x.qty?(amountMap.get(x.name)||0)/x.qty*10000:NaN});title="赔偿金额构成";nextAction="comp-category";
    }else if(state.compLevel==="reasons"){
      const c=state.compCategory;base.splice(0,base.length,...base.filter(r=>r[c.key]===c.value));const rateRows=eligibleBase.filter(r=>r[c.key]===c.value),amountMap=new Map(group(rateRows,"issue").map(x=>[x.issue,x.amount]));rows=group(base,"issue");rows.forEach(x=>{x.name=x.issue;x.qty=salesQty(completePeriods,c.key==="cat1"?c.value:state.cat1,c.key==="cat2"?c.value:state.cat2,"");x.per10k=x.qty?(amountMap.get(x.issue)||0)/x.qty*10000:NaN});title=`${c.value}：赔偿原因`;back=`<button class="back" data-action="comp-back">← 返回品类构成</button>`;nextAction="comp-reason";
    }else{
      const c=state.compCategory;const rr=base.filter(r=>r[c.key]===c.value&&r.issue===state.compIssue),rateRows=eligibleBase.filter(r=>r[c.key]===c.value&&r.issue===state.compIssue),amountMap=new Map(group(rateRows,"product").map(x=>[x.product,x.amount]));rows=group(rr,"product");rows.forEach(x=>{x.name=x.product;x.code=rr.find(r=>r.product===x.product)?.code||"";x.qty=salesQty(completePeriods,c.key==="cat1"?c.value:state.cat1,c.key==="cat2"?c.value:state.cat2,x.product);x.per10k=x.qty?(amountMap.get(x.product)||0)/x.qty*10000:NaN});title=`${state.compIssue}：赔偿产品`;back=`<button class="back" data-action="comp-back">← 返回原因构成</button>`;
    }
    rows.forEach(x=>x.avg=x.count?x.amount/x.count:0);rows.sort((a,b)=>(a[state.compSort.key]||0)-(b[state.compSort.key]||0));if(state.compSort.dir<0)rows.reverse();const total=sum(rows,"amount");
    return `<div class="section-head"><div><h2>${safe(title)}</h2><p class="subtitle">赔偿总额、频次、单笔水平与销量标准化金额</p></div>${back}</div>${sortControls("comp",state.compSort,[["amount","赔偿金额"],["count","赔偿笔数"],["avg","单笔平均"],["per10k","每万件赔偿"]])}`+table([state.compLevel==="products"?"产品 / 编码":"品类 / 原因","赔偿金额","记录数","单笔平均","最大单笔","金额占比","每万件赔偿","下钻"],rows.map((x,i)=>`<tr><td><span class="rank">${i+1}</span>${safe(x.name)}${x.code?`<br><small>${safe(x.code)}</small>`:""}</td><td>${money(x.amount)}</td><td>${fmt.format(x.count)}</td><td>${money(x.avg)}</td><td>${money(x.maxSingle)}</td><td>${(x.amount/Math.max(1,total)*100).toFixed(1)}%</td><td>${Number.isFinite(x.per10k)?money(x.per10k):"—"}</td><td>${nextAction?`<button class="drill" data-action="${nextAction}" data-value="${safe(x.name)}">下钻 ›</button>`:"—"}</td></tr>`),"980px")+`<div class="muted-box">正式合计已排除单笔超过 ${money(D.meta.compensationLimit)} 的疑似录入异常，异常记录仍在右侧备查清单中保留。</div>`;
  }
  function auditTable(){const rows=D.compensationAudit.filter(a=>(!state.cat1||a.cat1===state.cat1)&&(!state.cat2||a.cat2===state.cat2));return `<h2>金额异常备查</h2><p class="subtitle">发现疑似小数点/单位录入错误的产品</p>`+(rows.length?table(["产品","金额","原因","来源行"],rows.map(a=>`<tr><td>${safe(a.product)}<br><small>${safe(a.code)}</small></td><td class="bad">${money(a.amount)}</td><td>${safe(a.reason)}</td><td>${safe(a.sourceRow)}</td></tr>`)):"<div class='empty'>当前筛选未发现录入异常</div>");}
  function renderComp(){body.innerHTML=`<div class="grid"><article class="card">${compTable()}</article><article class="card">${auditTable()}</article></div>`;}

  function aggregateProductIssues(periods){
    const rows=filtered(dataRows("issues"),periods,{product:""}), rateRows=filtered(dataRows("issues"),eligible(periods),{product:""}), comps=filtered(dataRows("comp"),periods,{product:""}), prev=previousPeriods(periods), prevRows=filtered(dataRows("issues"),prev,{product:""});const map=new Map(), rateMap=new Map();
    rows.forEach(r=>{const key=`${r.cat1}|${r.cat2}|${r.product}|${r.code}|${r.issue}`,x=map.get(key)||{cat1:r.cat1,cat2:r.cat2,product:r.product,code:r.code,issue:r.issue,count:0,amount:0};x.count+=Number(r.count||0);x.amount+=Number(r.amount||0);map.set(key,x)});
    rateRows.forEach(r=>{const key=`${r.cat1}|${r.cat2}|${r.product}|${r.code}|${r.issue}`;rateMap.set(key,(rateMap.get(key)||0)+Number(r.count||0))});
    const prevMap=new Map();prevRows.forEach(r=>{const key=`${r.cat1}|${r.cat2}|${r.product}|${r.code}|${r.issue}`;prevMap.set(key,(prevMap.get(key)||0)+Number(r.count||0))});
    const compMap=new Map();comps.forEach(r=>{const key=`${r.cat1}|${r.cat2}|${r.product}|${r.code}|${r.issue}`;compMap.set(key,(compMap.get(key)||0)+Number(r.amount||0))});
    const total=sum(rows,"count"),comparable=validComparison(periods,prev);for(const [key,x] of map){x.prev=prevMap.get(key)||0;x.delta=comparable?change(x.count,x.prev):NaN;x.qty=salesQty(eligible(periods),x.cat1,x.cat2,x.product);x.rate=x.qty?(rateMap.get(key)||0)/x.qty*10000:NaN;x.share=x.count/Math.max(1,total)*100;x.comp=compMap.get(key)||0;x.priority=x.count+Math.min(50,Number.isFinite(x.rate)?x.rate:0)+(x.delta>20?20:0)+(x.comp>1000?20:0);x.tags=[];if(x.count>=20)x.tags.push("高频");if(Number.isFinite(x.rate)&&x.rate>=20)x.tags.push("高发生率");if(x.delta>20)x.tags.push("持续上升");if(comparable&&x.prev===0&&x.count>=5)x.tags.push("新增问题");if(x.qty>0&&x.qty<1000)x.tags.push("小样本");if(x.comp>1000)x.tags.push("高赔偿");}
    return [...map.values()].sort((a,b)=>b.priority-a.priority);
  }
  function productActions(){const rows=aggregateProductIssues(periodsFor()).slice(0,50);return `<div class="section-head"><div><h2>产品问题优先清单</h2><p class="subtitle">帮助产品经理快速找到“高频、高发生率、持续上升”的具体产品问题</p></div></div>`+table(["产品 / 编码","具体问题","售后数","每万件","占比","较上期","赔偿金额","风险标签","优先级"],rows.map((x,i)=>`<tr class="click-row" data-action="jump-cause" data-cat1="${safe(x.cat1)}" data-cat2="${safe(x.cat2)}" data-product="${safe(x.product)}" data-issue="${safe(x.issue)}"><td><span class="rank">${i+1}</span>${safe(x.product)}<br><small>${safe(x.code)}</small></td><td>${safe(x.issue)}</td><td>${fmt.format(x.count)}</td><td>${Number.isFinite(x.rate)?x.rate.toFixed(1):"—"}</td><td>${x.share.toFixed(1)}%</td><td class="${valClass(x.delta)}">${pct(x.delta)}</td><td>${money(x.comp)}</td><td>${x.tags.map((t,j)=>`<span class="tag ${j<2?"red":"blue"}">${t}</span>`).join("")||"—"}</td><td class="priority">P${x.priority>80?1:x.priority>35?2:3}</td></tr>`),"1120px")+`<div class="muted-box">点击任一行，直接跳到“售后原因分析”并同步产品、问题与趋势筛选。</div>`;}
  function financeActions(){
    const periods=periodsFor(), rows=filtered(dataRows("comp"),periods,{product:""}), rateRows=filtered(dataRows("comp"),eligible(periods),{product:""}), prev=filtered(dataRows("comp"),previousPeriods(periods),{product:""}), map=new Map(), pm=new Map(), rateMap=new Map();
    rows.forEach(r=>{const key=`${r.cat1}|${r.cat2}|${r.product}|${r.code}`,x=map.get(key)||{cat1:r.cat1,cat2:r.cat2,product:r.product,code:r.code,amount:0,count:0,maxSingle:0};x.amount+=Number(r.amount||0);x.count+=Number(r.count||0);x.maxSingle=Math.max(x.maxSingle,Number(r.maxSingle||0));map.set(key,x)});rateRows.forEach(r=>{const k=`${r.cat1}|${r.cat2}|${r.product}|${r.code}`;rateMap.set(k,(rateMap.get(k)||0)+Number(r.amount||0))});prev.forEach(r=>{const k=`${r.cat1}|${r.cat2}|${r.product}|${r.code}`;pm.set(k,(pm.get(k)||0)+Number(r.amount||0))});
    const comparable=validComparison(periods,previousPeriods(periods)),total=sum(rows,"amount"), auditKeys=new Set(D.compensationAudit.map(a=>`${a.code}|${a.product}`));let list=[...map.entries()].map(([key,x])=>{x.prev=pm.get(key)||0;x.delta=comparable?change(x.amount,x.prev):NaN;x.avg=x.count?x.amount/x.count:0;x.qty=salesQty(eligible(periods),x.cat1,x.cat2,x.product);x.per10k=x.qty?(rateMap.get(key)||0)/x.qty*10000:NaN;x.share=x.amount/Math.max(1,total)*100;x.tags=[];if(x.delta>50)x.tags.push("金额激增");if(x.avg>500)x.tags.push("高客单赔偿");if(x.maxSingle>1000)x.tags.push("大额单笔");if(x.count>=5)x.tags.push("重复赔偿");if(x.share>10)x.tags.push("金额集中");if(auditKeys.has(`${x.code}|${x.product}`))x.tags.push("疑似录入错误");return x}).sort((a,b)=>b.amount-a.amount).slice(0,50);
    return `<div class="section-head"><div><h2>财务赔偿异常清单</h2><p class="subtitle">帮助财务快速发现金额激增、高客单、大额单笔、重复赔偿与录入错误</p></div></div>`+table(["产品 / 编码","赔偿总额","记录数","单笔平均","最大单笔","每万件赔偿","较上期","金额占比","异常标签"],list.map((x,i)=>`<tr class="click-row" data-action="jump-comp" data-cat1="${safe(x.cat1)}" data-cat2="${safe(x.cat2)}" data-product="${safe(x.product)}"><td><span class="rank">${i+1}</span>${safe(x.product)}<br><small>${safe(x.code)}</small></td><td>${money(x.amount)}</td><td>${fmt.format(x.count)}</td><td>${money(x.avg)}</td><td>${money(x.maxSingle)}</td><td>${Number.isFinite(x.per10k)?money(x.per10k):"—"}</td><td class="${valClass(x.delta)}">${pct(x.delta)}</td><td>${x.share.toFixed(1)}%</td><td>${x.tags.map(t=>`<span class="tag red">${t}</span>`).join("")||"—"}</td></tr>`),"1160px")+`<div class="muted-box">点击任一行，直接跳到“赔偿分析”查看品类 → 原因 → 产品下钻。</div>`;
  }
  function renderAction(){body.innerHTML=`<div class="subtabs"><button data-action-tab="product" class="${state.actionTab==="product"?"active":""}">产品问题优先清单</button><button data-action-tab="finance" class="${state.actionTab==="finance"?"active":""}">财务赔偿异常清单</button></div><article class="card ${state.actionTab==="finance"?"finance action-card":"action-card"}">${state.actionTab==="product"?productActions():financeActions()}</article>`;}

  function render(){currentMetrics();if(state.module==="cause")renderCause();else if(state.module==="rate")renderRate();else if(state.module==="comp")renderComp();else renderAction();}
  function refresh(){refreshControls();render();}
  document.addEventListener("click",async e=>{
    const moduleBtn=e.target.closest(".tabs [data-module]");
    if(moduleBtn){state.module=moduleBtn.dataset.module;if(state.module==="action"){state.grain="week";state.range="recent4";}state.issue="";state.product="";resetDrills();if(state.module==="action"){refreshControls();try{await ensureProductData();salesIndexCache.clear();}catch{return;}}refresh();return;}
    const grainBtn=e.target.closest(".period-switch [data-grain]");
    if(grainBtn){state.grain=grainBtn.dataset.grain;state.range=state.grain==="week"?"recent4":"ytd";state.issue="";state.product="";resetDrills();refresh();return;}
    if(e.target.closest("#themeBtn")){document.body.classList.toggle("dark");$("#themeBtn").textContent=document.body.classList.contains("dark")?"浅色模式":"深色模式";}
  },true);
  document.addEventListener("change",e=>{
    if(e.target===rangeSelect){state.range=rangeSelect.value;state.issue="";state.product="";resetDrills();refresh();}
    if(e.target===issueSelect){state.issue=issueSelect.value;state.product="";resetDrills();refresh();}
  });
  body.onclick=async e=>{
    const sort=e.target.closest("[data-sort-scope]");if(sort){const s=sort.dataset.sortScope==="rate"?state.rateSort:state.compSort;s.dir=s.key===sort.dataset.sortKey?-s.dir:-1;s.key=sort.dataset.sortKey;render();return;}
    const tab=e.target.closest("[data-action-tab]");if(tab){state.actionTab=tab.dataset.actionTab;state.issue="";refresh();return;}
    const a=e.target.closest("[data-action]");if(!a)return;const act=a.dataset.action;
    const needsProduct=act==="cause-drill"||act==="select-product"||act==="comp-reason";
    if(act==="cause-drill"){state.causeLevel="products";state.causeIssue=a.dataset.issue;state.issue=a.dataset.issue;}
    if(act==="cause-back"){state.causeLevel="issues";state.causeIssue="";state.product="";state.issue="";}
    if(act==="select-product"){state.product=a.dataset.product;state.issue=a.dataset.issue;}
    if(act==="rate-drill"){state.rateLevel="reasons";state.rateCategory={key:a.dataset.key,value:a.dataset.value};}
    if(act==="rate-back"){state.rateLevel="categories";state.rateCategory=null;}
    if(act==="comp-category"){state.compLevel="reasons";state.compCategory={key:state.cat1?"cat2":"cat1",value:a.dataset.value};}
    if(act==="comp-reason"){state.compLevel="products";state.compIssue=a.dataset.value;}
    if(act==="comp-back"){if(state.compLevel==="products"){state.compLevel="reasons";state.compIssue="";}else{state.compLevel="categories";state.compCategory=null;}}
    if(act==="jump-cause"){state.module="cause";state.cat1=a.dataset.cat1;state.cat2=a.dataset.cat2;state.issue=a.dataset.issue;state.product=a.dataset.product;state.causeLevel="products";state.causeIssue=state.issue;}
    if(act==="jump-comp"){state.module="comp";state.cat1=a.dataset.cat1;state.cat2=a.dataset.cat2;state.product=a.dataset.product;state.compLevel="categories";}
    if(needsProduct&&!window.AFTER_SALES_PRODUCT_SALES){refreshControls();try{await ensureProductData();salesIndexCache.clear();}catch{return;}}
    refresh();
  };
  $("#dataStatus").textContent=`售后 ${D.meta.afterSalesMin} 至 ${D.meta.afterSalesMax} · 销售至 ${D.meta.salesMax} · 分类规则 ${D.meta.classificationVersion} · 页面版本 v7`;
  refresh();
})();
