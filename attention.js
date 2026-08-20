(()=>{
'use strict';

const categories=window.REVIEW_INSIGHTS||[];
const manifest=window.REVIEW_MANIFEST;
const cache={},loads=new Map(),rawLoads=new Map();
const fallbackTopics=['性能效果','质量材质','外观设计','安装适配','品牌信任','气味环保','服务售后','物流包装','价格价值'];
const topics=manifest?.focusTopics||fallbackTopics;
const colors=['#1877f2','#18a77b','#8b5cf6','#f59e0b','#ef5b5b','#25a4c4','#d946ef','#64748b','#84cc16'];
const descriptions={
  '性能效果':'产品是否真正解决使用问题，包括排水、防臭、防水、遮盖、耐磨等。',
  '质量材质':'用料、做工、耐用性、厚实度、铜/不锈钢等材质及破损问题。',
  '外观设计':'颜色、色差、造型、款式、光泽、质感和掉色等外观体验。',
  '安装适配':'安装施工、尺寸孔位、接口配件、基层工艺及产品适配性。',
  '品牌信任':'评论明确提到品牌、大牌、旗舰店、正品、授权等信任表达。',
  '气味环保':'气味、刺鼻、异味、甲醛、净味、无味和入住安全。',
  '服务售后':'客服响应、售后处理、退换补发、赔偿和服务态度。',
  '物流包装':'发货到货、快递运输、包装保护、破包漏液和错漏发。',
  '价格价值':'价格高低、性价比、划算、优惠以及“是否值得”。'
};

const saved=(()=>{try{return JSON.parse(localStorage.getItem('vocDateRange')||'{}')}catch{return {}}})();
const valid=value=>value&&value>=manifest?.minDate&&value<=manifest?.maxDate?value:null;
const state={category:0,start:valid(saved.start)||manifest?.minDate||'',end:valid(saved.end)||manifest?.maxDate||'',metric:'rate',selected:new Set(),auto:true,activeFocus:null};
if(state.start>state.end)[state.start,state.end]=[state.end,state.start];

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=value=>Number(value||0).toLocaleString('zh-CN');
const date=value=>new Date(`${value}T00:00:00Z`);
const iso=value=>value.toISOString().slice(0,10);
const addDays=(value,days)=>{const result=typeof value==='string'?date(value):new Date(value);result.setUTCDate(result.getUTCDate()+days);return iso(result)};
const diffDays=(first,last)=>Math.round((date(last)-date(first))/86400000);
const monday=value=>{const result=date(value),day=result.getUTCDay()||7;result.setUTCDate(result.getUTCDate()-day+1);return iso(result)};
const monthStart=value=>`${value.slice(0,7)}-01`;
const addMonth=value=>{const result=date(value);result.setUTCMonth(result.getUTCMonth()+1);return iso(result)};
const currentName=()=>categories[state.category]?.name;
const inRange=row=>row.date>=state.start&&row.date<=state.end;
const currentPayload=()=>cache[currentName()];
const rangeRows=()=>currentPayload()?.reviews?.filter(inRange)||[];
const hasFocus=(row,focus)=>row.focuses?.includes(focus);
const fullRange=()=>state.start===manifest.minDate&&state.end===manifest.maxDate;
const rate=(count,total)=>total?count*100/total:0;
const pp=value=>value==null?'—':`${value>=0?'+':''}${value.toFixed(1)}pp`;

function loadCategory(name){
  if(cache[name])return Promise.resolve(cache[name]);
  if(loads.has(name))return loads.get(name);
  const promise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=`data/${manifest.categories[name]}?v=20260820-7`;
    script.onload=()=>{const payload=window.REVIEW_CATEGORY_DATA?.[name];script.remove();if(!payload)return reject(new Error(`${name}数据无效`));cache[name]=payload;delete window.REVIEW_CATEGORY_DATA[name];resolve(payload)};
    script.onerror=()=>{script.remove();reject(new Error(`${name}数据加载失败`))};document.head.appendChild(script);
  }).finally(()=>loads.delete(name));loads.set(name,promise);return promise;
}

