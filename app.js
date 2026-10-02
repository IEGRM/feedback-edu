let state={boot:null,teacherToken:'',studentToken:'',home:null,rubric:{},currentFeedback:null,feedbackOrigin:'TECLADO',recognition:null,preview:null,activities:[],teacherFeedbacks:[],studentCodes:[]};

document.addEventListener('DOMContentLoaded',()=>{
  google.script.run.withSuccessHandler(x=>{state.boot=x;applyBranding(x.branding||{});renderRubric(x.rubric)}).apiBootstrap();
  document.getElementById('contrastBtn').onclick=()=>document.body.classList.toggle('high-contrast');
  const params=new URLSearchParams(window.location.search);
  const qr=params.get('token');
  if(qr){google.script.run.withSuccessHandler(r=>{state.studentToken=r.token;showView('studentApp');loadStudentFeedbacks()}).withFailureHandler(fail).loginStudentByQr(qr)}
});

function applyBranding(b){
  const root=document.documentElement;
  if(b.primary)root.style.setProperty('--brand',b.primary); if(b.secondary)root.style.setProperty('--brand2',b.secondary);
  if(b.accent)root.style.setProperty('--accent',b.accent); if(b.success)root.style.setProperty('--success',b.success); if(b.background)root.style.setProperty('--bg',b.background);
  const logo=document.getElementById('brandLogo'); if(b.showLogo && b.logoUrl){logo.src=b.logoUrl;logo.classList.remove('hidden')}
  const brand=document.getElementById('brandName'); if(b.institutionShortName)brand.textContent=(state.boot?.appName||'FEEDBACK+ EDU')+' · '+b.institutionShortName;
  const title=document.getElementById('welcomeTitle'); if(title && b.welcome)title.textContent=b.welcome;
}

function showView(id){['landing','teacherLogin','teacherRegister','studentLogin','teacherApp','studentApp'].forEach(x=>document.getElementById(x).classList.add('hidden'));document.getElementById(id).classList.remove('hidden')}
/* ===== Indicador "Procesando…" para TODAS las llamadas al servidor =====
   Una sola función envuelve google.script.run: el botón que se pulsó queda
   deshabilitado con "⏳ Procesando…", arriba aparece una barra de carga y se
   anuncia a lectores de pantalla. No hay que tocar cada botón. */
(function(){
 const run0=google.script.run;let lastBtn=null,lastAt=0,pending=0;
 document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button');if(b&&!b.classList.contains('mic-btn')){lastBtn=b;lastAt=Date.now()}},true);
 function setBusy(btn,on){
  if(!btn)return;
  let n=(+btn.dataset.busyCount||0)+(on?1:-1);if(n<0)n=0;btn.dataset.busyCount=String(n);
  if(on&&n===1){btn.dataset.busyHtml=btn.innerHTML;btn.disabled=true;btn.setAttribute('aria-busy','true');btn.classList.add('is-busy');btn.innerHTML='<span class="spinner" aria-hidden="true"></span> Procesando…';announce('Procesando, espera un momento.')}
  if(!on&&n===0&&btn.dataset.busyHtml!==undefined){btn.innerHTML=btn.dataset.busyHtml;delete btn.dataset.busyHtml;btn.disabled=false;btn.removeAttribute('aria-busy');btn.classList.remove('is-busy')}
 }
 function wrap(runner,ok,err){
  return new Proxy({},{get(_,prop){
   if(prop==='withSuccessHandler')return f=>wrap(runner,f,err);
   if(prop==='withFailureHandler')return f=>wrap(runner,ok,f);
   if(prop==='withUserObject')return o=>wrap(runner.withUserObject(o),ok,err);
   if(typeof runner[prop]!=='function')return runner[prop];
   return (...args)=>{
    const btn=(lastBtn&&Date.now()-lastAt<1500)?lastBtn:null;lastBtn=null;
    setBusy(btn,true);pending++;document.body.classList.add('app-busy');
    const end=()=>{setBusy(btn,false);pending=Math.max(0,pending-1);if(!pending)document.body.classList.remove('app-busy')};
    return runner
     .withSuccessHandler((r,u)=>{end();if(ok)ok(r,u)})
     .withFailureHandler((e,u)=>{end();if(err)err(e,u);else fail(e)})[prop](...args);
   };
  }});
 }
 try{google.script.run=wrap(run0,null,null)}catch(e){}
})();
function announce(msg){let el=document.getElementById('srLive');if(!el){el=document.createElement('div');el.id='srLive';el.className='sr-only';el.setAttribute('role','status');el.setAttribute('aria-live','assertive');document.body.appendChild(el)}el.textContent='';setTimeout(()=>{el.textContent=msg},60)}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',4500)}
function fail(e){
 const msg=(e&&e.message)?e.message:String(e);
 toast(msg);
 if(/Sesión vencida/i.test(msg)){
   state.teacherToken='';
   state.studentToken='';
   setTimeout(()=>showView('landing'),700);
 }
}
function showTeacherPanel(id){
  document.querySelectorAll('.tpanel').forEach(x=>x.classList.add('hidden'));
  const panel=document.getElementById(id);
  if(panel) panel.classList.remove('hidden');

  refreshTeacher(()=>{
    loadTeacherGroups(gs=>{
      if(id==='groupsPanel'){
        renderTeacherGroupsList(gs);
        renderStudentCodesGroupSelect(gs);
        loadActivities(v('activityGroup'));
        const cg=document.getElementById('studentCodesGroup');
        if(cg && !cg.value && cg.options.length>1) cg.selectedIndex=1;
        loadGroupStudentCodes();
      }
      if(id==='evaluationPanel') prepareEvaluationPanel();
      if(id==='feedbacksPanel'){
        renderFeedbackFilterGroups(gs);
        loadTeacherFeedbacks();
      }
    });
  });
}

