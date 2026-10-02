/* FEEDBACK+ EDU · Juego "Ruta de Sintonía" (GitHub Pages) */
(function(){
  const LV_ICON=['🌱','🌿','🌳','⭐','🏆'];
  const LV_DEF=['Inicial','En proceso','Adecuado','Destacado','Excelente'];
  const ST_ICON=['🎯','📚','🧠','✍️','🤝','⏱️','💡','🔍','🎨','🚀','🧩','🌍'];
  const PH={
    match:['Miraste tu trabajo con los mismos ojos de tu docente.','Reconocer tu nivel real es una habilidad de expertos.','Conoces bien tu proceso: tu mirada y la evidencia coinciden.'],
    closeUp:['Te diste un poquito más. Tu docente vio algo concreto por mejorar: es una pista, no un castigo.','Muy cerca. La diferencia de un paso te muestra dónde afinar.'],
    closeDown:['Te diste un poquito menos. ¡Tu trabajo fue mejor de lo que creías!','Muy cerca, y a tu favor: confía más en lo que haces.'],
    over:['Tu docente valoró la evidencia del trabajo, no el cariño que le tenemos a lo que hacemos. Esa diferencia es tu mapa para crecer.','Que algo sea nuestro no lo hace perfecto. Tu docente miró con objetividad para ayudarte a avanzar.','Esforzarse mucho es valioso; mirar el resultado con objetividad te hace crecer.'],
    under:['Tu docente vio en tu trabajo evidencias que tú no notaste. Vales más de lo que crees.','Te diste menos de lo que mereces. La evidencia dice que lo hiciste mejor.']
  };
  const BIG={match:'¡Sintonía total! 🎉',closeUp:'¡Muy cerca! 👣',closeDown:'¡Muy cerca, y a tu favor! 👣',over:'Miradas distintas 🧩',under:'¡Vales más! 🚀'};
  const G={};
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const reduced=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $=id=>document.getElementById(id);

  function rubricFor(name){
    const r=(state.boot&&state.boot.rubric)||[];
    const n=String(name||'').trim().toLowerCase();
    return r.find(c=>String(c.criterio||'').trim().toLowerCase()===n)||null;
  }
  function levelInfo(item,n){
    const l=(item.levels||[]).find(x=>Number(x.nivel)===n)||{};
    return {n:n,ic:LV_ICON[n-1]||'•',lb:l.etiqueta||LV_DEF[n-1]||('Nivel '+n),desc:l.descriptor||''};
  }
  function say(t){if(G.audio&&t){try{speakText(t)}catch(e){}}}
  function tones(seq){
    try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=state.audioCtx||(state.audioCtx=new C());
      seq.forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+i*.12;o.type='triangle';o.frequency.value=f;
        g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.27)});
    }catch(e){}
  }

  /* ---------------- Apertura ---------------- */
  window.openFeedbackGame=function(idx){
    const f=(state.studentItems||[])[idx];
    if(!f){toast('No se encontró el feedback.');return}
    const crit=(f.criterios||[]).filter(c=>Number(c.nivel)>=1&&Number(c.nivel)<=5);
    if(!crit.length){toast('Este feedback no tiene criterios para jugar.');return}
    Object.assign(G,{f:f,i:0,pts:0,streak:0,best:0,sel:0,audio:true,curLen:0,results:[],
      items:crit.map((c,k)=>{const r=rubricFor(c.criterio);return {name:c.criterio,teacher:Number(c.nivel),
        desc:r?r.descripcion:'',levels:r?r.levels:[],icon:ST_ICON[k%ST_ICON.length]}})});
    G.lastFocus=document.activeElement;
    const el=document.createElement('div');
    el.className='fbg';el.id='fbg';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','fbgHudTitle');
    el.innerHTML=`<div class="fbg-hud">
        <h2 id="fbgHudTitle">🧭 Ruta de sintonía</h2>
        <span class="fbg-pill" id="fbgStep" aria-label="Progreso">🚩 0/${G.items.length}</span>
        <span class="fbg-pill pts" id="fbgPts" aria-label="Puntos de sintonía">✨ 0</span>
        <span class="fbg-pill streak" id="fbgStreak" aria-label="Racha de coincidencias">🔥 0</span>
        <button class="fbg-icon-btn" id="fbgAudio" aria-pressed="true" aria-label="Voz activada. Pulsa para silenciar">🔊</button>
        <button class="fbg-icon-btn" id="fbgClose" aria-label="Salir del juego">✕</button>
      </div>
      <div class="fbg-stage" aria-hidden="true">
        <div class="fbg-cloud" style="top:8%">☁️</div><div class="fbg-cloud">☁️</div><div class="fbg-cloud">☁️</div>
        ${mapSvg()}
      </div>
      <section class="fbg-sheet" id="fbgSheet" aria-live="polite"><div class="fbg-inner" id="fbgInner"></div></section>`;
    document.body.appendChild(el);document.body.style.overflow='hidden';
    $('fbgClose').onclick=closeGame;
    $('fbgAudio').onclick=function(){G.audio=!G.audio;this.textContent=G.audio?'🔊':'🔇';this.setAttribute('aria-pressed',String(G.audio));
      this.setAttribute('aria-label',G.audio?'Voz activada. Pulsa para silenciar':'Voz silenciada. Pulsa para activar');if(!G.audio)try{speechSynthesis.cancel()}catch(e){}};
    el.addEventListener('keydown',onKey);
    layoutMap();renderIntro();
  };

  function closeGame(){
    if(G.i<G.items.length&&G.results.length&&!confirm('¿Salir del juego? Perderás tu avance en la ruta.'))return;
    try{speechSynthesis.cancel()}catch(e){}
    const el=$('fbg');if(el)el.remove();document.body.style.overflow='';
    if(G.lastFocus&&G.lastFocus.focus)G.lastFocus.focus();
  }
  function onKey(e){
    if(e.key==='Escape'){e.preventDefault();closeGame();return}
    if(e.key==='Tab'){ // mantener el foco dentro del juego
      const f=[...$('fbg').querySelectorAll('button:not([disabled]),textarea')];if(!f.length)return;
      if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus()}
      else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus()}
    }
    if($('fbgLevels')&&/^[1-5]$/.test(e.key)&&document.activeElement.tagName!=='TEXTAREA'){choose(Number(e.key))}
  }

  /* ---------------- Mapa ---------------- */
  const D='M40,250 C150,250 150,150 260,150 S380,250 500,240 S620,90 740,100 S900,230 960,190';
  function mapSvg(){
    const deco=[[90,190,'🌳'],[200,240,'🌼'],[330,110,'🌲'],[420,190,'🏡'],[560,280,'🌷'],[610,170,'🌳'],[690,40,'⛰️'],[820,60,'⛰️'],[850,260,'🌲'],[960,120,'🌳'],[30,150,'🌲']];
    return `<svg class="fbg-map" viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid meet">
      ${deco.map(d=>`<text class="fbg-deco" x="${d[0]}" y="${d[1]}">${d[2]}</text>`).join('')}
      <path class="fbg-trail-bg" d="${D}"/><path class="fbg-trail" d="${D}"/>
      <path id="fbgProg" class="fbg-prog" d="${D}"/>
      <g id="fbgStations"></g>
      <text class="fbg-deco" id="fbgGoal" style="font-size:40px">🏁</text>
      <g id="fbgAvatar"></g></svg>`;
  }
  function layoutMap(){
    const p=$('fbgProg');G.L=p.getTotalLength();p.style.transition='none';p.style.strokeDasharray=G.L;p.style.strokeDashoffset=G.L;p.getBoundingClientRect();p.style.transition='';
    const n=G.items.length;G.stLen=G.items.map((_,k)=>G.L*(k+1)/(n+1));
    $('fbgStations').innerHTML=G.items.map((it,k)=>{const pt=p.getPointAtLength(G.stLen[k]);
      return `<g class="fbg-st" id="fbgSt${k}" transform="translate(${pt.x},${pt.y})"><circle r="22"/><text>${it.icon}</text></g>`}).join('');
    const end=p.getPointAtLength(G.L);const goal=$('fbgGoal');goal.setAttribute('x',end.x);goal.setAttribute('y',end.y-26);
    const av=G.f.gifUrl&&/^data:image\//.test(G.f.gifUrl)
      ?`<circle r="32"/><clipPath id="fbgClip"><circle r="28"/></clipPath><image href="${G.f.gifUrl}" x="-28" y="-28" width="56" height="56" clip-path="url(#fbgClip)" preserveAspectRatio="xMidYMid slice"/>`
      :`<circle r="32"/><text>🎓</text>`;
    $('fbgAvatar').innerHTML=av;placeAvatar(0,0);
  }
  function placeAvatar(len,hop){const pt=$('fbgProg').getPointAtLength(len);$('fbgAvatar').setAttribute('transform',`translate(${pt.x},${pt.y-38-hop})`)}
  function walkTo(len,done){
    const from=G.curLen,dur=reduced()?0:1100,t0=performance.now();
    $('fbgProg').style.strokeDashoffset=G.L-len;
    if(!dur){G.curLen=len;placeAvatar(len,0);done&&done();return}
    (function step(t){const k=Math.min(1,(t-t0)/dur),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2,l=from+(len-from)*e;
      placeAvatar(l,Math.abs(Math.sin(k*Math.PI*4))*14);
      if(k<1)requestAnimationFrame(step);else{G.curLen=len;done&&done()}})(t0);
  }
  function hud(){$('fbgStep').textContent=`🚩 ${Math.min(G.i+1,G.items.length)}/${G.items.length}`;$('fbgPts').textContent='✨ '+G.pts;$('fbgStreak').textContent='🔥 '+G.streak}
  function setInner(html){const box=$('fbgInner');box.innerHTML=html;$('fbgSheet').scrollTop=0;const h=box.querySelector('h1,h2,h3');if(h){h.setAttribute('tabindex','-1');h.focus({preventScroll:true})}}

  /* ---------------- Pantallas ---------------- */
  function renderIntro(){
    const n=G.items.length;
    setInner(`<p class="fbg-kicker">${esc(G.f.asignacion||'Tu actividad')}</p>
      <h2 class="fbg-title">Hoy tú eres el docente</h2>
      <p class="fbg-lead">Recorre ${n} estaciones. En cada una, valora tu propio trabajo como lo haría tu docente. Luego descubrirás qué vio tu docente en la evidencia.</p>
      <div class="fbg-quote">Tu docente no califica cuánto quieres tu trabajo, sino lo que muestra. Por eso su mirada es una guía para mejorar, nunca un castigo.</div>
      <p class="fbg-lead">Ganas puntos de sintonía cuando tu mirada coincide con la de tu docente. Sé honesto: eso es lo que más suma.</p>
      <div class="fbg-actions"><button class="fbg-btn go" id="fbgStart">Empezar la ruta 🚶</button></div>`);
    say('Hoy tú eres el docente. Recorre '+n+' estaciones. En cada una, valora tu propio trabajo como lo haría tu docente. Tu docente no califica cuánto quieres tu trabajo, sino lo que muestra.');
    $('fbgStart').onclick=()=>{tones([523,659,784]);goStation()};
  }

  function goStation(){
    hud();G.sel=0;
    document.querySelectorAll('.fbg-st').forEach(s=>s.classList.remove('current'));
    const st=$('fbgSt'+G.i);if(st)st.classList.add('current');
    setInner(`<p class="fbg-kicker">Caminando a la estación ${G.i+1}…</p>`);
    walkTo(G.stLen[G.i],renderAsk);
  }

  function renderAsk(){
    const it=G.items[G.i];
    setInner(`<p class="fbg-kicker">Estación ${G.i+1} de ${G.items.length} ${it.icon}</p>
      <h2 class="fbg-title">${esc(it.name)}</h2>
      ${it.desc?`<p class="fbg-lead">${esc(it.desc)}</p>`:''}
      <p class="fbg-q" id="fbgQ">Si fueras tu docente, ¿qué nivel le darías a tu trabajo?</p>
      <div class="fbg-levels" id="fbgLevels" role="group" aria-labelledby="fbgQ">
        ${[1,2,3,4,5].map(n=>{const l=levelInfo(it,n);return `<button class="fbg-lv" data-n="${n}" aria-pressed="false" aria-label="Nivel ${n}, ${esc(l.lb)}"><span class="ic" aria-hidden="true">${l.ic}</span><span class="n">${n}</span><span class="lb">${esc(l.lb)}</span></button>`}).join('')}
      </div>
      <div class="fbg-desc" id="fbgDesc">Toca un nivel para leer qué significa. Puedes usar las teclas 1 a 5.</div>
      <div class="fbg-actions"><button class="fbg-btn go" id="fbgConfirm" disabled>Esta es mi valoración</button></div>`);
    $('fbgLevels').querySelectorAll('.fbg-lv').forEach(b=>b.onclick=()=>choose(Number(b.dataset.n)));
    $('fbgConfirm').onclick=reveal;
    say('Estación '+(G.i+1)+'. '+it.name+'. Si fueras tu docente, ¿qué nivel le darías a tu trabajo?');
  }

  function choose(n){
    if(!$('fbgLevels'))return;
    const it=G.items[G.i],l=levelInfo(it,n);G.sel=n;
    $('fbgLevels').querySelectorAll('.fbg-lv').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.n)===n)));
    $('fbgDesc').innerHTML=`<strong>${l.ic} Nivel ${n} · ${esc(l.lb)}</strong><br>${esc(l.desc||'Sin descripción para este nivel.')}`;
    $('fbgConfirm').disabled=false;tones([392+n*60]);
    say('Nivel '+n+', '+l.lb+'. '+(l.desc||''));
  }

  function reveal(){
    const it=G.items[G.i],me=levelInfo(it,G.sel),tc=levelInfo(it,it.teacher),diff=G.sel-it.teacher;
    const kind=diff===0?'match':diff===1?'closeUp':diff===-1?'closeDown':diff>0?'over':'under';
    const cls=kind.indexOf('close')===0?'close':kind;
    const gain=diff===0?100:Math.abs(diff)===1?50:10;
    G.pts+=gain;G.streak=diff===0?G.streak+1:0;G.best=Math.max(G.best,G.streak);
    G.results.push({name:it.name,me:G.sel,teacher:it.teacher,kind:cls});
    const next=it.teacher<5?levelInfo(it,it.teacher+1):null;
    const phrase=pick(PH[kind]);
    setInner(`<p class="fbg-kicker">Estación ${G.i+1} · ${esc(it.name)}</p>
      <h2 class="fbg-title">Dos miradas, un mismo trabajo</h2>
      <div class="fbg-duel" id="fbgDuel">
        <div class="fbg-card"><div class="fbg-card-in"><div class="fbg-face"><span class="who">Tu mirada</span><span class="ic">${me.ic}</span><span class="n">${me.n}</span><span class="lb">${esc(me.lb)}</span></div></div></div>
        <div class="fbg-vs" aria-hidden="true">VS</div>
        <div class="fbg-card" id="fbgTeacherCard"><div class="fbg-card-in">
          <div class="fbg-face mystery"><span class="who">Tu docente</span><span class="ic">❓</span><span class="lb">Revelando…</span></div>
          <div class="fbg-face back"><span class="who">Tu docente</span><span class="ic">${tc.ic}</span><span class="n">${tc.n}</span><span class="lb">${esc(tc.lb)}</span></div>
        </div></div>
      </div>
      <div id="fbgAfter"></div>`);
    tones([330,330,330]);
    setTimeout(()=>{
      $('fbgTeacherCard').classList.add('flip');
      setTimeout(()=>{
        const st=$('fbgSt'+G.i);if(st){st.classList.remove('current');st.classList.add(cls)}
        hud();effect(cls);
        $('fbgAfter').innerHTML=`<div class="fbg-verdict ${cls}"><span class="fbg-big">${BIG[kind]}</span>${esc(phrase)} <span style="white-space:nowrap">+${gain} ✨</span></div>
          <div class="fbg-evidence">
            <div><strong>👀 Lo que tu docente vio en tu trabajo</strong>${esc(tc.desc||tc.lb)}</div>
            ${next?`<div><strong>🪜 Para subir a ${next.ic} ${esc(next.lb)}</strong>${esc(next.desc||'Sigue fortaleciendo este criterio.')}</div>`:`<div><strong>🏆 Nivel máximo</strong>Mantén este estándar y comparte tu forma de trabajar.</div>`}
          </div>
          <div class="fbg-actions"><button class="fbg-btn go" id="fbgNext">${G.i+1<G.items.length?'Seguir el camino 🚶':'Llegar a la meta 🏁'}</button></div>`;
        const nb=$('fbgNext');nb.onclick=()=>{G.i++;G.i<G.items.length?goStation():renderFinal()};nb.focus({preventScroll:true});
        announce(BIG[kind]+'. Tu docente dio nivel '+tc.n+', '+tc.lb+'.');
        say(BIG[kind].replace(/[^\p{L}\p{N}\s,.!¡¿?]/gu,'')+'. Tu docente dio nivel '+tc.n+', '+tc.lb+'. '+phrase+' Lo que tu docente vio: '+(tc.desc||'')+(next?' Para subir de nivel: '+(next.desc||''):''));
      },reduced()?0:800);
    },reduced()?0:1100);
  }

  /* ---------------- Efectos ---------------- */
  function fxLayer(){const d=document.createElement('div');d.className='fbg-fx';document.body.appendChild(d);setTimeout(()=>d.remove(),4600);return d}
  function effect(kind){
    if(kind==='match'){tones([523,659,784,1047]);if(reduced())return;confetti();
      const d=fxLayer();const cols=['🎈','🎈','🎈','🎉','🎈','⭐','🎈'];
      cols.forEach((c,k)=>{const b=document.createElement('span');b.className='fbg-balloon';b.textContent=c;b.style.left=(8+k*13+Math.random()*5)+'%';b.style.animationDelay=(k*.15)+'s';
        b.style.filter='hue-rotate('+(k*50)+'deg)';d.appendChild(b)});
    }else if(kind==='close'){tones([523,659]);if(reduced())return;stars(['✨','👣','✨']);
    }else if(kind==='over'){tones([311,277]);if(reduced())return;
      const duel=$('fbgDuel');duel.classList.add('fbg-shake');
      ['l','r'].forEach(s=>{const p=document.createElement('span');p.className='fbg-puzzle '+s;p.textContent='🧩';document.body.appendChild(p);setTimeout(()=>p.remove(),1500)});
    }else if(kind==='under'){tones([392,523,659,880]);if(reduced())return;
      const r=document.createElement('span');r.className='fbg-rocket';r.textContent='🚀';document.body.appendChild(r);setTimeout(()=>r.remove(),2300);stars(['🌟','💪','🌟','✨']);
    }
  }
  function stars(list){const d=fxLayer();list.forEach((s,k)=>{const e=document.createElement('span');e.className='fbg-float';e.textContent=s;
    e.style.left=(30+k*12)+'%';e.style.top=(45+Math.random()*10)+'%';e.style.animationDelay=(k*.12)+'s';d.appendChild(e)})}
  function confetti(){
    const c=document.createElement('canvas');c.className='fbg-fx';c.width=innerWidth;c.height=innerHeight;document.body.appendChild(c);
    const x=c.getContext('2d'),cols=['#FFD24D','#5B5BD6','#FF7A8A','#4CC9A0','#7BC4FF','#FFA94D'];
    const P=Array.from({length:140},()=>({x:Math.random()*c.width,y:-20-Math.random()*c.height*.4,w:6+Math.random()*8,h:8+Math.random()*10,
      vy:2+Math.random()*3.5,vx:-1.5+Math.random()*3,r:Math.random()*6,vr:-.2+Math.random()*.4,c:cols[Math.floor(Math.random()*cols.length)]}));
    const t0=performance.now();
    (function f(t){x.clearRect(0,0,c.width,c.height);P.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.fillStyle=p.c;x.fillRect(-p.w/2,-p.h/2,p.w,p.h);x.restore()});
      if(t-t0<3200)requestAnimationFrame(f);else c.remove()})(t0);
  }

  /* ---------------- Meta ---------------- */
  function renderFinal(){
    document.querySelectorAll('.fbg-st').forEach(s=>s.classList.remove('current'));
    walkTo(G.L,()=>{});
    const n=G.results.length,m=G.results.filter(r=>r.kind==='match').length,close=G.results.filter(r=>r.kind==='close').length;
    const pct=Math.round(((m+close*.5)/n)*100);
    const over=G.results.filter(r=>r.me>r.teacher).length,under=G.results.filter(r=>r.me<r.teacher).length;
    const badge=pct>=80?['🦉','Ojo de experto','Tu mirada está muy alineada con la evidencia. Sabes reconocer tu nivel real.']
      :pct>=55?['🧭','Brújula afinada','Vas muy bien leyendo tu propio trabajo. Unos ajustes más y serás experto.']
      :['🔭','Explorador en entrenamiento','Cada diferencia te enseñó algo. Mirar tu trabajo con objetividad se entrena, y ya empezaste.'];
    const tendency=over>under&&over>=2?'Tiendes a darte un poco más de lo que muestra la evidencia. Pregúntate: ¿qué se ve en mi trabajo, no solo cuánto me esforcé?'
      :under>over&&under>=2?'Tiendes a darte menos de lo que mereces. ¡Confía más en ti! La evidencia muestra que lo haces mejor de lo que crees.'
      :'Tu mirada está equilibrada: no te sobrevaloras ni te subvaloras.';
    const f=G.f,id=f.feedbackId;
    setInner(`<p class="fbg-kicker">🏁 Meta alcanzada</p>
      <h2 class="fbg-title">Tu mapa de sintonía</h2>
      <div class="fbg-badge"><span class="medal" aria-hidden="true">${badge[0]}</span><div><h3>${badge[1]} · ${pct}% de sintonía</h3><p>${badge[2]}</p><p><strong>✨ ${G.pts} puntos · 🔥 mejor racha ${G.best}</strong></p></div></div>
      <p class="fbg-lead">${esc(tendency)}</p>
      <div class="fbg-summary" role="table" aria-label="Comparación por criterio">
        <div class="fbg-row" role="row" style="opacity:1;animation:none;background:none"><span class="c" role="columnheader">Criterio</span><span class="v" role="columnheader"><small>Tú</small></span><span class="v" role="columnheader"><small>Docente</small></span><span role="columnheader"></span></div>
        ${G.results.map((r,k)=>`<div class="fbg-row" role="row" style="animation-delay:${k*.08}s"><span class="c" role="cell">${esc(r.name)}</span>
          <span class="v" role="cell" aria-label="Tú: nivel ${r.me}">${LV_ICON[r.me-1]}<small>${r.me}</small></span>
          <span class="v" role="cell" aria-label="Docente: nivel ${r.teacher}">${LV_ICON[r.teacher-1]}<small>${r.teacher}</small></span>
          <span role="cell" aria-hidden="true">${r.kind==='match'?'🎯':r.kind==='close'?'👣':r.kind==='under'?'🚀':'🧩'}</span></div>`).join('')}
      </div>
      <div class="fbg-grade">${f.gifUrl?`<img src="${f.gifUrl}" alt="${esc(f.gifAlt||'ALGA')}">`:''}
        <div><div class="num" id="fbgNum">0.0</div><div>de 5.0 · ${Number(f.total)||0} / 50 puntos</div><div><strong>${esc(f.nivelVisual||'')}</strong></div></div></div>
      ${f.reto?`<div class="fbg-quote">🎯 Próximo reto: ${esc(f.reto)}</div>`:''}
      ${f.docente?`<div class="fbg-evidence"><div><strong>💬 Mensaje de tu docente</strong>${esc(f.docente)}</div></div>`:''}
      <h3 style="margin-top:22px">Tu aporte para tu docente</h3>
      <p class="fbg-lead">Cuéntale qué aprendiste de este recorrido. Puedes escribir o dictar.</p>
      <div class="fbg-form">
        ${[['gc_','¿Qué comprendí?'],['gm_','¿Qué voy a intentar mejorar?'],['ga_','¿Necesito ayuda en algo?']].map(q=>`<label for="${q[0]+id}">${q[1]}</label>
          <textarea id="${q[0]+id}"></textarea>
          <button type="button" class="fbg-mic mic-btn" aria-pressed="false" aria-controls="${q[0]+id}" aria-label="Dictar respuesta: ${q[1]}" onclick="toggleDictation('${q[0]+id}',this)">🎙 Dictar</button>`).join('')}
      </div>
      <div class="fbg-actions"><button class="fbg-btn go" id="fbgSend">Enviar mi aporte al docente 📨</button><button class="fbg-btn" id="fbgAgain">Jugar de nuevo</button><button class="fbg-btn" id="fbgExit">Ver mi feedback completo</button></div>`);
    $('fbgSend').onclick=send;$('fbgExit').onclick=()=>{G.i=G.items.length;closeGame()};
    $('fbgAgain').onclick=()=>{const idx=(state.studentItems||[]).indexOf(G.f);G.i=G.items.length;closeGame();openFeedbackGame(idx)};
    countUp(Number(f.nota)||0);if(pct>=55){tones([523,659,784,1047,1319]);if(!reduced())confetti()}
    say('Meta alcanzada. Insignia: '+badge[1]+', con '+pct+' por ciento de sintonía. '+badge[2]+' '+tendency+' Tu resultado es '+(Number(f.nota)||0).toFixed(1)+' sobre 5.');
  }
  function countUp(target){const el=$('fbgNum');if(reduced()){el.textContent=target.toFixed(1);return}const t0=performance.now();
    (function s(t){const k=Math.min(1,(t-t0)/1400);el.textContent=(target*(1-Math.pow(1-k,3))).toFixed(1);if(k<1)requestAnimationFrame(s)})(t0)}

  function send(){
    const id=G.f.feedbackId,o=state.dictOrigin||{};
    const val=p=>{const e=$(p+id);return e?e.value.trim():''};
    const data={feedbackId:id,comprendi:val('gc_'),mejorar:val('gm_'),ayuda:val('ga_')};
    if(!data.comprendi&&!data.mejorar&&!data.ayuda){toast('Escribe o dicta al menos una respuesta.');return}
    const used=['gc_','gm_','ga_'].map(p=>o[p+id]).filter(Boolean);
    data.origen=used.length?(used.includes('MIXTO')?'MIXTO':'VOZ'):'TECLADO';
    const btn=$('fbgSend');btn.disabled=true;btn.textContent='Enviando…';
    google.script.run.withSuccessHandler(()=>{
      tones([523,659,784,1047]);if(!reduced())confetti();
      setInner(`<h2 class="fbg-title">📨 ¡Aporte enviado!</h2>
        <p class="fbg-lead">Tu docente ya puede leer tu reflexión. Escuchar la retroalimentación y responderla es lo que hacen quienes mejoran de verdad.</p>
        <div class="fbg-actions"><button class="fbg-btn go" id="fbgDone">Volver a mi feedback</button></div>`);
      say('Aporte enviado. Tu docente ya puede leer tu reflexión.');
      $('fbgDone').onclick=()=>{G.i=G.items.length;closeGame();if(typeof loadStudentFeedbacks==='function')loadStudentFeedbacks()};
    }).withFailureHandler(e=>{btn.disabled=false;btn.textContent='Enviar mi aporte al docente 📨';fail(e)})
      .submitStudentResponse(state.studentToken,data);
  }
})();