function loadRaw(name){
  if(window.REVIEW_RAW_DATA?.[name])return Promise.resolve(window.REVIEW_RAW_DATA[name]);
  if(rawLoads.has(name))return rawLoads.get(name);
  const path=manifest.rawCategories?.[name];if(!path)return Promise.reject(new Error('原评论备查数据未生成'));
  const promise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=`data/${path}?v=20260820-7`;
    script.onload=()=>{script.remove();const rows=window.REVIEW_RAW_DATA?.[name];rows?resolve(rows):reject(new Error('原评论数据无效'))};
    script.onerror=()=>{script.remove();reject(new Error('原评论数据加载失败'))};document.head.appendChild(script);
  }).finally(()=>rawLoads.delete(name));rawLoads.set(name,promise);return promise;
}

function saveRange(){localStorage.setItem('vocDateRange',JSON.stringify({start:state.start,end:state.end}))}
function setDates(start,end){state.start=start;state.end=end;if(state.start>state.end)[state.start,state.end]=[state.end,state.start];state.auto=true;saveRange();render()}
async function selectCategory(index){state.category=index;state.auto=true;state.activeFocus=null;loading();try{await loadCategory(currentName());render()}catch(error){failure(error.message)}}

function topicStats(rows){
  const total=rows.length;
  const items=topics.map((name,index)=>{
    const matched=rows.filter(row=>hasFocus(row,name)),details=new Map(),keywords=new Map();
    matched.forEach(row=>{(row.focusDetails||[]).forEach(item=>details.set(item,(details.get(item)||0)+1));(row.keywords||[]).forEach(item=>keywords.set(item,(keywords.get(item)||0)+1))});
    return {name,index,count:matched.length,rate:rate(matched.length,total),positive:matched.filter(row=>row.positive).length,risk:matched.filter(row=>row.risk).length,details:[...details].sort((a,b)=>b[1]-a[1]).slice(0,4),keywords:[...keywords].sort((a,b)=>b[1]-a[1]).slice(0,4)};
  });
  const hits=items.reduce((sum,item)=>sum+item.count,0);items.forEach(item=>item.share=rate(item.count,hits));
  return {total,hits,coverage:rate(rows.filter(row=>row.focuses?.length).length,total),items:items.sort((a,b)=>b.count-a.count||a.index-b.index)};
}

function ensureSelection(stats){
  const available=new Set(stats.items.filter(item=>item.count).map(item=>item.name));state.selected=new Set([...state.selected].filter(name=>available.has(name)));
  if(state.auto){state.selected=new Set(stats.items.filter(item=>item.count).slice(0,5).map(item=>item.name));state.auto=false}
  if(!state.activeFocus||!available.has(state.activeFocus))state.activeFocus=stats.items.find(item=>item.count)?.name||topics[0];
}