function teacherRegister(){
 const btn=document.getElementById('registerTeacherBtn');
 const status=document.getElementById('registerStatus');
 const data={nombre:v('rName'),email:v('rEmail'),documento:v('rDocumento'),institucion:{nombre:v('rInst'),tipo:v('rInstType'),municipio:v('rMunicipio')}};
 if(!data.nombre){showRegisterError('Escribe tu nombre completo.');return}
 if(!data.email){showRegisterError('Escribe tu correo.');return}
 if(!/^\d{6,20}$/.test((data.documento||'').replace(/\D/g,''))){showRegisterError('Ingresa un documento válido de al menos 6 dígitos.');return}
 if(!data.institucion.nombre){showRegisterError('Escribe el nombre de la institución.');return}
 btn.disabled=true; btn.textContent='Registrando…';
 status.classList.remove('hidden'); status.textContent='Conectando con la base de datos…';
 google.script.run
   .withSuccessHandler(()=>{
      btn.disabled=false; btn.textContent='Registrarme';
      status.textContent='Cuenta creada correctamente. Ya puedes ingresar.';
      toast('Registro creado. Ya puedes ingresar.');
      setTimeout(()=>showView('teacherLogin'),700);
   })
   .withFailureHandler(e=>{
      btn.disabled=false; btn.textContent='Registrarme';
      showRegisterError((e&&e.message)?e.message:String(e));
   })
   .registerTeacher(data);
}
function showRegisterError(msg){
 const status=document.getElementById('registerStatus');
 if(status){status.classList.remove('hidden');status.textContent='Error: '+msg}
 toast('Error: '+msg);
}
function teacherLogin(){
 google.script.run.withSuccessHandler(r=>{state.teacherToken=r.token;document.getElementById('teacherWelcome').textContent='Hola, '+r.docente.nombre;showView('teacherApp');refreshTeacher()}).withFailureHandler(fail).loginTeacher(v('tEmail'),v('tPin'));
}
function studentLogin(){google.script.run.withSuccessHandler(r=>{state.studentToken=r.token;showView('studentApp');loadStudentFeedbacks()}).withFailureHandler(fail).loginStudent(v('sDoc'),v('sCode'))}
function logoutStudent(){
 const token=state.studentToken;
 state.studentToken='';state.currentFeedback=null;
 try{speechSynthesis.cancel()}catch(e){}
 document.getElementById('studentFeedbacks').innerHTML='';
 const d=document.getElementById('sDoc');const c=document.getElementById('sCode');
 if(d)d.value='';if(c)c.value='';
 showView('landing');
 toast('Sesión cerrada correctamente.');
 if(token){google.script.run.withSuccessHandler(()=>{}).withFailureHandler(()=>{}).logoutSession(token)}
}
function logoutTeacher(){
 const token=state.teacherToken;
 // La salida visual debe ser inmediata. No esperamos al servidor para volver al inicio.
 state.teacherToken='';state.home=null;state.rubric={};state.preview=null;state.activities=[];state.teacherFeedbacks=[];state.studentCodes=[];
 const email=document.getElementById('tEmail');const pin=document.getElementById('tPin');
 if(email)email.value='';if(pin)pin.value='';
 showView('landing');
 toast('Sesión cerrada correctamente.');
 // Invalidamos el token en segundo plano. Si falla, la interfaz ya quedó cerrada.
 if(token){
   google.script.run
     .withSuccessHandler(()=>{})
     .withFailureHandler(()=>{})
     .logoutSession(token);
 }
}

function refreshTeacher(done){
  google.script.run
    .withSuccessHandler(h=>{
      state.home=h||{};
      fillSelects();
      if(typeof done==='function') done(h);
    })
    .withFailureHandler(fail)
    .getTeacherHome(state.teacherToken);
}

function fillSelects(){
 const gs=state.home?.grupos||[];
 renderGroupSelects(gs);
}
function renderGroupSelects(gs){
 gs=Array.isArray(gs)?gs:[];
 const opts='<option value="">Selecciona un grupo</option>'+gs.map(g=>`<option value="${esc(g.GRUPO_ID)}">${esc(g.GRADO_SEMESTRE)} — ${esc(g.NOMBRE_GRUPO)}</option>`).join('');
 ['importGroup','evalGroup','activityGroup'].forEach(id=>{
   const el=document.getElementById(id);
   if(el) el.innerHTML=gs.length?opts:'<option value="">No hay grupos activos</option>';
 });
 renderFeedbackFilterGroups(gs);
 renderStudentCodesGroupSelect(gs);
}
function loadTeacherGroups(done){
 google.script.run
   .withSuccessHandler(gs=>{
      gs=Array.isArray(gs)?gs:[];
      if(!state.home)state.home={};
      state.home.grupos=gs;
      renderGroupSelects(gs);

      // Si por alguna razón el primer llamado llega vacío, hacemos una
      // segunda lectura del home antes de afirmar que el docente no tiene grupos.
      if(!gs.length){
        google.script.run
          .withSuccessHandler(h=>{
             state.home=h||{};
             const retry=Array.isArray(state.home.grupos)?state.home.grupos:[];
             renderGroupSelects(retry);
             if(typeof done==='function')done(retry);
          })
          .withFailureHandler(fail)
          .getTeacherHome(state.teacherToken);
        return;
      }

      if(typeof done==='function')done(gs);
   })
   .withFailureHandler(e=>{
      const host=document.getElementById('teacherGroupsList');
      if(host)host.innerHTML='<div class="help"><strong>Error cargando grupos:</strong> '+esc((e&&e.message)?e.message:String(e))+'</div>';
      fail(e);
   })
   .getTeacherGroups(state.teacherToken);
}
function renderTeacherGroupsList(gs){
 const host=document.getElementById('teacherGroupsList');if(!host)return;
 if(!gs.length){host.innerHTML='<div class="help">Todavía no tienes grupos activos.</div>';return}
 const counts={};
 (state.home?.students||[]).forEach(s=>counts[s.GRUPO_ID]=(counts[s.GRUPO_ID]||0)+1);
 host.innerHTML=gs.map(g=>`<div class="list-item"><div class="item-row"><div><h4>${esc(g.GRADO_SEMESTRE)} — ${esc(g.NOMBRE_GRUPO)}</h4><p>Período: ${esc(g.PERIODO||'—')} · ${counts[g.GRUPO_ID]||0} estudiantes</p></div><div class="actions" style="margin:0"><span class="status-chip">ACTIVO</span><button class="ghost" onclick="openGroupCodes('${esc(g.GRUPO_ID)}')">Ver estudiantes y códigos</button></div></div></div>`).join('');
}


