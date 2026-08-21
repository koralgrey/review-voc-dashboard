(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const fmt = new Intl.NumberFormat("zh-CN", {maximumFractionDigits:1});
  const money = n => `¥${fmt.format(Number(n || 0))}`;
  const safe = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sum = (rows,key) => rows.reduce((a,r)=>a+Number(r[key]||0),0);
  const change = (a,b) => Number.isFinite(a)&&Number.isFinite(b)&&b!==0?(a/b-1)*100:NaN;
  const pct = n => Number.isFinite(n)?`${n>=0?"+":""}${n.toFixed(1)}%`:"—";
  const pp = n => Number.isFinite(n)?`${n>=0?"+":""}${n.toFixed(1)}pp`:"—";
  const cls = n => Number.isFinite(n)?(n>0?"up":"down"):"muted";
  const reviewContext = {periods:[], common:[], current:""};
  const drillAttrs = (kind,metric,name="",code="") => `data-review-drill data-review-kind="${safe(kind)}" data-review-metric="${safe(metric)}" data-review-name="${safe(name)}" data-review-code="${safe(code)}"`;
  const drillCell = (html,kind,metric,name="",code="",className="") => `<td class="review-drill-value ${className}" ${drillAttrs(kind,metric,name,code)}>${html}</td>`;

  function preAgg(rows){const x={consult:sum(rows,"c"),sales:sum(rows,"a"),converted:sum(rows,"t"),inquiryBase:sum(rows,"ib"),storeSalesBase:sum(rows,"sb"),shareSales:sum(rows,"sa"),shareDays:sum(rows,"sd"),days:sum(rows,"d"),fw:sum(rows,"fw"),fn:sum(rows,"fn"),aw:sum(rows,"aw"),an:sum(rows,"an")};x.conversion=x.inquiryBase?x.converted/x.inquiryBase*100:NaN;x.salesShareCoverage=x.days?x.shareDays/x.days*100:0;x.salesShare=x.storeSalesBase&&x.salesShareCoverage>=90?x.shareSales/x.storeSalesBase*100:NaN;x.salesPerConsult=x.consult?x.sales/x.consult:NaN;x.first=x.fn?x.fw/x.fn:NaN;x.avg=x.an?x.aw/x.an:NaN;return x;}
  function afterAgg(A,period){const issues=A.issuesWeek.filter(r=>r.period===period),sales=A.salesWeek.filter(r=>r.period===period),comp=A.compWeek.filter(r=>r.period===period),count=sum(issues,"count"),salesAmount=sum(sales,"amount"),paid=sum(comp,"paidAmount"),amount=sum(comp,"amount");return {issues,sales,comp,count,salesAmount,rate:salesAmount>0?count/salesAmount*10000:NaN,paid,amount,compCount:sum(comp,"count")};}
  function periodRange(period){const [year,w]=period.split("-W").map(Number),jan4=new Date(Date.UTC(year,0,4)),day=jan4.getUTCDay()||7,monday=new Date(jan4);monday.setUTCDate(jan4.getUTCDate()-day+1+(w-1)*7);const sunday=new Date(monday);sunday.setUTCDate(monday.getUTCDate()+6);const f=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;return [f(monday),f(sunday)];}
  const lastYearPeriod=p=>`${Number(p.slice(0,4))-1}${p.slice(4)}`;
  function table(headers,rows,min="980px"){return `<div class="table-wrap"><table style="min-width:${min}"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;}
  function trend(periods,values,formatter){return `<span class="mini-trend">${periods.map((p,i)=>`${p.slice(-3)} ${formatter(values[i])}`).join(" → ")}</span>`;}
  function reviewCard(label,value,current,previous,yoy,trendHtml,mode="pct",note="",kind="",metric=""){const mom=mode==="pp"?pp(current-previous):pct(change(current,previous)),year=Number.isFinite(yoy)?(mode==="pp"?pp(current-yoy):pct(change(current,yoy))):"—";return `<article class="review-kpi review-drill-value" ${drillAttrs(kind,metric)}><span>${label}</span><strong>${value}</strong><div class="review-comp"><b class="${cls(mode==="pp"?current-previous:change(current,previous))}">环比 ${mom}</b><b>同比 ${year}</b></div>${trendHtml}<small>${note} · 点击查看近4周</small></article>`;}

  function platformTable(P,periods,current,previous){const platforms=P.meta.platforms,curRows=P.week.filter(r=>r.p===current),prevRows=P.week.filter(r=>r.p===previous);const rows=platforms.map(name=>{const c=preAgg(curRows.filter(r=>r.pf===name)),p=preAgg(prevRows.filter(r=>r.pf===name)),ts=periods.map(x=>preAgg(P.week.filter(r=>r.p===x&&r.pf===name)).conversion);return {name,c,p,ts};}).sort((a,b)=>b.c.sales-a.c.sales);return table(["平台","咨询人数","环比","询单转化率","环比","客服净销售额","环比","平均响应","环比","近4周转化趋势"],rows.map((x,i)=>`<tr><td><span class="rank">${i+1}</span>${safe(x.name)}</td>${drillCell(fmt.format(x.c.consult),"prePlatform","consult",x.name)}${drillCell(pct(change(x.c.consult,x.p.consult)),"prePlatform","consult",x.name,"",cls(change(x.c.consult,x.p.consult)))}${drillCell(Number.isFinite(x.c.conversion)?x.c.conversion.toFixed(1)+"%":"—","prePlatform","conversion",x.name)}${drillCell(pp(x.c.conversion-x.p.conversion),"prePlatform","conversion",x.name,"",cls(x.c.conversion-x.p.conversion))}${drillCell(money(x.c.sales),"prePlatform","sales",x.name)}${drillCell(pct(change(x.c.sales,x.p.sales)),"prePlatform","sales",x.name,"",cls(change(x.c.sales,x.p.sales)))}${drillCell(Number.isFinite(x.c.avg)?x.c.avg.toFixed(1)+"秒":"—","prePlatform","avg",x.name)}${drillCell(pct(change(x.c.avg,x.p.avg)),"prePlatform","avg",x.name,"",cls(change(x.c.avg,x.p.avg)))}${drillCell(trend(periods,x.ts,v=>Number.isFinite(v)?v.toFixed(1)+"%":"—"),"prePlatform","conversion",x.name)}</tr>`),"1380px");}

  function issueTable(A,periods,current,previous){const cur=A.issuesWeek.filter(r=>r.period===current),prev=A.issuesWeek.filter(r=>r.period===previous),curTotal=sum(cur,"count"),prevTotal=sum(prev,"count"),salesNow=sum(A.salesWeek.filter(r=>r.period===current),"amount"),salesPrev=sum(A.salesWeek.filter(r=>r.period===previous),"amount"),names=[...new Set(cur.map(r=>r.issue))];const groupCount=(rows,name)=>sum(rows.filter(r=>r.issue===name),"count");const rows=names.map(name=>{const count=groupCount(cur,name),last=groupCount(prev,name),share=curTotal?count/curTotal*100:NaN,lastShare=prevTotal?last/prevTotal*100:NaN,rate=salesNow?count/salesNow*10000:NaN,lastRate=salesPrev?last/salesPrev*10000:NaN,ts=periods.map(p=>groupCount(A.issuesWeek.filter(r=>r.period===p),name)),products=[...new Map(cur.filter(r=>r.issue===name).map(r=>[r.product,{name:r.product,count:0}])).values()];products.forEach(x=>x.count=sum(cur.filter(r=>r.issue===name&&r.product===x.name),"count"));products.sort((a,b)=>b.count-a.count);return {name,count,last,share,lastShare,rate,lastRate,ts,product:products[0]?.name||"—"};}).sort((a,b)=>b.count-a.count).slice(0,10);return table(["具体问题","本周起数","环比","占比（较上周）","每万元起数","环比","主要涉及产品","近4周趋势"],rows.map((x,i)=>`<tr><td><span class="rank">${i+1}</span>${safe(x.name)}</td>${drillCell(fmt.format(x.count),"issue","count",x.name)}${drillCell(pct(change(x.count,x.last)),"issue","count",x.name,"",cls(change(x.count,x.last)))}${drillCell(`${x.share.toFixed(1)}% <small>(${pp(x.share-x.lastShare)})</small>`,"issue","share",x.name)}${drillCell(Number.isFinite(x.rate)?x.rate.toFixed(3):"—","issue","rate",x.name)}${drillCell(pct(change(x.rate,x.lastRate)),"issue","rate",x.name,"",cls(change(x.rate,x.lastRate)))}<td>${safe(x.product)}</td>${drillCell(trend(periods,x.ts,v=>fmt.format(v)),"issue","count",x.name)}</tr>`),"1380px");}

  function compensationTable(A,periods,current,previous){const currentRows=A.compWeek.filter(r=>r.period===current),previousRows=A.compWeek.filter(r=>r.period===previous),names=[...new Set(currentRows.map(r=>`${r.code||""}|§${r.product||"未填写产品"}`))];const stats=(period,key)=>{const rows=A.compWeek.filter(r=>r.period===period&&`${r.code||""}|§${r.product||"未填写产品"}`===key);return {paid:sum(rows,"paidAmount"),amount:sum(rows,"amount"),count:sum(rows,"count"),max:Math.max(0,...rows.map(r=>Number(r.maxSingle||0)))};};const rows=names.map(key=>{const [code,name]=key.split("|§"),c=stats(current,key),p=stats(previous,key),ts=periods.map(x=>stats(x,key).paid);return {code,name,c,p,ts};}).sort((a,b)=>(b.c.paid||b.c.amount)-(a.c.paid||a.c.amount)).slice(0,10);return table(["产品 / 编码","本周已打款","环比","登记金额","环比","记录数","环比","最大单笔（较上周）","近4周实付趋势"],rows.map((x,i)=>`<tr><td><span class="rank">${i+1}</span>${safe(x.name)}<br><small>${safe(x.code||"无编码")}</small></td>${drillCell(money(x.c.paid),"comp","paid",x.name,x.code)}${drillCell(pct(change(x.c.paid,x.p.paid)),"comp","paid",x.name,x.code,cls(change(x.c.paid,x.p.paid)))}${drillCell(money(x.c.amount),"comp","amount",x.name,x.code)}${drillCell(pct(change(x.c.amount,x.p.amount)),"comp","amount",x.name,x.code,cls(change(x.c.amount,x.p.amount)))}${drillCell(fmt.format(x.c.count),"comp","count",x.name,x.code)}${drillCell(pct(change(x.c.count,x.p.count)),"comp","count",x.name,x.code,cls(change(x.c.count,x.p.count)))}${drillCell(`${money(x.c.max)} <small>/ ${money(x.p.max)}</small>`,"comp","max",x.name,x.code)}${drillCell(trend(periods,x.ts,v=>money(v)),"comp","paid",x.name,x.code)}</tr>`),"1450px");}

  const metricSpecs = {
    consult:{label:"咨询人数",format:v=>fmt.format(v),mode:"pct"},
    conversion:{label:"询单转化率",format:v=>Number.isFinite(v)?`${v.toFixed(1)}%`:"—",mode:"pp"},
    sales:{label:"客服净销售额",format:money,mode:"pct"},
    avg:{label:"平均响应",format:v=>Number.isFinite(v)?`${v.toFixed(1)}秒`:"—",mode:"pct"},
    count:{label:"售后起数",format:v=>fmt.format(v),mode:"pct"},
    rate:{label:"每万元售后起数",format:v=>Number.isFinite(v)?v.toFixed(3):"—",mode:"pct"},
    share:{label:"售后起数占比",format:v=>Number.isFinite(v)?`${v.toFixed(1)}%`:"—",mode:"pp"},
    paid:{label:"实际已打款",format:money,mode:"pct"},
    amount:{label:"登记赔偿金额",format:money,mode:"pct"},
    max:{label:"最大单笔",format:money,mode:"pct"}
  };

  function reviewMetricValue(kind,metric,period,name="",code=""){
    const P=window.PRE_SALES_DATA,A=window.AFTER_SALES_DATA;
    if(kind==="preTotal"||kind==="prePlatform"){
      const rows=P.week.filter(r=>r.p===period&&(kind==="preTotal"||r.pf===name));
      return preAgg(rows)[metric];
    }
    if(kind==="afterTotal") return afterAgg(A,period)[metric];
    if(kind==="issue"){
      const rows=A.issuesWeek.filter(r=>r.period===period),count=sum(rows.filter(r=>r.issue===name),"count"),total=sum(rows,"count"),sales=sum(A.salesWeek.filter(r=>r.period===period),"amount");
      if(metric==="share")return total?count/total*100:NaN;
      if(metric==="rate")return sales?count/sales*10000:NaN;
      return count;
    }
    if(kind==="comp"){
      const rows=A.compWeek.filter(r=>r.period===period&&r.product===name&&String(r.code||"")===String(code||""));
      if(metric==="max")return Math.max(0,...rows.map(r=>Number(r.maxSingle||0)));
      return sum(rows,metric==="paid"?"paidAmount":metric);
    }
    return NaN;
  }

  function reviewTrendSvg(periods,values,spec){
    const finite=values.filter(Number.isFinite);if(!finite.length)return `<div class="empty">最近4周没有可用数据</div>`;
    const W=900,H=260,L=55,R=30,T=45,B=52,iw=W-L-R,ih=H-T-B,min=Math.min(0,...finite),max=Math.max(1,...finite),span=Math.max(1,max-min),x=i=>L+(periods.length===1?iw/2:i*iw/(periods.length-1)),y=v=>T+ih-(v-min)/span*ih,path=values.map((v,i)=>Number.isFinite(v)?`${i===0||!Number.isFinite(values[i-1])?"M":"L"}${x(i)},${y(v)}`:"").join(" ");
    let svg=`<svg class="modal-trend-svg" viewBox="0 0 ${W} ${H}"><line x1="${L}" y1="${T+ih}" x2="${W-R}" y2="${T+ih}" stroke="var(--line)"/><path d="${path}" fill="none" stroke="var(--red)" stroke-width="4"/>`;
    periods.forEach((p,i)=>{const v=values[i];svg+=`<text x="${x(i)}" y="${H-16}" text-anchor="middle" fill="var(--muted)" font-size="13">${safe(p)}</text>`;if(Number.isFinite(v))svg+=`<circle cx="${x(i)}" cy="${y(v)}" r="6" fill="var(--panel)" stroke="var(--red)" stroke-width="4"/><text x="${x(i)}" y="${Math.max(18,y(v)-13)}" text-anchor="middle" fill="var(--red)" font-size="13" font-weight="800">${safe(spec.format(v))}</text>`;});
    return svg+`</svg>`;
  }

  function openReviewDrill(target){
    const kind=target.dataset.reviewKind,metric=target.dataset.reviewMetric,name=target.dataset.reviewName||"",code=target.dataset.reviewCode||"",spec=metricSpecs[metric];
    if(!spec||!window.DASHBOARD_MODAL)return;
    const periods=reviewContext.periods,values=periods.map(p=>reviewMetricValue(kind,metric,p,name,code)),rows=periods.map((p,i)=>{
      const commonIndex=reviewContext.common.indexOf(p),previous=commonIndex>0?reviewContext.common[commonIndex-1]:"",prev=previous?reviewMetricValue(kind,metric,previous,name,code):NaN,yoy=reviewMetricValue(kind,metric,lastYearPeriod(p),name,code),mom=spec.mode==="pp"?pp(values[i]-prev):pct(change(values[i],prev)),year=spec.mode==="pp"?pp(values[i]-yoy):pct(change(values[i],yoy));
      return `<tr><td>${safe(p)}</td><td>${safe(spec.format(values[i]))}</td><td class="${cls(spec.mode==="pp"?values[i]-prev:change(values[i],prev))}">${mom}</td><td>${year}</td></tr>`;
    }),finite=periods.map((p,i)=>({p,v:values[i]})).filter(x=>Number.isFinite(x.v)),high=finite.slice().sort((a,b)=>b.v-a.v)[0],low=finite.slice().sort((a,b)=>a.v-b.v)[0],scope=name?`${name}${code?` / ${code}`:""}`:"全部范围";
    window.DASHBOARD_MODAL.open({title:`${scope} · ${spec.label}`,subtitle:`最近4个完整销售周 · 点击遮罩、右上角 × 或按 Esc 关闭`,html:`<div class="modal-summary"><span>最高周 <b>${high?safe(high.p)+" · "+safe(spec.format(high.v)):"—"}</b></span><span>最低周 <b>${low?safe(low.p)+" · "+safe(spec.format(low.v)):"—"}</b></span></div>${reviewTrendSvg(periods,values,spec)}${table(["周次","当周数值","环比","同比"],rows,"680px")}`});
  }

  function actionRows(P,A,periods,current,previous){const actions=[];const platforms=P.meta.platforms.map(name=>{const c=preAgg(P.week.filter(r=>r.p===current&&r.pf===name)),p=preAgg(P.week.filter(r=>r.p===previous&&r.pf===name));return {name,c,p,delta:c.conversion-p.conversion};}).sort((a,b)=>a.delta-b.delta);const weak=platforms[0];if(weak&&Number.isFinite(weak.delta)&&weak.delta<0)actions.push({level:Math.abs(weak.delta)>=3?"P0":"P1",problem:`${weak.name}询单转化率下降`,evidence:`${weak.c.conversion.toFixed(1)}%，环比 ${pp(weak.delta)}；咨询 ${pct(change(weak.c.consult,weak.p.consult))}`,team:"客服、运营",action:"抽样未成交咨询，复盘流量、权益与话术",check:"下周转化率回到近4周均值"});
    const cur=A.issuesWeek.filter(r=>r.period===current),prev=A.issuesWeek.filter(r=>r.period===previous),names=[...new Set(cur.map(r=>r.issue))],risks=names.map(name=>{const count=sum(cur.filter(r=>r.issue===name),"count"),last=sum(prev.filter(r=>r.issue===name),"count");return {name,count,last,delta:count-last,rate:change(count,last)};}).sort((a,b)=>b.delta-a.delta),risk=risks[0];if(risk&&risk.delta>0)actions.push({level:risk.rate>=30&&risk.delta>=10?"P0":"P1",problem:`${risk.name}售后起数上升`,evidence:`${risk.count}起，较上周 +${risk.delta}起（${pct(risk.rate)}）`,team:"产品、仓储、客服",action:"下钻高发产品和问题环节，形成临时防控动作",check:"下周起数及每万元起数同时下降"});
    const pdd=preAgg(P.week.filter(r=>r.p===current&&r.pf==="拼多多"));if(pdd.days&&pdd.salesShareCoverage<90)actions.push({level:"P1",problem:"拼多多客服销售占比数据不完整",evidence:`本周有效完整率 ${pdd.salesShareCoverage.toFixed(1)}%，看板已显示“—”`,team:"数据填报、客服",action:"补齐每日店铺销售额或客服销售占比",check:"数据完整率达到90%以上"});
    if(!actions.length)actions.push({level:"P2",problem:"本周未识别到明显恶化项",evidence:"主要指标环比处于正常波动区间",team:"客服、运营",action:"继续跟踪近4周趋势",check:"下周继续保持稳定"});return actions;}

  function render(){const P=window.PRE_SALES_DATA,A=window.AFTER_SALES_DATA,root=$("#weeklyReviewBody");if(!root)return;if(!P||!A){root.innerHTML=`<article class="card loading-card"><div class="loading-dot"></div><h2>正在准备上周复盘…</h2></article>`;return;}
    const sets=[new Set(P.week.map(r=>r.p)),new Set(A.issuesWeek.map(r=>r.period)),new Set(A.salesWeek.filter(r=>Number(r.amount)>0).map(r=>r.period))],common=[...sets[0]].filter(p=>sets[1].has(p)&&sets[2].has(p)).sort(),current=common.at(-1),idx=common.indexOf(current),previous=common[idx-1],periods=common.slice(Math.max(0,idx-3),idx+1),yoyPeriod=lastYearPeriod(current),[start,end]=periodRange(current),curPre=preAgg(P.week.filter(r=>r.p===current)),prevPre=preAgg(P.week.filter(r=>r.p===previous)),yoyPreRows=P.week.filter(r=>r.p===yoyPeriod),yoyPre=yoyPreRows.length?preAgg(yoyPreRows):null,curAfter=afterAgg(A,current),prevAfter=afterAgg(A,previous),yoyAfterRows=A.issuesWeek.filter(r=>r.period===yoyPeriod),yoyAfter=yoyAfterRows.length?afterAgg(A,yoyPeriod):null;
    reviewContext.periods=periods;reviewContext.common=common;reviewContext.current=current;
    const preByPeriod=p=>preAgg(P.week.filter(r=>r.p===p)),afterByPeriod=p=>afterAgg(A,p),preTrend=periods.map(preByPeriod),afterTrend=periods.map(afterByPeriod),cards=[
      reviewCard("咨询人数",fmt.format(curPre.consult),curPre.consult,prevPre.consult,yoyPre?.consult,trend(periods,preTrend.map(x=>x.consult),v=>fmt.format(v)),"pct","售前工作量","preTotal","consult"),
      reviewCard("询单转化率",Number.isFinite(curPre.conversion)?curPre.conversion.toFixed(1)+"%":"—",curPre.conversion,prevPre.conversion,yoyPre?.conversion,trend(periods,preTrend.map(x=>x.conversion),v=>Number.isFinite(v)?v.toFixed(1)+"%":"—"),"pp","每日填报口径加权","preTotal","conversion"),
      reviewCard("客服净销售额",money(curPre.sales),curPre.sales,prevPre.sales,yoyPre?.sales,trend(periods,preTrend.map(x=>x.sales),money),"pct","去退后销售额","preTotal","sales"),
      reviewCard("有效售后起数",fmt.format(curAfter.count),curAfter.count,prevAfter.count,yoyAfter?.count,trend(periods,afterTrend.map(x=>x.count),v=>fmt.format(v)),"pct","一条有效登记计1起","afterTotal","count"),
      reviewCard("每万元售后起数",Number.isFinite(curAfter.rate)?curAfter.rate.toFixed(3):"—",curAfter.rate,prevAfter.rate,yoyAfter?.rate,trend(periods,afterTrend.map(x=>x.rate),v=>Number.isFinite(v)?v.toFixed(3):"—"),"pct","售后起数 ÷ 电商销售额 × 10,000","afterTotal","rate"),
      reviewCard("实际已打款",money(curAfter.paid),curAfter.paid,prevAfter.paid,yoyAfter?.paid,trend(periods,afterTrend.map(x=>x.paid),money),"pct","有明确打款时间的金额","afterTotal","paid")
    ].join("");
    const actions=actionRows(P,A,periods,current,previous);
    root.innerHTML=`<section class="review-head panel"><div><span class="review-eyebrow">上一自然周</span><h2>客服售前售后复盘</h2><p>${start} 至 ${end} · ${current} · 环比 ${previous} · 同比 ${yoyPre||yoyAfter?yoyPeriod:"基期不完整"}</p></div><div class="review-actions"><button data-workspace="pre">查看售前明细</button><button data-workspace="after">查看售后明细</button></div></section><section class="review-kpis">${cards}</section><section class="card review-section"><div class="section-head"><div><h2>售前转化与服务效率</h2><p class="subtitle">每项同时展示本周值、环比和近4周趋势</p></div></div>${platformTable(P,periods,current,previous)}</section><section class="card review-section"><div class="section-head"><div><h2>售后问题变化</h2><p class="subtitle">按本周售后起数降序，同时检查占比、每万元起数和连续趋势</p></div></div>${issueTable(A,periods,current,previous)}</section><section class="card review-section"><div class="section-head"><div><h2>赔偿金额变化</h2><p class="subtitle">区分登记金额与实际打款，优先查看环比异常和大额记录</p></div></div>${compensationTable(A,periods,current,previous)}</section><section class="card review-section action-card"><div class="section-head"><div><h2>本周协同改善清单</h2><p class="subtitle">将数据变化转化为可执行动作，下周按验收指标复盘</p></div></div>${table(["优先级","问题","数据证据","协同角色","本周动作","下周验收"],actions.map(x=>`<tr><td><span class="tag ${x.level==="P0"?"red":"blue"}">${x.level}</span></td><td>${safe(x.problem)}</td><td>${safe(x.evidence)}</td><td>${safe(x.team)}</td><td>${safe(x.action)}</td><td>${safe(x.check)}</td></tr>`),"1250px")}</section><div class="notice review-notice">数据截止：售前 ${P.meta.sourceMax}，售后 ${A.meta.afterSalesMax}，电商销售 ${A.meta.salesMax}。本页只选择三类数据共同完整的自然周；同比基期不完整时显示“—”，并以近4周趋势辅助判断。</div>`;
  }
  document.addEventListener("click",event=>{const target=event.target.closest("#weeklyReviewWorkspace [data-review-drill]");if(target)openReviewDrill(target);});
  window.WEEKLY_REVIEW_APP={render};
})();