function sidebar(stats){
  ensureSelection(stats);
  const categoryButtons=categories.map((category,index)=>`<button class="cat-button" data-category="${index}" aria-current="${index===state.category}"><span>${esc(category.name)}</span><small>›</small></button>`).join('');
  const topicChecks=stats.items.map(item=>`<label><input type="checkbox" value="${esc(item.name)}" ${state.selected.has(item.name)?'checked':''} ${item.count?'':'disabled'}><i style="--store-color:${colors[item.index%colors.length]}"></i><span>${esc(item.name)}</span><small>${item.rate.toFixed(1)}%</small></label>`).join('');
  document.getElementById('attentionSidebar').innerHTML=`<nav class="page-switch" aria-label="看板页面"><a href="dashboard-v3.html">VOC洞察</a><a href="rating-dashboard.html">店铺好评</a><a class="active" href="attention-dashboard.html">关注点</a><a href="after-sales-dashboard.html">售后分析</a></nav><div class="sidebar-label important">1. 选择品类（必选）</div><div class="category-list attention-category-list">${categoryButtons}</div><div class="sidebar-label important">2. 时间范围</div><div class="side-filter"><div class="date-range"><span><small>开始日期</small><input type="date" id="startDate" min="${manifest.minDate}" max="${manifest.maxDate}" value="${state.start}"></span><i>至</i><span><small>结束日期</small><input type="date" id="endDate" min="${manifest.minDate}" max="${manifest.maxDate}" value="${state.end}"></span></div><div class="date-presets"><button data-days="all" class="${fullRange()?'active':''}">全部</button><button data-days="28">近4周</button><button data-days="84">近12周</button><button data-days="ytd">今年</button></div></div><div class="sidebar-label important">3. 对比关注点</div><div class="store-tools"><button id="topTopics">前5关注点</button><button id="allTopics">全选</button></div><div class="category-checks focus-checks">${topicChecks}</div><div class="sidebar-download"><button id="downloadAll">↓ 下载筛选原评论</button><small>保留Excel原行号、店铺、日期和原文</small></div>`;
  document.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>selectCategory(Number(button.dataset.category)));
  document.getElementById('startDate').onchange=event=>setDates(event.target.value,state.end);document.getElementById('endDate').onchange=event=>setDates(state.start,event.target.value);
  document.querySelectorAll('.date-presets button').forEach(button=>button.onclick=()=>{const value=button.dataset.days,end=date(manifest.maxDate);if(value==='all')return setDates(manifest.minDate,manifest.maxDate);if(value==='ytd')return setDates(`${end.getUTCFullYear()}-01-01`,manifest.maxDate);setDates(addDays(manifest.maxDate,-Number(value)+1),manifest.maxDate)});
  document.querySelectorAll('.focus-checks input').forEach(input=>input.onchange=()=>{input.checked?state.selected.add(input.value):state.selected.delete(input.value);state.auto=false;render()});
  document.getElementById('topTopics').onclick=()=>{state.selected=new Set(stats.items.filter(item=>item.count).slice(0,5).map(item=>item.name));state.auto=false;render()};
  document.getElementById('allTopics').onclick=()=>{state.selected=new Set(stats.items.filter(item=>item.count).map(item=>item.name));state.auto=false;render()};document.getElementById('downloadAll').onclick=event=>downloadRaw(null,event.currentTarget);
}

function lastCompleteSunday(){const result=date(state.end),day=result.getUTCDay();if(day)result.setUTCDate(result.getUTCDate()-day);return iso(result)}
function comparison(){
  const all=currentPayload()?.reviews||[],curEnd=lastCompleteSunday(),curStart=addDays(curEnd,-27),prevEnd=addDays(curStart,-1),prevStart=addDays(prevEnd,-27),available=state.start<=prevStart;
  const cur=available?all.filter(row=>row.date>=curStart&&row.date<=curEnd):[],prev=available?all.filter(row=>row.date>=prevStart&&row.date<=prevEnd):[];
  const items=topics.map((name,index)=>{const curCount=cur.filter(row=>hasFocus(row,name)).length,prevCount=prev.filter(row=>hasFocus(row,name)).length,curRate=rate(curCount,cur.length),prevRate=rate(prevCount,prev.length);return {name,index,curCount,prevCount,curRate,prevRate,change:available?curRate-prevRate:null}});
  return {available,curStart,curEnd,prevStart,prevEnd,curTotal:cur.length,prevTotal:prev.length,items};
}

function kpis(stats,cmp){
  const top=stats.items[0],valid=cmp.items.filter(item=>cmp.curTotal>=30&&cmp.prevTotal>=30&&item.curCount+item.prevCount>=10).sort((a,b)=>b.change-a.change),rising=valid[0];
  const top3Hits=stats.items.slice(0,3).reduce((sum,item)=>sum+item.count,0),top3Share=rate(top3Hits,stats.hits);
  const cards=[['有效去重评论',fmt(stats.total),`${state.start} 至 ${state.end}`],['关注覆盖率',`${stats.coverage.toFixed(1)}%`,'至少命中1个关注大类'],['第一关注点',top?.name||'—',top?`${top.rate.toFixed(1)}% · ${fmt(top.count)}条`:'暂无数据'],['近4周上升最快',cmp.available&&rising?rising.name:'—',cmp.available&&rising?`${pp(rising.change)} · 对比前4周`:'所选范围不足8周'],['TOP3关注集中度',stats.hits?`${top3Share.toFixed(1)}%`:'—','前3大类命中数 ÷ 全部大类命中数']];
  return `<section class="attention-kpis">${cards.map((card,index)=>`<div class="card attention-kpi kpi-${index}"><span>${card[0]}</span><b>${esc(card[1])}</b><small>${card[2]}</small></div>`).join('')}</section>`;
}