function renderStudentCodesGroupSelect(gs){
 const el=document.getElementById('studentCodesGroup');if(!el)return;
 gs=Array.isArray(gs)?gs:[];
 const current=el.value;
 el.innerHTML=gs.length
   ? '<option value="">Selecciona un grupo</option>'+gs.map(g=>`<option value="${esc(g.GRUPO_ID)}">${esc(g.GRADO_SEMESTRE)} — ${esc(g.NOMBRE_GRUPO)}</option>`).join('')
   : '<option value="">No hay grupos activos</option>';
 if([...el.options].some(o=>o.value===current))el.value=current;
}
function openGroupCodes(groupId){
 const el=document.getElementById('studentCodesGroup');if(!el)return;
 el.value=groupId;
 loadGroupStudentCodes();
 const section=document.getElementById('studentCodesSection');
 if(section)section.scrollIntoView({behavior:'smooth',block:'start'});
}
function loadGroupStudentCodes(){
 const groupId=v('studentCodesGroup');
 const host=document.getElementById('studentCodesList');
 const status=document.getElementById('studentCodesStatus');
 if(!host)return;
 state.studentCodes=[];
 if(!groupId){
   host.innerHTML='<div class="help">Selecciona un grupo para ver sus estudiantes y códigos.</div>';
   if(status)status.textContent='';
   return;
 }
 host.innerHTML='<div class="help">Cargando estudiantes y códigos…</div>';
 if(status)status.textContent='';
 google.script.run
   .withSuccessHandler(items=>{
      state.studentCodes=Array.isArray(items)?items:[];
      renderStudentCodes(state.studentCodes);
   })
   .withFailureHandler(e=>{
      host.innerHTML='<div class="help"><strong>No fue posible cargar los códigos.</strong></div>';
      fail(e);
   })
   .getGroupStudentAccess(state.teacherToken,groupId);
}
function renderStudentCodes(items){
 const host=document.getElementById('studentCodesList');if(!host)return;
 if(!items.length){
   host.innerHTML='<div class="help">Este grupo no tiene estudiantes activos.</div>';
   return;
 }
 host.innerHTML=items.map((st,i)=>{
   const code=st.codigoVisible||'';
   const codeHtml=code
     ? `<code class="visible-code">${esc(code)}</code>`
     : '<span class="status-chip nuevo">Sin código visible</span>';
   return `<div class="list-item student-code-row">
     <div class="student-code-main">
       <div><h4>${esc(st.nombre)}</h4><p>${esc(st.grado||'')}</p></div>
       <div class="student-code-value">${codeHtml}</div>
     </div>
     <div class="actions student-code-actions">
       ${code?`<button class="ghost" onclick="copyStudentCode(${i})">Copiar código</button>`:''}
       <button class="secondary" onclick="regenerateStudentCode(${i})">${code?'Regenerar':'Generar código'}</button>
     </div>
   </div>`;
 }).join('');
}
function copyStudentCode(index){
 const st=state.studentCodes[index];
 if(!st||!st.codigoVisible){toast('Este estudiante no tiene código visible.');return}
 const value=st.codigoVisible;
 if(navigator.clipboard && navigator.clipboard.writeText){
   navigator.clipboard.writeText(value)
     .then(()=>toast('Código copiado: '+value))
     .catch(()=>fallbackCopyCode(value));
 }else{
   fallbackCopyCode(value);
 }
}
function fallbackCopyCode(value){
 const ta=document.createElement('textarea');
 ta.value=value;ta.style.position='fixed';ta.style.opacity='0';
 document.body.appendChild(ta);ta.focus();ta.select();
 try{document.execCommand('copy');toast('Código copiado: '+value)}
 catch(e){toast('No fue posible copiar. Código: '+value)}
 document.body.removeChild(ta);
}
function regenerateStudentCode(index){
 const st=state.studentCodes[index];if(!st)return;
 const question=st.codigoVisible
   ? `¿Regenerar el código de ${st.nombre}? El código anterior dejará de funcionar.`
   : `¿Generar un código para ${st.nombre}?`;
 if(!confirm(question))return;
 google.script.run
   .withSuccessHandler(r=>{
      toast('Nuevo código asignado a '+r.nombre+': '+r.codigo);
      loadGroupStudentCodes();
   })
   .withFailureHandler(fail)
   .regenerateStudentAccessCode(state.teacherToken,st.estudianteId);
}

