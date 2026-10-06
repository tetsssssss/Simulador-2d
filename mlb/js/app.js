
(() => {
const D=window.MLB_DATA, api='https://statsapi.mlb.com/api/v1';
const content=document.querySelector('#content'),title=document.querySelector('#title'),subtitle=document.querySelector('#subtitle');
const modal=document.querySelector('#modal'),mc=document.querySelector('#modalContent');const cache={rosters:{},people:{},drafts:{},prospects:null};
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
const rnd=(s,a,b)=>a+(hash(String(s))%(b-a+1));const teamBy=a=>D.teams.find(t=>t.abbr===a);const teamId=id=>D.teams.find(t=>t.id===Number(id));
const photo=id=>`https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_90/v1/people/${id}/headshot/67/current`;
const fallback=name=>`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="100%" height="100%" fill="#17364a"/><text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="48" font-family="Arial">${String(name||'?').split(' ').map(x=>x[0]).join('').slice(0,2)}</text></svg>`)}`;
const pos=p=>p?.position?.abbreviation||p?.primaryPosition?.abbreviation||'—';
function fixedRatings(p){
 let po=pos(p),id=p.person?.id||p.id||p.personId||hash(p.fullName||'player');
 return D.fixedAttrs.map((n,i)=>{
   let v=rnd(`${id}|${n}`,38,92);
   const pitch=po==='P'||po==='TWP';
   if(pitch&&['Fastball Quality','Breaking Ball Quality','Offspeed Quality','Pitch Command','Pitch Control','Pitch Movement','Pitch Velocity','Pitch Stamina','Hold Runners','Pickoff','Pitching Clutch'].includes(n))v+=7;
   if(!pitch&&['Contact vs R','Contact vs L','Power vs R','Power vs L','Plate Vision','Plate Discipline','Bat Speed','Timing'].includes(n))v+=5;
   if(['C','1B','2B','3B','SS','LF','CF','RF'].includes(po)&&['Fielding','Range','Hands','Reaction','Arm Accuracy'].includes(n))v+=4;
   if(po==='C'&&['Catcher Blocking','Catcher Framing','Pitch Calling'].includes(n))v+=12;
   if(['CF','SS','2B'].includes(po)&&['Running Speed','Acceleration','Range'].includes(n))v+=5;
   return {name:n,value:Math.max(0,Math.min(99,v))};
 });
}
function adaptiveRatings(p,seed='day0'){
 const id=p.person?.id||p.id||p.personId||hash(p.fullName||'player');
 return D.adaptiveAttrs.map(n=>({name:n,value:rnd(`${id}|${seed}|${n}`,25,98)}));
}
const avg=a=>Math.round(a.reduce((s,x)=>s+x.value,0)/a.length);
async function fetchJSON(url){const r=await fetch(url);if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}
async function roster(team){
 if(cache.rosters[team.id])return cache.rosters[team.id];
 const j=await fetchJSON(`${api}/teams/${team.id}/roster?rosterType=active&season=2026&hydrate=person`);
 cache.rosters[team.id]=(j.roster||[]).map(x=>({...x,teamAbbr:team.abbr,teamId:team.id}));return cache.rosters[team.id];
}
async function person(id){
 if(cache.people[id])return cache.people[id];
 const j=await fetchJSON(`${api}/people/${id}`);cache.people[id]=j.people?.[0]||{};return cache.people[id];
}
async function draft(year){
 if(cache.drafts[year])return cache.drafts[year];
 const j=await fetchJSON(`${api}/draft/${year}`);const rounds=j.drafts?.rounds||[];cache.drafts[year]=rounds.flatMap(r=>(r.picks||[]).map(p=>({...p,round:r.round})));return cache.drafts[year];
}
async function prospects(){
 if(cache.prospects)return cache.prospects;
 let j;try{j=await fetchJSON(`${api}/draft/prospects?limit=250`)}catch(e){j=await fetchJSON(`${api}/draft/2026?limit=250`)}
 let arr=j.prospects||j.drafts?.rounds?.flatMap(r=>r.picks||[])||[];
 cache.prospects=arr;return arr;
}
function card(p){
 const id=p.person?.id||p.id, nm=p.person?.fullName||p.fullName||'Atleta', po=pos(p), f=fixedRatings(p);
 return `<div class="card player" data-player="${id}" data-team="${p.teamId||''}"><img src="${photo(id)}" onerror="this.src='${fallback(nm)}'"><div><h3>${nm}</h3><p>${po} · #${p.jerseyNumber||'—'}</p><p>${p.status?.description||''}</p></div><div class="ovr">${avg(f)}</div></div>`;
}
function bindPlayers(scope=document){scope.querySelectorAll('[data-player]').forEach(el=>el.addEventListener('click',async()=>{const id=el.dataset.player;let p={id,fullName:'Atleta',primaryPosition:{abbreviation:'—'}};try{p=await person(id)}catch{};showPlayer(p,el.dataset.team)}))}
function showPlayer(p,teamid){
 const nm=p.fullName||p.person?.fullName||'Atleta',id=p.id||p.person?.id,fx=fixedRatings(p),ad=adaptiveRatings(p,'initial');
 modal.classList.remove('hidden');mc.innerHTML=`<div class="profile"><img src="${photo(id)}" onerror="this.src='${fallback(nm)}'"><div><h2>${nm}</h2><p>${p.primaryPosition?.name||pos(p)} · ${p.batSide?.description||'—'} / ${p.pitchHand?.description||'—'}</p><div class="pills"><span>OVR ${avg(fx)}</span><span>40 FIXOS</span><span>30 ADAPTATIVOS</span></div></div></div>
 <h3 class="attrtitle">40 atributos fixos</h3><div class="attrs">${fx.map(a=>`<div class="attr"><span>${a.name}</span><b>${a.value}</b><meter min="0" max="100" value="${a.value}"></meter></div>`).join('')}</div>
 <div class="card adaptive" style="margin-top:20px"><h3 class="adapt-title">30 atributos momentâneos / adaptativos</h3><button id="rerollAdaptive">Atualizar contexto do dia</button><div id="adaptArea" class="attrs" style="margin-top:10px">${ad.map(a=>`<div class="attr"><span>${a.name}</span><b>${a.value}</b><meter min="0" max="100" value="${a.value}"></meter></div>`).join('')}</div></div>
 <div class="notice" style="margin-top:15px">Os 40 ratings fixos e os 30 ratings adaptativos são um sistema próprio do simulador, não ratings oficiais da MLB.</div>`;
 let day=1;document.querySelector('#rerollAdaptive').onclick=()=>{const n=adaptiveRatings(p,'day'+day++);document.querySelector('#adaptArea').innerHTML=n.map(a=>`<div class="attr"><span>${a.name}</span><b>${a.value}</b><meter min="0" max="100" value="${a.value}"></meter></div>`).join('')};
}
function home(){
 title.textContent='MLB Universe 2D';subtitle.textContent='Base de franquia e simulação para a MLB.';
 content.innerHTML=`<div class="grid stats"><div class="stat"><b>30</b><span>franquias</span></div><div class="stat"><b>40</b><span>atributos fixos</span></div><div class="stat"><b>30</b><span>atributos adaptativos</span></div><div class="stat"><b>0–100</b><span>escala</span></div></div>
 <h2 class="section">Estrutura desta Alpha</h2><div class="notice">Elencos 2026, fotos, franquias, estádios, prospectos, Draft, histórico da World Series, rivalidades e protótipo Diamond 2D. Dados de roster/draft são carregados da MLB StatsAPI quando há conexão.</div>
 <h2 class="section">World Series recentes</h2><div class="grid teamgrid">${D.worldSeries.slice(-8).reverse().map(x=>`<div class="card"><b>${x.year}</b><p>${x.champion}</p><span class="muted">vs. ${x.runnerUp}</span></div>`).join('')}</div>`;
}
function teamsView(){
 title.textContent='Franquias';subtitle.textContent='30 organizações da Major League Baseball.';
 content.innerHTML=`<div class="grid teamgrid">${D.teams.map(t=>`<div class="card team" data-team="${t.id}"><img src="${t.logo}"><div><h3>${t.name}</h3><p>${t.league} ${t.division}</p><p>${t.stadium}</p></div></div>`).join('')}</div>`;
 content.querySelectorAll('[data-team]').forEach(x=>x.onclick=()=>{const t=teamId(x.dataset.team);document.querySelector('#nav [data-view="rosters"]').click();setTimeout(()=>{const s=document.querySelector('#teamSelect');if(s){s.value=t.id;s.dispatchEvent(new Event('change'))}},0)});
}
async function rostersView(){
 title.textContent='Elencos MLB';subtitle.textContent='Active roster 2026 com fotos e fichas.';
 content.innerHTML=`<div class="toolbar"><select id="teamSelect">${D.teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select><input id="search" placeholder="Buscar jogador"></div><div id="area" class="notice">Carregando...</div>`;
 const sel=document.querySelector('#teamSelect'),search=document.querySelector('#search'),area=document.querySelector('#area');
 async function load(){area.className='notice';area.textContent='Carregando elenco...';try{const r=await roster(teamId(sel.value));render(r)}catch(e){area.className='notice error';area.textContent='Não foi possível carregar: '+e.message}}
 function render(r){const q=search.value.toLowerCase();const rr=r.filter(p=>(p.person?.fullName||'').toLowerCase().includes(q));area.className='grid roster';area.innerHTML=rr.map(card).join('');bindPlayers(area)}
 sel.onchange=load;search.oninput=async()=>{try{render(await roster(teamId(sel.value)))}catch{}};load();
}
function prospectName(p){return p.person?.fullName||p.fullName||p.person?.name||'Prospect'}
async function prospectsView(){
 title.textContent='Prospectos';subtitle.textContent='Banco de prospects ligado à estrutura do Draft.';
 content.innerHTML=`<div class="notice" id="prosArea">Carregando prospectos...</div>`;
 const a=document.querySelector('#prosArea');try{const r=await prospects();a.className='grid draftgrid';a.innerHTML=r.slice(0,150).map((p,i)=>{const id=p.person?.id||p.playerId||p.bisPlayerId||hash(prospectName(p));const nm=prospectName(p);return `<div class="card pick"><div class="rank">${p.rank||i+1}</div><div><b>${nm}</b><p class="muted">${p.position?.abbreviation||p.position?.name||'—'} · ${p.school?.name||'—'}</p></div><img src="${p.headshotLink||photo(id)}" onerror="this.src='${fallback(nm)}'"></div>`}).join('')||'<div class="notice">Nenhum prospect retornado.</div>'}catch(e){a.className='notice error';a.textContent='Falha ao carregar prospects: '+e.message}
}
async function draftView(){
 title.textContent='MLB Draft';subtitle.textContent='Resultados reais por ano e base para o futuro Draft Simulator.';
 content.innerHTML=`<div class="toolbar"><input id="draftYear" type="number" min="1965" max="2026" value="2026"><button id="loadDraft">Carregar Draft</button></div><div id="draftArea" class="notice">Clique em carregar.</div>`;
 const a=document.querySelector('#draftArea');
 async function load(){const y=document.querySelector('#draftYear').value;a.className='notice';a.textContent='Carregando Draft '+y+'...';try{const r=await draft(y);a.className='tablewrap';a.innerHTML=`<table><thead><tr><th>Pick</th><th>Round</th><th>Time</th><th>Jogador</th><th>Pos.</th><th>Escola</th><th>Rank</th></tr></thead><tbody>${r.map(p=>`<tr><td>#${p.pickNumber||'—'}</td><td>${p.pickRound||p.round||'—'}</td><td>${p.team?.name||'—'}</td><td>${p.person?.fullName||'—'}</td><td>${p.position?.abbreviation||'—'}</td><td>${p.school?.name||'—'}</td><td>${p.rank||'—'}</td></tr>`).join('')}</tbody></table>`}catch(e){a.className='notice error';a.textContent='Falha ao carregar draft: '+e.message}}
 document.querySelector('#loadDraft').onclick=load;load();
}
function stadiumsView(){
 title.textContent='Estádios';subtitle.textContent='Os 30 ballparks da MLB em 2026.';
 content.innerHTML=`<div class="tablewrap"><table><thead><tr><th>Franquia</th><th>Estádio</th><th>Cidade</th><th>Liga</th><th>Divisão</th></tr></thead><tbody>${D.teams.map(t=>`<tr><td><img class="logo" src="${t.logo}">${t.name}</td><td>${t.stadium}</td><td>${t.city}</td><td>${t.league}</td><td>${t.division}</td></tr>`).join('')}</tbody></table></div>`;
}
function rivalriesView(){
 title.textContent='Rivalidades';subtitle.textContent='Rivalry Score inicial, pronto para mudar na carreira.';
 content.innerHTML=`<div class="grid teamgrid">${[...D.rivalries].sort((a,b)=>b.score-a.score).map(r=>{const a=teamBy(r.a),b=teamBy(r.b);return `<div class="card"><div class="rival"><div class="logos"><img src="${a.logo}"><strong>${r.name}</strong><img src="${b.logo}"></div><b>${r.score}</b></div><div class="bar"><i style="width:${r.score}%"></i></div></div>`}).join('')}</div>`;
}
function historyView(){
 title.textContent='Histórico da World Series';subtitle.textContent='Campeões e vice-campeões desde 1903.';
 content.innerHTML=`<div class="tablewrap"><table><thead><tr><th>Ano</th><th>Campeão</th><th>Vice</th></tr></thead><tbody>${[...D.worldSeries].reverse().map(x=>`<tr><td>${x.year}</td><td>${x.champion}</td><td>${x.runnerUp}</td></tr>`).join('')}</tbody></table></div>`;
}
function diamondView(){
 title.textContent='Diamond 2D';subtitle.textContent='Protótipo de posicionamento para o futuro motor de partida.';
 content.innerHTML=`<div class="diamondbox"><canvas id="field" width="1000" height="625"></canvas><div class="controls"><button id="pitch">Arremessar</button><button id="hit">Rebater</button><button id="reset">Reset</button></div></div><div class="notice" style="margin-top:12px">Protótipo visual: bola, pitcher, catcher, infield e outfield. O próximo salto é física de pitch, contato e fielding.</div>`;
 const c=document.querySelector('#field'),x=c.getContext('2d');let ball={x:500,y:408,vx:0,vy:0,active:false},mode='idle';
 const defenders=[[500,390],[500,300],[420,300],[580,300],[500,210],[300,150],[500,110],[700,150],[500,470]];
 function draw(){x.clearRect(0,0,c.width,c.height);x.fillStyle='#287b44';x.fillRect(0,0,c.width,c.height);x.fillStyle='#c99d62';x.beginPath();x.moveTo(500,510);x.lineTo(280,300);x.lineTo(500,90);x.lineTo(720,300);x.closePath();x.fill();x.fillStyle='#fff';[[500,500],[610,390],[500,280],[390,390]].forEach(([a,b])=>x.fillRect(a-10,b-10,20,20));defenders.forEach((p,i)=>{x.fillStyle=i===8?'#a71f2b':'#173f79';x.beginPath();x.arc(p[0],p[1],13,0,Math.PI*2);x.fill()});if(ball.active){ball.x+=ball.vx;ball.y+=ball.vy;ball.vx*=.995;ball.vy*=.995;if(ball.x<10||ball.x>990||ball.y<10||ball.y>615)ball.active=false}x.fillStyle='#fff';x.beginPath();x.arc(ball.x,ball.y,7,0,Math.PI*2);x.fill();requestAnimationFrame(draw)}draw();
 document.querySelector('#pitch').onclick=()=>{ball={x:500,y:300,vx:0,vy:5.5,active:true};mode='pitch'};
 document.querySelector('#hit').onclick=()=>{ball={x:500,y:470,vx:(Math.random()-.5)*7,vy:-7-Math.random()*5,active:true};mode='hit'};
 document.querySelector('#reset').onclick=()=>{ball={x:500,y:408,vx:0,vy:0,active:false}};
}
const views={home,teams:teamsView,rosters:rostersView,prospects:prospectsView,draft:draftView,stadiums:stadiumsView,rivalries:rivalriesView,history:historyView,diamond:diamondView};
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#nav button').forEach(q=>q.classList.remove('active'));b.classList.add('active');views[b.dataset.view]()});
document.querySelector('#close').onclick=()=>modal.classList.add('hidden');modal.onclick=e=>{if(e.target===modal)modal.classList.add('hidden')};
document.querySelector('#sync').onclick=async()=>{const s=document.querySelector('#status');let n=0;s.textContent='Sincronizando...';for(const t of D.teams){try{await roster(t);n++;s.textContent=`${n}/30 rosters`;}catch{}}s.textContent=`${n}/30 rosters em cache`};
home();
})();