function buildSeries(){
  const rows=rangeRows(),grain=diffDays(state.start,state.end)<=196?'week':'month',periods=[];
  for(let key=grain==='week'?monday(state.start):monthStart(state.start);key<=state.end;key=grain==='week'?addDays(key,7):addMonth(key)){
    const nominalEnd=grain==='week'?addDays(key,6):addDays(addMonth(key),-1),start=key<state.start?state.start:key,end=nominalEnd>state.end?state.end:nominalEnd,periodRows=rows.filter(row=>row.date>=start&&row.date<=end),hits=periodRows.reduce((sum,row)=>sum+(row.focuses?.length||0),0);
    periods.push({key,start,end,nominalEnd,rows:periodRows,sample:periodRows.length,hits,label:grain==='week'?`${Number(start.slice(5,7))}/${Number(start.slice(8,10))}–${Number(end.slice(5,7))}/${Number(end.slice(8,10))}${start!==key||end!==nominalEnd?'*':''}`:`${start.slice(0,4)}/${Number(start.slice(5,7))}${start!==key||end!==nominalEnd?'*':''}`});
  }
  const values=new Map();topics.forEach(name=>values.set(name,periods.map(period=>{const count=period.rows.filter(row=>hasFocus(row,name)).length;if(period.sample<10)return null;if(state.metric==='volume')return count;if(state.metric==='share')return rate(count,period.hits);return rate(count,period.sample)})));return {grain,periods,values};
}

function metricLabel(){return state.metric==='volume'?'提及量':state.metric==='share'?'关注构成':'提及率'}
function metricExplanation(){return state.metric==='volume'?'当期命中该关注点的去重评论数':state.metric==='share'?'该关注点命中数 ÷ 同期所有关注点命中数':'该关注点命中评论数 ÷ 同期品类去重评论数'}
function chartCard(series,stats){
  const selected=stats.items.filter(item=>state.selected.has(item.name));
  return `<section class="card attention-chart"><div class="section-head chart-title"><div><h2>消费者关注点${series.grain==='week'?'周':'月'}度趋势</h2><p>${metricExplanation()}</p><span class="axis-scope">横轴展示 ${state.start} 至 ${state.end}</span><span class="axis-scope y-axis" id="attentionYScope"></span></div><div class="metric-tabs">${[['rate','提及率'],['volume','提及量'],['share','关注构成']].map(item=>`<button data-attention-metric="${item[0]}" class="${state.metric===item[0]?'active':''}">${item[1]}</button>`).join('')}</div></div><div class="chart-legend attention-legend">${selected.map(item=>`<button data-focus="${esc(item.name)}" class="${state.activeFocus===item.name?'active':''}"><i style="--store-color:${colors[item.index%colors.length]}"></i>${esc(item.name)}<small>${item.rate.toFixed(1)}%</small></button>`).join('')||'<em>请在左侧选择关注点</em>'}</div><div class="sample-key"><span><i></i>≥30条：稳定实线</span><span><i class="dashed"></i>10–29条：低样本虚线</span><span><i class="blank"></i>&lt;10条：留空</span></div><div class="attention-canvas-wrap"><canvas id="attentionChart" role="img" aria-label="${esc(currentName())}${metricLabel()}趋势"></canvas></div><div class="chart-footnote"><b>口径提醒：</b>一条评论可同时提到多个关注点，因此各项提及率相加可能超过100%；提及率不等于满意度。</div></section>`;
}