function downloadGroupCodesDocx(){
 const groupId=v('studentCodesGroup');
 if(!groupId){toast('Selecciona un grupo.');return}

 const btn=document.getElementById('downloadCodesDocxBtn');
 if(btn){btn.disabled=true;btn.textContent='Generando reporte ALGA…'}

 google.script.run
   .withSuccessHandler(r=>{
      if(btn){btn.disabled=false;btn.textContent='Generar reporte ALGA en Drive'}
      if(!r || !r.driveUrl){toast('No fue posible guardar el archivo en Drive.');return}

      toast(`DOCX guardado en Drive: ${r.asignados} códigos asignados de ${r.total} estudiantes.`);

      // Abrir el archivo ya guardado en Drive.
      const opened=window.open(r.driveUrl,'_blank');
      if(!opened){
        const status=document.getElementById('studentCodesStatus');
        if(status){
          status.innerHTML=`DOCX listo en Drive. <a href="${esc(r.driveUrl)}" target="_blank" rel="noopener">Abrir archivo</a>`;
        }
      }
   })
   .withFailureHandler(e=>{
      if(btn){btn.disabled=false;btn.textContent='Generar reporte ALGA en Drive'}
      fail(e);
   })
   .generateGroupCodesDocx(state.teacherToken,groupId);
}

function generateMissingStudentCodes(){
 const groupId=v('studentCodesGroup');
 if(!groupId){toast('Selecciona un grupo.');return}
 const btn=document.getElementById('generateMissingCodesBtn');
 const status=document.getElementById('studentCodesStatus');
 if(btn){btn.disabled=true;btn.textContent='Generando…'}
 if(status)status.textContent='Generando únicamente los códigos visibles que faltan…';
 google.script.run
   .withSuccessHandler(r=>{
      if(btn){btn.disabled=false;btn.textContent='Generar códigos faltantes'}
      if(status)status.textContent=r.generados
        ? `Listo: ${r.generados} códigos generados.`
        : 'Todos los estudiantes del grupo ya tenían un código visible asignado.';
      toast(r.generados?`${r.generados} códigos generados.`:'No había códigos faltantes.');
      loadGroupStudentCodes();
   })
   .withFailureHandler(e=>{
      if(btn){btn.disabled=false;btn.textContent='Generar códigos faltantes'}
      if(status)status.textContent='No fue posible completar la generación.';
      fail(e);
   })
   .generateMissingStudentAccessCodes(state.teacherToken,groupId);
}
function prepareEvaluationPanel(){
 if(!state.home)return;
 fillSelects();
 resetEvaluationForm(true);
 const group=document.getElementById('evalGroup');
 if(group && !group.value && group.options.length>1)group.selectedIndex=1;
 onEvaluationGroupChange();
}
function onEvaluationGroupChange(){
 const groupId=v('evalGroup');
 const sel=document.getElementById('evalStudent');
 if(!sel)return;

 if(!groupId){
   sel.innerHTML='<option value="">Selecciona primero un grupo</option>';
   renderAssignmentOptions([]);
   return;
 }

 // Primero usamos los estudiantes que ya llegaron con getTeacherHome().
 // Esto evita una llamada innecesaria y hace que el selector responda de inmediato.
 const localStudents=(state.home?.students||[])
   .filter(s=>String(s.GRUPO_ID||'').trim()===String(groupId).trim())
   .sort((a,b)=>String(a.NOMBRE_COMPLETO||'').localeCompare(String(b.NOMBRE_COMPLETO||''),'es'));

 if(localStudents.length){
   sel.innerHTML='<option value="">Selecciona un estudiante</option>'+
     localStudents.map(s=>`<option value="${esc(s.ESTUDIANTE_ID)}">${esc(s.NOMBRE_COMPLETO)}</option>`).join('');
   loadActivities(groupId,renderAssignmentOptions);
   resetEvaluationForm(false);
   return;
 }

 // Respaldo: consulta directa al servidor.
 sel.innerHTML='<option value="">Cargando estudiantes…</option>';
 google.script.run
   .withSuccessHandler(st=>{
      st=Array.isArray(st)?st:[];
      sel.innerHTML=st.length
        ? '<option value="">Selecciona un estudiante</option>'+
          st.map(s=>`<option value="${esc(s.ESTUDIANTE_ID)}">${esc(s.NOMBRE_COMPLETO)}</option>`).join('')
        : '<option value="">No hay estudiantes en este grupo</option>';
      loadActivities(groupId,renderAssignmentOptions);
      resetEvaluationForm(false);
   })
   .withFailureHandler(e=>{
      sel.innerHTML='<option value="">Error cargando estudiantes</option>';
      fail(e);
   })
   .getStudentsByGroup(state.teacherToken,groupId);
}

