
(() => {
const D=window.NHL_DATA, content=document.querySelector('#content'), title=document.querySelector('#viewTitle'), subtitle=document.querySelector('#viewSubtitle');
const modal=document.querySelector('#modal'), modalContent=document.querySelector('#modalContent');
const cache={rosters:{},prospects:{}};
const api='https://api-web.nhle.com/v1';
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
const rnd=(seed,min,max)=>min+(hash(seed)%(max-min+1));
const nameOf=o=>typeof o==='string'?o:(o?.default||o?.fr||'');
const teamBy=a=>D.teams.find(t=>t.abbr===a);
const age=b=>{if(!b)return null;const d=new Date(b+'T00:00:00Z'),n=new Date();let x=n.getUTCFullYear()-d.getUTCFullYear();if(n.getUTCMonth()<d.getUTCMonth()||(n.getUTCMonth()===d.getUTCMonth()&&n.getUTCDate()<d.getUTCDate()))x--;return x};
const overall=(p,attrs)=>Math.round(attrs.reduce((a,b)=>a+b.value,0)/attrs.length);
function makeAttrs(p){
 const goalie=p.positionCode==='G';
 const names=goalie?D.attrsGoalie:D.attrsSkater;
 const pos=p.positionCode||'C', a=age(p.birthDate)||24;
 const base=pos==='G'?66:pos==='D'?65:67;
 return names.map((n,i)=>{
   let v=rnd(`${p.id}-${n}`,46,91);
   if(!goalie){
     if(['Velocidade','Aceleração','Agilidade'].includes(n)&&a<25)v+=3;
     if(['Defensive Awareness','Shot Block','Positioning','Gap Control'].includes(n)&&pos==='D')v+=7;
     if(n==='Faceoffs'&&pos==='C')v+=8;
     if(['Wrist Power','Wrist Accuracy','Offensive Awareness'].includes(n)&&(pos==='L'||pos==='R'||pos==='C'))v+=3;
   }else{
     if(['Reflexos','Lateral Movement','Agility'].includes(n)&&a<27)v+=3;
     if(['Positioning','Composure','Consistency'].includes(n)&&a>29)v+=4;
   }
   return {name:n,value:Math.max(0,Math.min(99,v))};
 });
}
function logo(a){return teamBy(a)?.logo||`https://assets.nhle.com/logos/nhl/svg/${a}_dark.svg`}
function placeholder(name){return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="100%" height="100%" fill="#173148"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="52" font-family="Arial">${(name||'?').split(' ').map(x=>x[0]).join('').slice(0,2)}</text></svg>`)}`}
function playerName(p){return `${nameOf(p.firstName)} ${nameOf(p.lastName)}`.trim()}
async function getRoster(abbr){
 if(cache.rosters[abbr])return cache.rosters[abbr];
 let r=await fetch(`${api}/roster/${abbr}/current`);
 if(!r.ok)r=await fetch(`${api}/roster/${abbr}/20262027`);
 if(!r.ok)throw new Error(`Roster ${abbr}: HTTP ${r.status}`);
 const j=await r.json();
 const all=[...(j.forwards||[]),...(j.defensemen||[]),...(j.goalies||[])].map(p=>({...p,teamAbbr:abbr}));
 cache.rosters[abbr]=all;return all;
}
async function getProspects(abbr){
 if(cache.prospects[abbr])return cache.prospects[abbr];
 const r=await fetch(`${api}/prospects/${abbr}`); if(!r.ok)throw new Error(`Prospects ${abbr}: HTTP ${r.status}`);
 const j=await r.json();
 const arr=Array.isArray(j)?j:(j.prospects||j.players||[]);
 cache.prospects[abbr]=arr.map(p=>({...p,teamAbbr:abbr}));return cache.prospects[abbr];
}
function home(){
 title.textContent='NHL Universe 2D';subtitle.textContent='Base estrutural 2026–27, com dados oficiais carregados sob demanda.';
 const recent=D.champions.slice(-8).reverse();
 content.innerHTML=`<div class="grid stats">
  <div class="stat"><b>32</b><span>franquias NHL</span></div><div class="stat"><b>35</b><span>atributos por atleta</span></div>
  <div class="stat"><b>0–100</b><span>escala de avaliação</span></div><div class="stat"><b>2</b><span>perfis: skater / goalie</span></div>
 </div><h2 class="section-title">Campeões recentes</h2><div class="grid teams">${recent.map(c=>`<div class="card"><b>${c.year}</b><p>${c.champion}</p></div>`).join('')}</div>
 <h2 class="section-title">Estrutura</h2><div class="notice">Elencos, fotos e prospectos são carregados da API pública da NHL. Logos usam os assets da NHL. Os 35 ratings são próprios deste simulador, determinísticos e não representam ratings oficiais.</div>`;
}
function teamsView(){
 title.textContent='Franquias';subtitle.textContent='32 clubes, conferências, divisões, logos e arenas.';
 content.innerHTML=`<div class="grid teams">${D.teams.map(t=>`<div class="card team-card" data-team="${t.abbr}"><img src="${t.logo}" alt=""><div><h3>${t.name}</h3><p>${t.division} · ${t.conference}</p><p>${t.arena}</p></div></div>`).join('')}</div>`;
 content.querySelectorAll('[data-team]').forEach(el=>el.addEventListener('click',()=>showTeam(el.dataset.team)));
}
async function showTeam(abbr){
 const t=teamBy(abbr);modal.classList.remove('hidden');modalContent.innerHTML=`<div class="profile-head"><img src="${t.logo}"><div><h2>${t.name}</h2><p>${t.division} · ${t.conference}</p><p>${t.arena}</p></div></div><p>Carregando elenco...</p>`;
 try{const r=await getRoster(abbr);modalContent.innerHTML+=`<h3>${r.length} atletas no roster atual</h3><div class="roster-grid">${r.slice(0,12).map(playerCard).join('')}</div>`;bindPlayers(modalContent)}
 catch(e){modalContent.innerHTML+=`<div class="notice error">${e.message}. Use um navegador com internet e, se necessário, abra via servidor local.</div>`}
}
function playerCard(p){
 const nm=playerName(p),attrs=makeAttrs(p),ov=overall(p,attrs);
 const img=p.headshot||placeholder(nm);
 return `<div class="card player" data-pid="${p.id}" data-team="${p.teamAbbr}"><img src="${img}" onerror="this.src='${placeholder(nm)}'"><div><h3>${nm}</h3><p>#${p.sweaterNumber??'—'} · ${p.positionCode||'—'} · ${p.shootsCatches||'—'}</p><p>${age(p.birthDate)??'—'} anos · ${p.birthCountry||'—'}</p></div><div class="rating">${ov}</div></div>`;
}
function bindPlayers(scope=document){
 scope.querySelectorAll('[data-pid]').forEach(el=>el.addEventListener('click',async e=>{
   e.stopPropagation(); const r=await getRoster(el.dataset.team),p=r.find(x=>String(x.id)===String(el.dataset.pid));showPlayer(p);
 }));
}
function showPlayer(p){
 const nm=playerName(p),attrs=makeAttrs(p),ov=overall(p,attrs), t=teamBy(p.teamAbbr);
 modal.classList.remove('hidden');
 modalContent.innerHTML=`<div class="profile-head"><img src="${p.headshot||placeholder(nm)}" onerror="this.src='${placeholder(nm)}'"><div><h2>${nm}</h2><p>${t?.name||p.teamAbbr} · #${p.sweaterNumber??'—'} · ${p.positionCode||'—'}</p><p>${p.heightInCentimeters||'—'} cm · ${p.weightInKilograms||'—'} kg · ${p.birthCountry||'—'}</p><p><span class="badge">OVR ${ov}</span><span class="badge">${p.shootsCatches||'—'}</span></p></div></div>
 <h3>35 atributos (${p.positionCode==='G'?'goleiro':'skater'})</h3><div class="attr-grid">${attrs.map(a=>`<div class="attr"><span>${a.name}</span><b>${a.value}</b><meter min="0" max="100" value="${a.value}"></meter></div>`).join('')}</div>
 <div class="notice" style="margin-top:18px">Ratings gerados pelo motor próprio do simulador. Dados biográficos e fotografia vêm da base NHL quando disponíveis.</div>`;
}
async function rosterView(){
 title.textContent='Elencos NHL';subtitle.textContent='Roster atual, fotos e 35 atributos.';
 content.innerHTML=`<div class="toolbar"><select id="teamSelect">${D.teams.map(t=>`<option value="${t.abbr}">${t.name}</option>`).join('')}</select><input id="playerSearch" placeholder="Buscar atleta"></div><div id="rosterArea" class="notice">Selecione uma franquia para carregar.</div>`;
 const sel=document.querySelector('#teamSelect'), area=document.querySelector('#rosterArea'), search=document.querySelector('#playerSearch');
 async function load(){
  area.className='notice';area.textContent='Carregando roster atual...';
  try{let r=await getRoster(sel.value);render(r)}catch(e){area.className='notice error';area.textContent=e.message}
 }
 function render(r){const q=search.value.toLowerCase();r=r.filter(p=>playerName(p).toLowerCase().includes(q));area.className='roster-grid';area.innerHTML=r.map(playerCard).join('');bindPlayers(area)}
 sel.addEventListener('change',load);search.addEventListener('input',async()=>{try{render(await getRoster(sel.value))}catch{}});
 load();
}
function prospectCard(p){
 const nm=playerName(p)||nameOf(p.name)||p.fullName||'Prospect';
 const pos=p.positionCode||p.position||'—';
 const img=p.headshot||p.mugShot||p.photo||placeholder(nm);
 const id=p.id||p.playerId||p.prospectId||hash(nm);
 const mock={...p,id,firstName:p.firstName||{default:nm.split(' ')[0]},lastName:p.lastName||{default:nm.split(' ').slice(1).join(' ')},positionCode:pos,teamAbbr:p.teamAbbr,headshot:img};
 const ov=overall(mock,makeAttrs(mock));
 return `<div class="card player"><img src="${img}" onerror="this.src='${placeholder(nm)}'"><div><h3>${nm}</h3><p>${pos} · ${p.birthCountry||p.country||'—'}</p><p>${p.currentTeam?.default||p.amateurTeam?.default||p.teamName?.default||''}</p></div><div class="rating">${ov}</div></div>`;
}
async function prospectsView(){
 title.textContent='Prospectos';subtitle.textContent='Pipeline de cada franquia via endpoint de prospects da NHL.';
 content.innerHTML=`<div class="toolbar"><select id="teamSelect">${D.teams.map(t=>`<option value="${t.abbr}">${t.name}</option>`).join('')}</select></div><div id="prospectArea" class="notice">Carregando prospectos...</div>`;
 const sel=document.querySelector('#teamSelect'),area=document.querySelector('#prospectArea');
 async function load(){area.className='notice';area.textContent='Carregando prospectos...';try{const r=await getProspects(sel.value);area.className='roster-grid';area.innerHTML=r.length?r.map(prospectCard).join(''):'<div class="notice">Nenhum prospecto retornado.</div>'}catch(e){area.className='notice error';area.textContent=e.message}}
 sel.addEventListener('change',load);load();
}
function arenasView(){
 title.textContent='Arenas';subtitle.textContent='Casa das 32 franquias.';
 content.innerHTML=`<div class="tablewrap"><table><thead><tr><th>Franquia</th><th>Arena</th><th>Cidade</th><th>Divisão</th></tr></thead><tbody>${D.teams.map(t=>`<tr><td><img class="arena-logo" src="${t.logo}">${t.name}</td><td>${t.arena}</td><td>${t.city}</td><td>${t.division}</td></tr>`).join('')}</tbody></table></div>`;
}
function rivalriesView(){
 title.textContent='Rivalidades';subtitle.textContent='Rivalry Score inicial, pronto para evoluir dinamicamente na carreira.';
 content.innerHTML=`<div class="grid teams">${D.rivalries.sort((a,b)=>b.score-a.score).map(r=>{const a=teamBy(r.a),b=teamBy(r.b);return `<div class="card"><div class="rival"><div class="rival-teams"><img src="${a.logo}"><strong>${a.name}<br>vs<br>${b.name}</strong><img src="${b.logo}"></div><b>${r.score}</b></div><p>${r.label}</p><div class="scorebar"><i style="width:${r.score}%"></i></div></div>`}).join('')}</div>`;
}
function historyView(){
 title.textContent='Histórico da Stanley Cup';subtitle.textContent='Campeões da era em que a Stanley Cup passou a ser exclusivamente da NHL.';
 content.innerHTML=`<div class="tablewrap"><table><thead><tr><th>Ano</th><th>Campeão</th></tr></thead><tbody>${[...D.champions].reverse().map(c=>`<tr><td>${c.year}</td><td>${c.champion}</td></tr>`).join('')}</tbody></table></div>`;
}
function rinkView(){
 title.textContent='Rink 2D';subtitle.textContent='Protótipo visual do motor de movimentação para a próxima etapa.';
 content.innerHTML=`<div class="rink-wrap"><canvas id="rink" width="1000" height="500"></canvas><div class="rink-controls"><button id="play">Play</button><button id="pause">Pause</button><button id="reset">Reset</button></div></div><div class="notice" style="margin-top:12px">Este módulo já anima jogadores, puck e perseguição. Ainda não é o motor completo de jogo.</div>`;
 const c=document.querySelector('#rink'),x=c.getContext('2d');let running=true,raf,players=[],puck={x:500,y:250,vx:2.2,vy:1.1};
 function reset(){players=[];for(let t=0;t<2;t++)for(let i=0;i<6;i++)players.push({team:t,x:t?680+rnd('b'+i,0,120):200+rnd('a'+i,0,120),y:70+i*65,vx:0,vy:0});puck={x:500,y:250,vx:2.2,vy:1.1}}
 function draw(){
  x.clearRect(0,0,c.width,c.height);x.fillStyle='#eaf7ff';x.fillRect(0,0,c.width,c.height);
  x.strokeStyle='#dd334d';x.lineWidth=4;x.beginPath();x.moveTo(500,0);x.lineTo(500,500);x.stroke();
  x.strokeStyle='#2877c7';[300,700].forEach(xx=>{x.beginPath();x.moveTo(xx,0);x.lineTo(xx,500);x.stroke()});
  x.strokeStyle='#cc3045';x.lineWidth=3;[[500,250],[180,250],[820,250]].forEach(([cx,cy])=>{x.beginPath();x.arc(cx,cy,58,0,Math.PI*2);x.stroke()});
  if(running){puck.x+=puck.vx;puck.y+=puck.vy;if(puck.x<35||puck.x>965)puck.vx*=-1;if(puck.y<25||puck.y>475)puck.vy*=-1}
  players.forEach((p,i)=>{if(running){const chase=i%3===0;const tx=chase?puck.x:(p.team?690:310)+(i%3)*14,ty=80+(i%6)*65;const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy)||1;p.vx=p.vx*.88+dx/d*.35;p.vy=p.vy*.88+dy/d*.35;p.x+=p.vx;p.y+=p.vy}x.fillStyle=p.team?'#d52a45':'#2369bd';x.beginPath();x.arc(p.x,p.y,14,0,Math.PI*2);x.fill();x.fillStyle='#fff';x.font='10px Arial';x.textAlign='center';x.fillText(i%6===5?'G':String((i%6)+1),p.x,p.y+3)});
  x.fillStyle='#111';x.beginPath();x.arc(puck.x,puck.y,7,0,Math.PI*2);x.fill();raf=requestAnimationFrame(draw)
 }
 reset();draw();document.querySelector('#play').onclick=()=>running=true;document.querySelector('#pause').onclick=()=>running=false;document.querySelector('#reset').onclick=reset;
}
const views={home,teams:teamsView,roster:rosterView,prospects:prospectsView,arenas:arenasView,rivalries:rivalriesView,history:historyView,rink:rinkView};
document.querySelectorAll('#nav button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');views[b.dataset.view]()}));
document.querySelector('#closeModal').onclick=()=>modal.classList.add('hidden');modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});
document.querySelector('#syncAll').onclick=async()=>{
 const s=document.querySelector('#syncStatus');let ok=0;s.textContent='Sincronizando...';
 for(const t of D.teams){try{await getRoster(t.abbr);ok++;s.textContent=`${ok}/32 elencos carregados`}catch(e){}}
 s.textContent=`${ok}/32 elencos em cache da sessão`;
};
home();
})();