function chartScale(series){
  const values=[];series.values.forEach((items,name)=>{if(state.selected.has(name))items.forEach(value=>{if(value!=null)values.push(value)})});if(!values.length)return {min:0,max:state.metric==='volume'?10:100,suffix:state.metric==='volume'?'':'%'};
  const rawMin=Math.min(...values),rawMax=Math.max(...values);if(state.metric==='volume'){const step=rawMax<=50?10:rawMax<=200?25:100;return {min:0,max:Math.max(step,Math.ceil(rawMax/step)*step),suffix:''}}
  let min=rawMin>=60?Math.floor((rawMin-5)/10)*10:rawMin>=30?Math.floor((rawMin-5)/10)*10:0,max=Math.min(100,Math.ceil((rawMax+5)/10)*10);if(max-min<20){min=Math.max(0,min-10);max=Math.min(100,max+10)}return {min,max:Math.max(min+10,max),suffix:'%'};
}

function drawChart(series,stats){
  const canvas=document.getElementById('attentionChart');if(!canvas)return;const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),width=rect.width,height=rect.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  const context=canvas.getContext('2d');context.scale(dpr,dpr);const css=getComputedStyle(document.documentElement),muted=css.getPropertyValue('--muted').trim(),line=css.getPropertyValue('--line').trim(),scale=chartScale(series),scope=document.getElementById('attentionYScope');if(scope)scope.textContent=`纵轴展示 ${scale.min}${scale.suffix}–${scale.max}${scale.suffix}`;
  const pad={l:55,r:18,t:18,b:58},chartWidth=width-pad.l-pad.r,chartHeight=height-pad.t-pad.b,count=Math.max(1,series.periods.length-1),toY=value=>pad.t+chartHeight*(1-(value-scale.min)/(scale.max-scale.min));context.clearRect(0,0,width,height);context.font='10px system-ui';context.textBaseline='middle';
  for(let index=0;index<=4;index++){const value=scale.min+(scale.max-scale.min)*index/4,y=toY(value);context.strokeStyle=line;context.lineWidth=1;context.setLineDash([]);context.beginPath();context.moveTo(pad.l,y);context.lineTo(width-pad.r,y);context.stroke();context.fillStyle=muted;context.textAlign='right';context.fillText(`${Number.isInteger(value)?value:value.toFixed(1)}${scale.suffix}`,pad.l-7,y)}
  const labelStep=Math.max(1,Math.ceil(series.periods.length/7));series.periods.forEach((period,index)=>{if(index%labelStep&&index!==series.periods.length-1)return;const x=pad.l+chartWidth*index/count;context.save();context.translate(x,height-pad.b+24);context.rotate(-Math.PI/9);context.fillStyle=muted;context.textAlign='center';context.fillText(period.label,0,0);context.restore()});
  stats.items.filter(item=>state.selected.has(item.name)).forEach(item=>{const values=series.values.get(item.name),color=colors[item.index%colors.length];let previous=null;values.forEach((value,index)=>{const sample=series.periods[index].sample;if(value==null){previous=null;return}const x=pad.l+chartWidth*index/count,y=toY(value);if(previous){const bend=(x-previous.x)*.42;context.strokeStyle=color;context.lineWidth=2.5;context.setLineDash(sample<30||previous.sample<30?[6,4]:[]);context.beginPath();context.moveTo(previous.x,previous.y);context.bezierCurveTo(previous.x+bend,previous.y,x-bend,y,x,y);context.stroke()}context.setLineDash([]);context.fillStyle=color;context.beginPath();context.arc(x,y,sample<30?3:3.5,0,Math.PI*2);context.fill();previous={x,y,sample}})});
}

function heatmap(series,stats){
  const periods=series.periods.slice(-12),maxByTopic=new Map(stats.items.map(item=>[item.name,Math.max(1,...periods.map(period=>rate(period.rows.filter(row=>hasFocus(row,item.name)).length,period.sample)))]));
  const rows=stats.items.filter(item=>item.count).map(item=>{const cells=periods.map(period=>{const value=rate(period.rows.filter(row=>hasFocus(row,item.name)).length,period.sample),strength=value/maxByTopic.get(item.name);return `<span style="--heat:${strength}" title="${esc(item.name)} · ${period.start}至${period.end} · ${value.toFixed(1)}%">${period.sample<10?'—':`${value.toFixed(0)}%`}</span>`}).join('');return `<button class="heat-row ${state.activeFocus===item.name?'active':''}" data-focus="${esc(item.name)}"><b>${esc(item.name)}</b>${cells}</button>`}).join('');
  return `<section class="card attention-heat"><div class="section-head"><div><h2>近${periods.length}期关注热力图</h2><p>每行颜色按该关注点自身高低展示，数字为提及率</p></div></div><div class="heat-scroll" style="--heat-weeks:${Math.max(1,periods.length)}"><div class="heat-head"><b>关注点</b>${periods.map(period=>`<span>${period.label.replace('*','')}</span>`).join('')}</div>${rows}</div></section>`;
}