function resetEvaluationForm(clearAssignment=true){
 state.rubric={};state.preview=null;renderRubric(state.boot?.rubric||[]);updateLiveScore();
 const p=document.getElementById('teacherPreview');if(p)p.classList.add('hidden');
 if(clearAssignment){const a=document.getElementById('evalAssignment');if(a)a.value='';const c=document.getElementById('evalAssignmentCustom');if(c)c.value='';onAssignmentChange()}
 const tf=document.getElementById('teacherFeedback');if(tf)tf.value='';state.feedbackOrigin='TECLADO';
}
function createGroup(){
 const data={nivel:v('gNivel'),gradoSemestre:v('gGrade'),nombreGrupo:v('gName'),periodo:v('gPeriod')};
 google.script.run
   .withSuccessHandler(r=>{
      toast('Grupo creado.');
      refreshTeacher(()=>loadTeacherGroups(gs=>{
        renderTeacherGroupsList(gs);
        const ig=document.getElementById('importGroup');
        const eg=document.getElementById('evalGroup');
        const ag=document.getElementById('activityGroup');
        if(ig && r && r.grupoId) ig.value=r.grupoId;
        if(ag && r && r.grupoId){ag.value=r.grupoId;loadActivities(r.grupoId);}
        if(eg && r && r.grupoId){eg.value=r.grupoId;onEvaluationGroupChange();}
      }));
   })
   .withFailureHandler(fail)
   .createGroup(state.teacherToken,data);
}
function importExcel(){
 const file=document.getElementById('xlsxFile').files[0];
 const groupId=v('importGroup');
 if(!groupId){toast('Selecciona un grupo.');return}
 if(!file){toast('Selecciona un Excel.');return}
 const btn=document.getElementById('importStudentsBtn');
 const progress=document.getElementById('importProgress');
 const progressText=document.getElementById('importProgressText');
 const result=document.getElementById('importResult');
 btn.disabled=true;progress.classList.remove('hidden');progressText.textContent='Leyendo archivo e importando estudiantes…';result.textContent='';
 const finish=()=>{btn.disabled=false;progress.classList.add('hidden')};
 const reader=new FileReader();
 reader.onload=e=>{
   try{
     const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
     const ws=wb.Sheets[wb.SheetNames[0]];
     const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
     progressText.textContent=`Procesando ${rows.length} filas…`;
     google.script.run
       .withSuccessHandler(r=>{
         finish();
         let txt=`✅ Importación finalizada\nCreados: ${r.creados}\nOmitidos: ${r.omitidos||0}\nProcesados: ${r.procesados||rows.length}\n\n`;
         txt+=(r.credenciales||[]).map(x=>`${x.nombre} | Código: ${x.codigo}\nQR: ${x.qrUrl}`).join('\n\n');
         result.textContent=txt;
         toast('Importación finalizada.');
         refreshTeacher();
       })
       .withFailureHandler(e=>{finish();fail(e)})
       .importStudents(state.teacherToken,rows,groupId);
   }catch(err){finish();fail(err)}
 };
 reader.onerror=()=>{finish();toast('No se pudo leer el archivo seleccionado.')};
 reader.readAsArrayBuffer(file);
}
function createActivity(){
 const grupoId=v('activityGroup'), nombre=v('activityName');
 if(!grupoId){toast('Selecciona el grupo de la actividad.');return}
 if(!nombre){toast('Escribe el nombre de la actividad.');return}
 google.script.run.withSuccessHandler(r=>{
   document.getElementById('activityName').value='';
   toast(r.existente?'La actividad ya existía.':'Actividad creada.');
   loadActivities(grupoId);
 }).withFailureHandler(fail).createActivity(state.teacherToken,{grupoId:grupoId,nombreActividad:nombre});
}
function loadActivities(grupoId,done){
 if(!grupoId){
   state.activities=[];
   renderActivitiesList([]);
   if(typeof done==='function')done([]);
   return;
 }
 google.script.run.withSuccessHandler(items=>{
   state.activities=Array.isArray(items)?items:[];
   renderActivitiesList(state.activities);
   if(typeof done==='function')done(state.activities);
 }).withFailureHandler(fail).getTeacherActivities(state.teacherToken,grupoId);
}
function renderActivitiesList(items){
 const host=document.getElementById('activitiesList');if(!host)return;
 host.innerHTML=items.length?items.map(a=>`<div class="list-item"><div class="item-row"><div><h4>${esc(a.NOMBRE_ACTIVIDAD)}</h4><p>Período: ${esc(a.PERIODO||'—')}</p></div><span class="status-chip">ACTIVA</span></div></div>`).join(''):'<div class="help">No hay actividades creadas para este grupo.</div>';
}
function renderAssignmentOptions(items){
 const sel=document.getElementById('evalAssignment');if(!sel)return;
 const rows=Array.isArray(items)?items:[];
 sel.innerHTML='<option value="">Selecciona una actividad</option>'+rows.map(a=>`<option value="${esc(a.NOMBRE_ACTIVIDAD)}" data-id="${esc(a.ACTIVIDAD_ID)}">${esc(a.NOMBRE_ACTIVIDAD)}</option>`).join('')+'<option value="__OTHER__">Otra actividad…</option>';
 onAssignmentChange();
}
function onAssignmentChange(){
 const sel=document.getElementById('evalAssignment'),wrap=document.getElementById('customAssignmentWrap');
 if(!sel||!wrap)return;
 wrap.classList.toggle('hidden',sel.value!=='__OTHER__');
}
function selectedAssignment(){
 const sel=document.getElementById('evalAssignment');
 if(!sel)return {id:'',name:''};
 if(sel.value==='__OTHER__')return {id:'',name:v('evalAssignmentCustom')};
 const opt=sel.options[sel.selectedIndex];
 return {id:opt?opt.dataset.id||'':'',name:sel.value};
}

