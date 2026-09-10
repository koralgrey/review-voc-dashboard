(() => {
  "use strict";
  const D = window.COMPLAINT_DATA;
  if (!D) return;
  const $ = selector => document.querySelector(selector);
  const kpis = $("#complaintKpis"), body = $("#complaintDashboardBody"), scope = $("#complaintScope");
  const fmt = new Intl.NumberFormat("zh-CN", {maximumFractionDigits:1});
  const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const pct = value => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "—";
  const pp = value => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp` : "—";
  const change = (current, previous) => previous > 0 ? (current / previous - 1) * 100 : NaN;
  const typeCount = (row, index) => Number(row?.[2 + index] || 0);
  const resultCount = row => Number(row?.[2 + D.types.length] || 0);
  const statusCount = row => Number(row?.[3 + D.types.length] || 0);
  const state = {grain:"week"};

  const week = period => D.weeks.find(row => row[0] === period);
  const latest = () => week(D.meta.latestCompleteWeek);
  const previous = () => week(D.meta.priorCompleteWeek);
  const recentComplete = () => D.weeks.filter(row => row[0] <= D.meta.latestCompleteWeek).slice(-4);
  const average = rows => rows.length ? rows.reduce((sum, row) => sum + row[1], 0) / rows.length : NaN;
  const latestMonthComplete = () => D.months.filter(row => row[0] < D.meta.sourceMax.slice(0,7)).at(-1);
  const previousMonth = () => { const row=latestMonthComplete(); return row ? D.months[D.months.indexOf(row)-1] : null; };

  function card(label, value, compare, note, tone="") {
    return `<article class="complaint-kpi ${tone}"><span>${safe(label)}</span><strong>${safe(value)}</strong><b>${safe(compare)}</b><small>${safe(note)}</small></article>`;
  }

  function renderKpis() {
    const current=latest(), prior=previous(), four=recentComplete(), fourAvg=average(four);
    const currentTotal=current?.[1]||0, priorTotal=prior?.[1]||0;
    const currentResult=currentTotal ? resultCount(current)/currentTotal*100 : NaN;
    const priorResult=priorTotal ? resultCount(prior)/priorTotal*100 : NaN;
    const recentValidProducts=D.recentProductWeekly.reduce((sum,row)=>sum+row[1],0), recentTotal=four.reduce((sum,row)=>sum+row[1],0);
    const recentCoverage=recentTotal?recentValidProducts/recentTotal*100:NaN;
    const cumulativeCoverage=(D.meta.recordCount-D.meta.missingProduct-D.meta.unstandardizedProduct)/D.meta.recordCount*100;
    kpis.innerHTML=
      card(`${D.meta.latestCompleteWeek} 投诉量`,`${fmt.format(currentTotal)} 起`,`环比 ${pct(change(currentTotal,priorTotal))}`,`上周 ${fmt.format(priorTotal)} 起；自然周一至周日`,"volume")+
      card("较近4周均值",pct(change(currentTotal,fourAvg)),`本周 ${fmt.format(currentTotal)} 起 / 均值 ${fmt.format(fourAvg)} 起`,`最近4个完整周：${four.map(row=>row[1]).join(" → ")}`,"trend")+
      card("处理结果填写率",Number.isFinite(currentResult)?`${currentResult.toFixed(1)}%`:"—",`较上周 ${pp(currentResult-priorResult)}`,`${fmt.format(resultCount(current))}/${fmt.format(currentTotal)} 条已填写`,"result")+
      card("近4周产品填写率",Number.isFinite(recentCoverage)?`${recentCoverage.toFixed(1)}%`:"—",`较累计 ${pp(recentCoverage-cumulativeCoverage)}`,`累计有效填写率 ${cumulativeCoverage.toFixed(1)}%；缺失不是零`,"quality");
  }

  function trendChart() {
    const isWeek=state.grain==="week";
    const rows=isWeek ? D.weeks.filter(row=>row[0]<=D.meta.currentPartialWeek).slice(-9) : D.months.filter(row=>row[0].startsWith("2026-"));
    const max=Math.max(1,...rows.map(row=>row[1])), W=1000,H=350,L=56,R=34,T=44,B=58,iw=W-L-R,ih=H-T-B,bar=Math.min(64,iw/Math.max(1,rows.length)*.58);
    let svg=`<svg class="complaint-trend-svg" viewBox="0 0 ${W} ${H}">`;
    for(let i=0;i<4;i++){const y=T+i*ih/3;svg+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="var(--line)"/>`;}
    rows.forEach((row,index)=>{const x=L+(index+.5)*iw/rows.length,height=row[1]/max*ih,y=T+ih-height,partial=(isWeek&&row[0]===D.meta.currentPartialWeek)||(!isWeek&&row[0]===D.meta.sourceMax.slice(0,7)),prior=rows[index-1]?.[1],delta=change(row[1],prior);svg+=`<g class="complaint-bar"><rect x="${x-bar/2}" y="${y}" width="${bar}" height="${height}" rx="8" fill="${partial?'var(--orange)':'var(--blue)'}" opacity=".82"/><text x="${x}" y="${Math.max(18,y-9)}" text-anchor="middle" fill="var(--text)" font-size="13" font-weight="800">${row[1]}</text><text x="${x}" y="${H-29}" text-anchor="middle" fill="var(--muted)" font-size="12">${safe(row[0].replace(/^2026-/,""))}</text><text x="${x}" y="${H-11}" text-anchor="middle" fill="${partial?'var(--orange)':'var(--muted)'}" font-size="10">${partial?'部分周期':(Number.isFinite(delta)?pct(delta):'基期缺失')}</text></g>`;});
    return `<article class="card complaint-trend-card"><div class="section-head"><div><span class="section-index">01 · 投诉量趋势</span><h2>${isWeek?"最近完整周与当前周":"2026年月度趋势"}</h2><p class="subtitle">完整周期提供环比；当前未结束周期只展示累计，不判断好坏</p></div></div>${svg}</svg></article>`;
  }

  function typeTable() {
    const current=latest(), prior=previous(), four=recentComplete(), total=current?.[1]||0;
    const rows=D.types.map((name,index)=>{const count=typeCount(current,index),previousCount=typeCount(prior,index),trend=four.map(row=>typeCount(row,index));return {name,count,previousCount,trend};}).sort((a,b)=>b.count-a.count);
    const max=Math.max(1,...rows.map(row=>row.count));
    return `<article class="card complaint-type-card"><div class="section-head"><div><span class="section-index">02 · 投诉类型占比</span><h2>${safe(D.meta.latestCompleteWeek)} 投诉类型（规则初分）</h2><p class="subtitle">源表没有结构化投诉类型，本模块由投诉详情关键词初分，只用于发现线索</p></div></div><div class="table-wrap"><table><thead><tr><th>投诉类型</th><th>规模</th><th>本周起数</th><th>占比</th><th>环比</th><th>最近4周</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td><span class="rank">${index+1}</span>${safe(row.name)}</td><td><div class="bar"><i style="width:${row.count/max*100}%"></i></div></td><td>${row.count}</td><td>${total?(row.count/total*100).toFixed(1):"—"}%</td><td class="${row.count>row.previousCount?'bad':row.count<row.previousCount?'good':''}">${pct(change(row.count,row.previousCount))}</td><td><span class="complaint-mini-trend">${row.trend.join(" → ")}</span></td></tr>`).join("")}</tbody></table></div><div class="muted-box">建议在源表新增必填“投诉类型”字段后替换规则初分；当前“其他/待核实”不能解释为没有问题。</div></article>`;
  }

  function productTable() {
    const weeks=D.recentProductWeeks;
    const total=D.recentProductWeekly.reduce((sum,row)=>sum+row[1],0);
    return `<article class="card complaint-product-card"><div class="section-head"><div><span class="section-index">03 · 产品分布</span><h2>近4个完整周已填写产品</h2><p class="subtitle">只对产品字段有效记录排序；未填写与疑似误填不参与产品排名</p></div></div><div class="table-wrap"><table><thead><tr><th>产品</th><th>近4周起数</th><th>有效产品记录占比</th><th>${safe(weeks[0].slice(-3))}</th><th>${safe(weeks[1].slice(-3))}</th><th>${safe(weeks[2].slice(-3))}</th><th>${safe(weeks[3].slice(-3))}</th><th>较上周</th></tr></thead><tbody>${D.recentProductWeekly.map((row,index)=>`<tr><td><span class="rank">${index+1}</span>${safe(row[0])}</td><td>${row[1]}</td><td>${total?(row[1]/total*100).toFixed(1):"—"}%</td><td>${row[2]}</td><td>${row[3]}</td><td>${row[4]}</td><td>${row[5]}</td><td class="${row[5]>row[4]?'bad':row[5]<row[4]?'good':''}">${row[5]-row[4]>=0?"+":""}${row[5]-row[4]}</td></tr>`).join("")}</tbody></table></div><div class="muted-box">近4周共 ${recentComplete().reduce((sum,row)=>sum+row[1],0)} 起投诉，其中 ${total} 起填写了可用产品名称；产品覆盖不足时不做产品间好坏判断。</div></article>`;
  }

  function qualityAndChannel() {
    const missingProductRate=D.meta.missingProduct/D.meta.recordCount*100,missingResultRate=D.meta.missingResult/D.meta.recordCount*100,missingStatusRate=D.meta.missingStatus/D.meta.recordCount*100;
    const channelCoverage=D.meta.recordCount?D.meta.storeExported/D.meta.recordCount*100:0,channelRows=D.recentChannelWeekly||[],channelUsable=channelCoverage>=90&&channelRows.length>0,channelTotal=channelRows.reduce((sum,row)=>sum+row[1],0);
    const channelBody=channelUsable?`<div class="table-wrap"><table><thead><tr><th>投诉渠道</th><th>近4周起数</th><th>有效渠道占比</th><th>本周</th><th>较上周</th><th>近4周</th></tr></thead><tbody>${channelRows.map((row,index)=>`<tr><td><span class="rank">${index+1}</span>${safe(row[0])}</td><td>${row[1]}</td><td>${channelTotal?(row[1]/channelTotal*100).toFixed(1):"—"}%</td><td>${row[5]}</td><td class="${row[5]>row[4]?'bad':row[5]<row[4]?'good':''}">${row[5]-row[4]>=0?"+":""}${row[5]-row[4]}</td><td><span class="complaint-mini-trend">${row.slice(2).join(" → ")}</span></td></tr>`).join("")}</tbody></table></div><div class="muted-box">关联店铺字段覆盖 ${channelCoverage.toFixed(1)}%；渠道占比仅在覆盖率达到90%后展示。</div>`:`<div class="complaint-unavailable"><strong>—</strong><p>${safe(D.meta.storeFieldNote)}</p><small>当前关联店铺字段覆盖 ${channelCoverage.toFixed(1)}%。解除条件：开放关联店铺表读取/导出权限；覆盖率达90%后自动展示渠道投诉量、占比、环比和近4周趋势。</small></div>`;
    return `<div class="grid complaint-bottom-grid"><article class="card complaint-channel-card"><div class="section-head"><div><span class="section-index">04 · 投诉渠道</span><h2>${channelUsable?"近4周渠道分布":"渠道分布暂不可计算"}</h2></div></div>${channelBody}</article><article class="card complaint-quality-card"><div class="section-head"><div><span class="section-index">05 · 数据质量</span><h2>影响分析的字段缺口</h2></div></div><div class="quality-grid"><div><b>产品未填写</b><strong>${D.meta.missingProduct}</strong><p>${missingProductRate.toFixed(1)}% · 产品分布覆盖受限</p></div><div><b>处理结果未填写</b><strong>${D.meta.missingResult}</strong><p>${missingResultRate.toFixed(1)}% · 闭环判断受限</p></div><div><b>工单状态未同步</b><strong>${D.meta.missingStatus}</strong><p>${missingStatusRate.toFixed(1)}% · 无法可靠统计未结单</p></div><div><b>重复工单</b><strong>${D.meta.duplicateTickets}</strong><p>${D.meta.uniqueTickets}个唯一工单 · ${D.meta.duplicateTickets?"重复键已从汇总排除":"当前未发现重复键"}</p></div></div></article></div>`;
  }

  function conclusion() {
    const current=latest(),prior=previous(),four=recentComplete(),total=current[1],top=D.types.map((name,index)=>({name,count:typeCount(current,index),prev:typeCount(prior,index)})).sort((a,b)=>b.count-a.count)[0];
    return `<section class="complaint-conclusion"><strong>本周结论</strong><span>${safe(D.meta.latestCompleteWeek)} 投诉 ${total} 起，环比 ${pct(change(total,prior[1]))}，较近4周均值 ${pct(change(total,average(four)))}。</span><em>主要线索为“${safe(top.name)}” ${top.count} 起，较上周 ${top.count-top.prev>=0?"+":""}${top.count-top.prev} 起；类型为规则初分。</em></section>`;
  }

  function render() {
    document.querySelectorAll("[data-complaint-grain]").forEach(button=>button.classList.toggle("active",button.dataset.complaintGrain===state.grain));
    scope.textContent=`最新完整周 ${D.meta.latestCompleteWeek} · 当前 ${D.meta.currentPartialWeek} 部分周 · 数据截至 ${D.meta.sourceMax}`;
    renderKpis();
    body.innerHTML=conclusion()+`<div class="grid complaint-main-grid">${trendChart()}${typeTable()}</div>`+productTable()+qualityAndChannel();
  }

  document.addEventListener("click", event=>{const button=event.target.closest("[data-complaint-grain]");if(!button)return;state.grain=button.dataset.complaintGrain;render();});
  window.COMPLAINT_APP={render};
  render();
})();