function ranking(stats,cmp){
  const changes=new Map(cmp.items.map(item=>[item.name,item]));
  const rows=stats.items.map(item=>{const change=changes.get(item.name),details=item.details.length?item.details.map(detail=>detail[0]).join('、'):(item.keywords.map(keyword=>keyword[0]).join('、')||'表达较分散');return `<tr data-focus="${esc(item.name)}" class="${state.activeFocus===item.name?'active':''}"><td><i style="--store-color:${colors[item.index%colors.length]}"></i><b>${esc(item.name)}</b></td><td>${fmt(item.count)}</td><td class="good-cell">${item.rate.toFixed(1)}%</td><td>${cmp.available?`${change.curRate.toFixed(1)}%`:'—'}</td><td>${cmp.available?`${change.prevRate.toFixed(1)}%`:'—'}</td><td class="${change?.change==null?'':change.change>=0?'positive-change':'negative-change'}">${cmp.available?pp(change.change):'—'}</td><td class="detail-cell">${esc(details)}</td></tr>`}).join('');
  return `<section class="card attention-table-card"><div class="section-head"><div><h2>关注点排名与近4周变化</h2><p>点击关注点查看细分主题和原评论</p></div><span>${cmp.available?`${cmp.curStart} 至 ${cmp.curEnd}`:'所选范围不足8周'}</span></div><div class="table-scroll"><table class="rating-table attention-table focus-table"><thead><tr><th>关注大类</th><th>提及量</th><th>提及率</th><th>近4周</th><th>前4周</th><th>变化</th><th>品类细分焦点</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function evidence(stats,rows){
  const item=stats.items.find(entry=>entry.name===state.activeFocus)||stats.items[0];if(!item)return '';const matched=rows.filter(row=>hasFocus(row,item.name)),positiveRate=rate(item.positive,item.count),riskRate=rate(item.risk,item.count),ordered=matched.slice().sort((a,b)=>(Number(b.helpful||0)-Number(a.helpful||0))||(Number(b.risk)-Number(a.risk))||b.text.length-a.text.length).slice(0,6);
  const detailTags=item.details.length?item.details.map(detail=>`<span>${esc(detail[0])}<small>${fmt(detail[1])}条</small></span>`).join(''):'<em>当前品类的细分表达较分散</em>',reviews=ordered.map((row,index)=>`<article><span>${index+1}</span><div><p>“${esc(row.text)}”</p><small>${esc(row.shop)} · ${row.date}${row.focusDetails?.length?` · ${esc(row.focusDetails.join('、'))}`:''}</small></div></article>`).join('')||'<p class="empty-evidence">当前范围没有匹配原评论</p>';
  return `<section class="card focus-evidence"><div class="section-head"><div><h2>${esc(item.name)}为什么被关注</h2><p>${esc(descriptions[item.name]||'')}</p></div><button id="downloadFocus">↓ 下载该关注点原评论</button></div><div class="focus-summary"><div><span>提及率</span><b>${item.rate.toFixed(1)}%</b><small>${fmt(item.count)}条去重评论</small></div><div><span>正向表达</span><b class="positive-change">${positiveRate.toFixed(1)}%</b><small>仅作文本倾向辅助判断</small></div><div><span>风险表达</span><b class="negative-change">${riskRate.toFixed(1)}%</b><small>命中明确负向词</small></div><div class="focus-detail-tags"><span>品类细分焦点</span><div>${detailTags}</div></div></div><div class="focus-review-list">${reviews}</div></section>`;
}

function taxonomy(){return `<section class="card attention-method taxonomy-card"><b>分类口径</b><div>${topics.map((name,index)=>`<span><i style="--store-color:${colors[index%colors.length]}"></i><strong>${esc(name)}</strong><small>${esc(descriptions[name]||'')}</small></span>`).join('')}</div><p>每月新数据继续使用同一级大类识别，确保趋势可比；品类细分焦点保留各品类的产品语境。“品牌信任”只统计评论中明确出现的品牌、正品、旗舰店等表达。</p></section>`}

function bindDetailEvents(){
  document.querySelectorAll('[data-attention-metric]').forEach(button=>button.onclick=()=>{state.metric=button.dataset.attentionMetric;render()});document.querySelectorAll('[data-focus]').forEach(element=>element.onclick=()=>{state.activeFocus=element.dataset.focus;render()});document.querySelectorAll('.focus-table tbody tr').forEach(row=>row.onclick=()=>{state.activeFocus=row.dataset.focus;render()});const download=document.getElementById('downloadFocus');if(download)download.onclick=event=>downloadRaw(state.activeFocus,event.currentTarget);
}

function render(){
  const rows=rangeRows(),stats=topicStats(rows);ensureSelection(stats);sidebar(stats);const series=buildSeries(),cmp=comparison();
  document.getElementById('attentionDetail').innerHTML=`<section class="card attention-hero"><div><span>${esc(currentName())} · 消费者关注内容</span><h1>消费者关注点趋势</h1><p>${state.start} 至 ${state.end} · ${series.grain==='week'?'按周':'按月'}展示</p></div><div><b>当前口径</b><strong>多标签提及率</strong><small>分析消费者关注什么，不表示满意度</small></div></section>${kpis(stats,cmp)}${chartCard(series,stats)}<div class="attention-lower">${heatmap(series,stats)}${evidence(stats,rows)}</div>${ranking(stats,cmp)}${taxonomy()}`;bindDetailEvents();requestAnimationFrame(()=>drawChart(series,stats));
}

function csvCell(value){const text=String(value??'');return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text}
async function downloadRaw(focus,button){
  const original=button.textContent;button.disabled=true;button.textContent='正在准备原评论…';
  try{const rows=(await loadRaw(currentName())).filter(inRange).filter(row=>!focus||row.focuses?.includes(focus)),header=['Excel原行号','品类','日期','店铺','评价类型','有用数','关注大类','品类细分焦点','关键词','原评论'],lines=[header,...rows.map(row=>[row.sourceRow,currentName(),row.date,row.shop,row.rating,row.helpful,(row.focuses||[]).join('|'),(row.focusDetails||[]).join('|'),(row.keywords||[]).join('|'),row.text])].map(line=>line.map(csvCell).join(',')),blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${currentName()}_${state.start}_${state.end}${focus?`_${focus}`:''}_原评论.csv`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}catch(error){alert(error.message)}finally{button.disabled=false;button.textContent=original}
}

function loading(){document.getElementById('attentionDetail').innerHTML=`<section class="card load-state" role="status"><div class="loader"></div><h2>正在加载${esc(currentName())}关注点数据</h2><p>正在汇总评论大类和品类细分焦点。</p></section>`}
function failure(message){document.getElementById('attentionDetail').innerHTML=`<section class="card load-state error-state"><div class="error-icon">!</div><h2>关注点数据加载失败</h2><p>${esc(message)}。页面不会把加载失败显示为零值。</p><button class="retry-button" onclick="location.reload()">重新加载</button></section>`}

async function start(){
  try{if(window.__VOC_MANIFEST_ERROR__||!manifest?.categories)throw new Error('数据清单加载失败');loading();await loadCategory(currentName());render()}catch(error){failure(error.message)}
  document.getElementById('themeBtn').onclick=()=>{const dark=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=dark?'light':'dark';document.getElementById('themeBtn').textContent=dark?'深色模式':'浅色模式';render()};
  addEventListener('resize',()=>{const rows=rangeRows();if(rows.length)requestAnimationFrame(()=>drawChart(buildSeries(),topicStats(rows)))},{passive:true});
}
start();
})();