function renderRubric(rubric){
 const c=document.getElementById('rubricContainer'); if(!c)return;
 c.innerHTML=(rubric||[]).map(item=>`<div class="criterion" data-id="${item.id}"><div class="criterion-head"><h4>${esc(item.orden+'. '+item.criterio)}</h4><span class="criterion-status" id="status_${item.id}">Sin calificar</span></div><p>${esc(item.descripcion)}</p><div class="scores" role="group" aria-label="${esc(item.criterio)}">${item.levels.map(l=>`<button type="button" class="scorebtn" data-score="${l.nivel}" onclick="pickScore(this,'${item.id}',${l.nivel})" aria-label="Nivel ${l.nivel}: ${esc(l.etiqueta)}">${l.nivel}</button>`).join('')}</div><div id="desc_${item.id}" class="descriptor">Selecciona un nivel.</div></div>`).join('');
}
function pickScore(btn,id,nivel){
 state.rubric[id]=nivel;btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');
 const c=state.boot.rubric.find(x=>x.id===id),l=c.levels.find(x=>x.nivel===nivel);document.getElementById('desc_'+id).textContent=l.etiqueta+': '+l.descriptor;
 const st=document.getElementById('status_'+id);if(st){st.textContent='Nivel '+nivel;st.classList.add('done')}updateLiveScore();
}
function updateLiveScore(){
 const vals=Object.values(state.rubric).map(Number),count=vals.length,total=vals.reduce((a,b)=>a+b,0),grade=count===10?total/10:null;
 const progress=document.getElementById('evaluationProgress');if(progress)progress.textContent=count+' / 10 criterios';
 const points=document.getElementById('livePoints');if(points)points.textContent=total+' / 50';
 const gradeEl=document.getElementById('liveGrade');if(gradeEl)gradeEl.textContent=grade==null?'—':grade.toFixed(1)+' / 5.0';
 const levelEl=document.getElementById('liveLevel');if(levelEl){const vis=grade==null?null:(state.boot?.visualLevels||[]).find(x=>grade>=Number(x.min)&&grade<=Number(x.max));levelEl.textContent=vis?vis.nivel+' · '+vis.etiqueta:'—'}
}
function evaluationPayload(){const a=selectedAssignment();return {grupoId:v('evalGroup'),estudianteId:v('evalStudent'),actividadId:a.id,assignment:a.name,scores:state.rubric,teacherFeedback:v('teacherFeedback'),teacherFeedbackOrigin:state.feedbackOrigin}}
function validateEvaluationInput(){
 if(!v('evalGroup')){toast('Selecciona un grupo.');return false}if(!v('evalStudent')){toast('Selecciona un estudiante.');return false}if(!selectedAssignment().name){toast('Selecciona o escribe la actividad.');return false}
 if(Object.keys(state.rubric).length!==10){toast('Debes evaluar los 10 criterios.');return false}return true;
}
function previewEvaluation(){
 if(!validateEvaluationInput())return;
 google.script.run.withSuccessHandler(r=>{state.preview=r;document.getElementById('teacherPreview').classList.remove('hidden');document.getElementById('previewGif').src=r.gifUrl||'';document.getElementById('previewGif').alt=r.gifAlt||'ALGA';document.getElementById('previewLevel').textContent=r.nota.toFixed(1)+' / 5.0 · '+r.nivelVisual+' · '+r.etiquetaVisual;document.getElementById('previewStudent').textContent=r.estudiante+' · '+selectedAssignment().name;document.getElementById('previewStrengths').innerHTML=(r.fortalezas||[]).map(x=>`<p>• ${esc(x)}</p>`).join('');document.getElementById('previewImprovements').innerHTML=(r.mejoras||[]).map(x=>`<p>• ${esc(x)}</p>`).join('');document.getElementById('previewChallenge').textContent=r.reto||'';document.getElementById('teacherPreview').scrollIntoView({behavior:'smooth',block:'center'})}).withFailureHandler(fail).previewEvaluation(state.teacherToken,evaluationPayload());
}
function saveEvaluation(){
 if(!validateEvaluationInput())return;
 const btn=document.getElementById('publishFeedbackBtn');btn.disabled=true;btn.textContent='Publicando…';
 google.script.run.withSuccessHandler(r=>{toast(`Feedback publicado: ${r.nota.toFixed(1)}/5.0 · ${r.nivelVisual}`);btn.disabled=false;btn.textContent='Publicar feedback al estudiante';resetEvaluationForm(true);refreshTeacher()}).withFailureHandler(e=>{btn.disabled=false;btn.textContent='Publicar feedback al estudiante';fail(e)}).saveEvaluation(state.teacherToken,evaluationPayload());
}
function renderFeedbackFilterGroups(gs){
 const el=document.getElementById('feedbackFilterGroup');if(!el)return;
 const current=el.value;
 el.innerHTML='<option value="">Todos los grupos</option>'+(gs||[]).map(g=>`<option value="${esc(g.GRUPO_ID)}">${esc(g.GRADO_SEMESTRE)} — ${esc(g.NOMBRE_GRUPO)}</option>`).join('');
 if([...el.options].some(o=>o.value===current))el.value=current;
}
let teacherFeedbackRequestId=0;
function loadTeacherFeedbacks(){
 const host=document.getElementById('teacherFeedbackList');if(!host)return;
 const requestId=++teacherFeedbackRequestId;
 const filters={grupoId:v('feedbackFilterGroup'),estado:v('feedbackFilterState')};
 host.innerHTML='<div class="help">Cargando feedbacks…</div>';

 const slowTimer=setTimeout(()=>{
   if(requestId===teacherFeedbackRequestId){
     host.innerHTML='<div class="help"><strong>La consulta está tardando más de lo normal.</strong><br>Presiona Actualizar para intentarlo nuevamente.</div>';
   }
 },12000);

 google.script.run
   .withSuccessHandler(items=>{
     if(requestId!==teacherFeedbackRequestId)return;
     clearTimeout(slowTimer);
     state.teacherFeedbacks=Array.isArray(items)?items:[];
     renderTeacherFeedbacks(state.teacherFeedbacks,filters);
   })
   .withFailureHandler(e=>{
     if(requestId!==teacherFeedbackRequestId)return;
     clearTimeout(slowTimer);
     state.teacherFeedbacks=[];
     const msg=(e&&e.message)?e.message:String(e||'Error desconocido');
     host.innerHTML='<div class="help"><strong>No fue posible cargar los feedbacks.</strong><br>'+esc(msg)+'</div>';
     fail(e);
   })
   .getTeacherFeedbacks(state.teacherToken,filters);
}
function renderTeacherFeedbacks(items,filters){
 const host=document.getElementById('teacherFeedbackList');if(!host)return;
 if(!items.length){
   const hasGroup=filters&&filters.grupoId;
   const hasState=filters&&filters.estado;
   let msg='Todavía no hay feedbacks enviados.';
   if(hasGroup&&hasState) msg='No hay feedbacks de este grupo con el estado seleccionado.';
   else if(hasGroup) msg='No hay feedbacks publicados para este grupo.';
   else if(hasState) msg='No hay feedbacks con este estado.';
   host.innerHTML='<div class="help"><strong>'+esc(msg)+'</strong></div>';
   return;
 }
 host.innerHTML=items.map((f,i)=>{
   const st=String(f.estadoEstudiante||'NUEVO').toLowerCase();
   return `<div class="list-item"><div class="item-row"><div><h4>${esc(f.estudiante)}</h4><p>${esc(f.grupo)} · ${esc(f.asignacion)}</p><p>${formatDate(f.fechaPublicacion)} · Nota ${Number(f.nota).toFixed(1)}/5.0</p></div><span class="status-chip ${esc(st)}">${esc(f.estadoEstudiante||'NUEVO')}</span></div><div class="actions"><button class="ghost" onclick="toggleTeacherFeedbackDetail(${i})">Ver feedback</button>${f.respuesta?`<button class="secondary" onclick="toggleTeacherFeedbackDetail(${i},true)">Ver respuesta</button>`:''}</div><div id="teacherFbDetail_${i}" class="feedback-detail hidden"></div></div>`;
 }).join('');
}
function toggleTeacherFeedbackDetail(i,showResponse){
 const f=state.teacherFeedbacks[i],box=document.getElementById('teacherFbDetail_'+i);if(!f||!box)return;
 if(!box.classList.contains('hidden')){box.classList.add('hidden');return}
 let html=`<strong>Fortalezas</strong><p>${nl2br(f.fortalezas)}</p><strong>Aspectos por mejorar</strong><p>${nl2br(f.mejoras)}</p><strong>Próximo reto</strong><p>${esc(f.reto)}</p>`;
 if(f.docente)html+=`<strong>Comentario docente</strong><p>${nl2br(f.docente)}</p>`;
 if(f.respuesta){
   html+=`<hr><strong>Respuesta del estudiante</strong><p><b>Comprendí:</b> ${nl2br(f.respuesta.comprendi)}</p><p><b>Voy a mejorar:</b> ${nl2br(f.respuesta.mejorar)}</p><p><b>Necesito ayuda:</b> ${nl2br(f.respuesta.ayuda)}</p>`;
 }
 box.innerHTML=html;box.classList.remove('hidden');
}
function formatDate(value){
 if(!value)return 'Sin fecha';
 const d=new Date(value);return isNaN(d)?String(value):d.toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'});
}
/* ===== Dictado (Speech-to-Text) — basado en Codigo_Microfono_Speech_to_Text_pjc_Speakup.txt =====
   Igual al .txt: un solo SpeechRecognition creado al cargar, continuous=false,
   interimResults=true, onstart/onresult/onend/onerror y evento "input".
   Cambios: idioma es-CO y un botón por cada cuadro de texto.
   Accesibilidad agregada: sonido al iniciar/terminar, avisos al lector de
   pantalla, aria-pressed y atajo Alt+M. */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;
let dictField = null, dictBtn = null;

function earcon(up){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=state.audioCtx||(state.audioCtx=new C());const o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(up?520:780,c.currentTime);o.frequency.linearRampToValueAtTime(up?880:440,c.currentTime+.15);g.gain.setValueAtTime(.15,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.2);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.22)}catch(e){}}

function resetMicButton(){
  if (!dictBtn) return;
  dictBtn.textContent = "🎙️ Dictar";
  dictBtn.classList.remove("recording");
  dictBtn.setAttribute("aria-pressed", "false");
}

if (SpeechRecognition) {

  recognition = new SpeechRecognition();

  // Español para FEEDBACK+ EDU
  recognition.lang = "es-CO";

  // Permite recibir resultados mientras la persona habla
  recognition.interimResults = true;

  // Una sesión de reconocimiento por activación
  recognition.continuous = false;

  recognition.onstart = function () {
    isRecording = true;
    if (dictBtn) {
      dictBtn.textContent = "🛑 Detener";
      dictBtn.classList.add("recording");
      dictBtn.setAttribute("aria-pressed", "true");
    }
    earcon(true);
    announce("Escuchando. Habla ahora.");
  };

  recognition.onresult = function (event) {

    let finalText = "";
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {

      const text = event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalText += text;
      } else {
        interimText += text;
      }
    }

    // Mostrar inmediatamente lo que reconoce el micrófono
    const field = document.getElementById(dictField);
    if (!field) return;

    field.value = finalText || interimText;

    // Disparar input para que otros sistemas
    // de guardado/persistencia detecten el cambio
    field.dispatchEvent(
      new Event("input", { bubbles: true })
    );

    if (finalText) announce("Texto reconocido: " + finalText);
  };

  recognition.onend = function () {
    isRecording = false;
    resetMicButton();
    earcon(false);
    if (dictBtn) dictBtn.focus();
  };

  recognition.onerror = function (event) {

    console.error("Speech recognition error:", event.error);

    isRecording = false;
    resetMicButton();

    if (event.error === "not-allowed") {
      alert("El permiso del micrófono fue denegado.");
    } else if (event.error === "no-speech") {
      announce("No se detectó voz. Intenta nuevamente.");
    } else {
      announce("Error de dictado: " + event.error);
    }
  };

} else {

  console.warn(
    "Speech Recognition is not supported by this browser."
  );
}


function toggleDictation(fieldId, btn) {

  if (!recognition) {
    alert("El dictado por voz no está disponible en este navegador. Usa Chrome o Edge.");
    return;
  }

  if (isRecording) {
    recognition.stop();
    return;
  }

  const field = document.getElementById(fieldId);
  if (!field) return;

  try { speechSynthesis.cancel(); } catch (e) {}

  resetMicButton();
  dictField = fieldId;
  dictBtn = btn || null;

  // Origen de la respuesta (VOZ / MIXTO) para el registro
  state.dictOrigin = state.dictOrigin || {};
  state.dictOrigin[fieldId] = field.value.trim() ? "MIXTO" : "VOZ";
  if (fieldId === "teacherFeedback") state.feedbackOrigin = state.dictOrigin[fieldId];

  recognition.start();
}

function startDictation(){toggleDictation('teacherFeedback',document.getElementById('dictateBtn'))}
function stopDictation(){if(recognition&&isRecording)recognition.stop()}

// Atajo Alt+M: dicta en el cuadro de texto que tenga el foco
document.addEventListener('keydown',e=>{if(e.altKey&&(e.key==='m'||e.key==='M')){e.preventDefault();if(isRecording){stopDictation();return}const a=document.activeElement;const id=(a&&a.tagName==='TEXTAREA'&&a.id)?a.id:'teacherFeedback';const f=document.getElementById(id);if(!f||f.offsetParent===null){announce('Ubica el cursor en un cuadro de texto para dictar.');return}toggleDictation(id,document.querySelector('.mic-btn[aria-controls="'+id+'"]'))}});
function loadStudentFeedbacks(){
 google.script.run.withSuccessHandler(items=>{const host=document.getElementById('studentFeedbacks');if(!items.length){host.innerHTML='<div class="card">Aún no tienes feedback publicado.</div>';return}state.studentItems=items;host.innerHTML=items.map((f,i)=>feedbackHtml(f,i)).join('');state.currentFeedback=items[0]}).withFailureHandler(fail).getStudentFeedbacks(state.studentToken)
}
function feedbackHtml(f,i){return `<article class="card feedback-card" data-index="${i}"><div class="student-feedback-head"><div><span class="level-chip">${esc(f.estadoEstudiante||'NUEVO')}</span><h2>${esc(f.asignacion||'Tu feedback')}</h2></div>${f.gifUrl?`<img src="${f.gifUrl}" alt="${esc(f.gifAlt||('ALGA '+f.nivelVisual))}" class="alga-gif">`:''}</div>${(f.criterios||[]).length?`<button class="primary big" style="width:100%;margin:6px 0 10px" onclick="openFeedbackGame(${i})">🧭 Descubre tu feedback jugando</button>`:''}<div class="grade">${Number(f.nota).toFixed(1)} / 5.0</div><p>${f.total} / 50 puntos · ${esc(f.nivelVisual||'')}</p><h3>Fortalezas</h3><p>${nl2br(f.fortalezas)}</p><h3>Aspectos por mejorar</h3><p>${nl2br(f.mejoras)}</p><h3>Próximo reto</h3><p>${esc(f.reto)}</p><h3>Mensaje de tu docente</h3><p>${esc(f.docente||'Sin mensaje adicional.')}</p><button onclick="setCurrentAndRead(${i})">🔊 Leer este feedback</button><h3>Responde a tu docente</h3><label>¿Qué comprendí?<textarea id="c_${f.feedbackId}"></textarea></label><button type="button" class="mic-btn" aria-pressed="false" aria-controls="c_${f.feedbackId}" aria-label="Dictar respuesta: ¿Qué comprendí?" onclick="toggleDictation('c_${f.feedbackId}',this)">🎙 Dictar</button><label>¿Qué voy a intentar mejorar?<textarea id="m_${f.feedbackId}"></textarea></label><button type="button" class="mic-btn" aria-pressed="false" aria-controls="m_${f.feedbackId}" aria-label="Dictar respuesta: ¿Qué voy a intentar mejorar?" onclick="toggleDictation('m_${f.feedbackId}',this)">🎙 Dictar</button><label>¿Necesito ayuda en algo?<textarea id="a_${f.feedbackId}"></textarea></label><button type="button" class="mic-btn" aria-pressed="false" aria-controls="a_${f.feedbackId}" aria-label="Dictar respuesta: ¿Necesito ayuda en algo?" onclick="toggleDictation('a_${f.feedbackId}',this)">🎙 Dictar</button><button class="primary" onclick="sendResponse('${f.feedbackId}')">Enviar respuesta</button></article>`}
function setCurrentAndRead(i){google.script.run.withSuccessHandler(items=>{state.currentFeedback=items[i];readCurrentFeedback()}).withFailureHandler(fail).getStudentFeedbacks(state.studentToken)}
function readCurrentFeedback(){const f=state.currentFeedback;if(!f){toast('No hay feedback seleccionado.');return}const text=`Tu resultado es ${Number(f.nota).toFixed(1)} sobre 5. Fortalezas. ${f.fortalezas}. Aspectos por mejorar. ${f.mejoras}. Próximo reto. ${f.reto}. Mensaje de tu docente. ${f.docente||'Sin mensaje adicional.'}`;speakText(text)}
function speakText(text){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='es-CO';u.rate=1;speechSynthesis.speak(u)}
function toggleLargeText(){document.body.classList.toggle('large-text')}
function sendResponse(id){const o=(state.dictOrigin||{});const used=['c_','m_','a_'].map(p=>o[p+id]).filter(Boolean);const data={feedbackId:id,comprendi:v('c_'+id),mejorar:v('m_'+id),ayuda:v('a_'+id),origen:used.length?(used.includes('MIXTO')?'MIXTO':'VOZ'):'TECLADO'};google.script.run.withSuccessHandler(()=>{toast('Respuesta enviada a tu docente.');loadStudentFeedbacks()}).withFailureHandler(fail).submitStudentResponse(state.studentToken,data)}
function v(id){const e=document.getElementById(id);return e?e.value.trim():''}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function nl2br(s){return esc(s).replace(/\n/g,'<br>')}
