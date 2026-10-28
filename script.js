/* ================================================================
   PRONTUÁRIO DIGITAL — aplicação (dados locais via localStorage)
   ================================================================ */
const LS_DB = 'prontuario.db.v1';
const SS_SESSION = 'prontuario.session.v1';
const LOCK_MS = 20 * 60 * 1000; /* bloqueio automático por inatividade */

/* ---------------- helpers ---------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return 'h' + h.toString(36); };
const fmtDate = iso => { if (!iso) return '—'; const p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; };
const fmtDT = iso => { if (!iso) return '—'; const d = new Date(iso); if (isNaN(d)) return fmtDate(iso);
  return d.toLocaleDateString('pt-BR') + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const idade = n => { if (!n) return null; const b = new Date(n), t = new Date(); if (isNaN(b)) return null;
  let a = t.getFullYear() - b.getFullYear(); const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--; return a; };
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const listify = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
const num = x => parseFloat(String(x ?? '').replace(',', '.'));
const monthKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
/* armazenamento tolerante a navegadores que bloqueiam storage */
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
const sess = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
  del: k => { try { sessionStorage.removeItem(k); } catch (e) {} } };

/* ---------------- vitais ---------------- */
function imcOf(v) {
  const p = num(v.peso), a = num(v.altura);
  if (!p || !a) return null;
  const m = a > 3 ? a / 100 : a;
  if (m <= 0) return null;
  return +(p / (m * m)).toFixed(1);
}
function imcClass(i) {
  if (i == null) return { t: '—', c: '' };
  if (i < 18.5) return { t: 'Abaixo do peso', c: 'warn' };
  if (i < 25) return { t: 'Peso adequado', c: 'good' };
  if (i < 30) return { t: 'Sobrepeso', c: 'warn' };
  return { t: 'Obesidade', c: 'bad' };
}
function vitalFlags(v) {
  const f = {};
  const pa = String(v.pa || '').match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (pa) { const s = +pa[1], d = +pa[2];
    f.pa = (s >= 180 || d >= 120) ? 'bad' : (s >= 140 || d >= 90 || s < 90 || d < 60) ? 'warn' : 'good'; }
  const fc = num(v.fc); if (fc) f.fc = (fc < 50 || fc > 130) ? 'bad' : (fc < 60 || fc > 100) ? 'warn' : 'good';
  const fr = num(v.fr); if (fr) f.fr = (fr < 8 || fr > 28) ? 'bad' : (fr < 12 || fr > 20) ? 'warn' : 'good';
  const t = num(v.temp); if (t) f.temp = (t >= 39 || t < 35) ? 'bad' : (t >= 37.8 || t < 36) ? 'warn' : 'good';
  const sp = num(v.spo2); if (sp) f.spo2 = sp < 90 ? 'bad' : sp < 95 ? 'warn' : 'good';
  const im = imcOf(v); if (im) f.imc = imcClass(im).c || 'good';
  return f;
}
function vitalsHTML(v) {
  const f = vitalFlags(v), im = imcOf(v);
  const cell = (k, val, unit, flag) => (val === '' || val == null || val === undefined)
    ? '' : `<div class="vital ${flag || ''}"><div class="k">${k}</div><div class="v">${esc(val)}${unit ? `<small> ${unit}</small>` : ''}</div></div>`;
  return `<div class="vitals">
    ${cell('Pressão', v.pa, 'mmHg', f.pa)}
    ${cell('Freq. card.', v.fc, 'bpm', f.fc)}
    ${cell('Freq. resp.', v.fr, 'irpm', f.fr)}
    ${cell('Temp.', v.temp, '°C', f.temp)}
    ${cell('SpO₂', v.spo2, '%', f.spo2)}
    ${cell('Peso', v.peso, 'kg', '')}
    ${cell('Altura', v.altura, 'm', '')}
    ${im != null ? `<div class="vital ${imcClass(im).c}"><div class="k">IMC</div><div class="v">${im}<small> ${imcClass(im).t}</small></div></div>` : ''}
  </div>`;
}

/* ---------------- dados ---------------- */
function seed() {
  const p1 = {
    id: uid(), nome: 'Maria Aparecida Souza', nascimento: '1962-04-18', sexo: 'Feminino',
    cpf: '123.456.789-00', telefone: '(11) 98877-6655', email: 'maria.souza@email.com',
    tipoSanguineo: 'O+', convenio: 'Unimed', endereco: 'Rua das Acácias, 210 — Apto 42, São Paulo/SP',
    emergenciaNome: 'João Souza (filho)', emergenciaTel: '(11) 97766-1122',
    alergias: 'Dipirona, Penicilina', criadoEm: new Date().toISOString(),
    antecedentes: {
      cronicas: 'Hipertensão arterial sistêmica; Diabetes mellitus tipo 2; Dislipidemia',
      cirurgias: 'Colecistectomia (2015)',
      medicamentos: 'Losartana 50mg 12/12h; Metformina 850mg 2x/dia; Sinvastatina 20mg à noite',
      familiares: 'Pai com infarto aos 61 anos; mãe com diabetes',
      tabagismo: 'Ex-tabagista (parou há 8 anos)', etilismo: 'Social', atividade: 'Sedentária', obs: 'Boa adesão medicamentosa.'
    },
    consultas: [
      { id: uid(), data: '2025-03-12T09:20', tipo: 'Consulta',
        queixa: 'Cefaleia occipital há 3 dias, associada a tontura ao levantar. Nega febre ou perda de força.',
        vitais: { pa: '158/96', fc: '88', fr: '18', temp: '36.6', spo2: '97', peso: '78', altura: '1.58' },
        exame: 'BEG, corada, hidratada. Ausculta cardíaca com ritmo regular, 2 bulhas, sem sopros. Pulmões limpos. Membros sem edema.',
        hipotese: 'Hipertensão arterial não controlada — cefaleia tensional associada.',
        cid: 'I10', conduta: 'Ajuste de losartana para 100mg/dia. Orientação sobre dieta hipossódica e monitorização domiciliar da PA.',
        prescricao: 'Losartana 100mg — 1 comprimido pela manhã.\nDipirona 500mg — 1 comprimido se dor (evitar).\nRetorno em 30 dias com diário pressórico.',
        retorno: '2025-04-15', obs: 'Orientada sobre sinais de alarme para pronto atendimento.' },
      { id: uid(), data: '2025-06-04T14:10', tipo: 'Retorno',
        queixa: 'Refere melhora das cefaleias. Diário pressórico com médias de 132/84. Nega efeitos adversos.',
        vitais: { pa: '132/84', fc: '76', fr: '16', temp: '36.4', spo2: '98', peso: '76.5', altura: '1.58' },
        exame: 'Exame físico sem alterações significativas. PA controlada na consulta.',
        hipotese: 'Hipertensão arterial controlada. Diabetes em acompanhamento.',
        cid: 'I10',
        conduta: 'Mantido esquema. Solicitado HbA1c, perfil lipídico e creatinina.',
        prescricao: 'Manter losartana 100mg/dia. Metformina 850mg 2x/dia.', retorno: '2025-09-10', obs: '' }
    ]
  };
  const p2 = {
    id: uid(), nome: 'Lucas Ferreira Lima', nascimento: '1996-11-02', sexo: 'Masculino',
    cpf: '987.654.321-00', telefone: '(21) 99654-3322', email: 'lucas.lima@email.com',
    tipoSanguineo: 'A+', convenio: 'Particular', endereco: 'Av. Atlântica, 1500 — Rio de Janeiro/RJ',
    emergenciaNome: 'Camila Lima (irmã)', emergenciaTel: '(21) 98812-4455',
    alergias: 'Nega alergias conhecidas', criadoEm: new Date().toISOString(),
    antecedentes: { cronicas: 'Rinite alérgica', cirurgias: 'Nega', medicamentos: 'Loratadina 10mg quando necessário',
      familiares: 'Sem histórico relevante', tabagismo: 'Não', etilismo: 'Social', atividade: 'Corre 3x por semana', obs: '' },
    consultas: [
      { id: uid(), data: '2025-08-19T18:40', tipo: 'Urgência',
        queixa: 'Dor de garganta intensa há 2 dias, odinofagia, febre de 38,4°C e mal-estar geral.',
        vitais: { pa: '118/76', fc: '96', fr: '20', temp: '38.4', spo2: '98', peso: '82', altura: '1.82' },
        exame: 'Hiperemia de orofaringe com exsudato amigdaliano bilateral. Linfonodos cervicais dolorosos. Ausculta pulmonar limpa.',
        hipotese: 'Amigdalite aguda bacteriana provável.',
        cid: 'J03.9', conduta: 'Antibioticoterapia empírica, sintomáticos, hidratação e repouso. Orientado retorno se piora.',
        prescricao: 'Amoxicilina 500mg — 1 cápsula a cada 8h por 7 dias.\nIbuprofeno 400mg — 1 comprimido a cada 8h se dor/febre.\nHidratação oral abundante.',
        retorno: '2025-08-26', obs: 'Sinais de alarme explicados.' }
    ]
  };
  return {
    doctor: { name: 'Dra. Helena Martins', user: 'medica', pass: hash('medico123'),
      crm: 'CRM/SP 123456', especialidade: 'Clínica Médica', clinic: 'Clínica Vida Plena' },
    patients: [p1, p2],
    activity: [ { t: new Date().toISOString(), icon: '✚', text: 'Prontuário iniciado com dados de demonstração.' } ]
  };
}
let db = null;
function loadDB() {
  try { const raw = store.get(LS_DB); db = raw ? JSON.parse(raw) : seed(); }
  catch (e) { db = seed(); }
  if (!db || !db.patients) db = seed();
  if (!db.activity) db.activity = [];
  let m = 0;
  db.patients.forEach(p => { const n = parseInt(String(p.registro || '').replace(/\D/g, ''), 10); if (n > m) m = n; });
  db.patients.filter(p => !p.registro)
    .sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')))
    .forEach(p => { m++; p.registro = 'P-' + String(m).padStart(4, '0'); });
  db.patients.forEach(p => {
    if (p.historico) return;
    const a = p.antecedentes || {}, parts = [];
    if (p.alergias && !/^nega/i.test(String(p.alergias).trim())) parts.push('Alergias: ' + p.alergias);
    if (a.cronicas) parts.push('Condições crônicas: ' + a.cronicas);
    if (a.cirurgias) parts.push('Cirurgias e internações: ' + a.cirurgias);
    if (a.medicamentos) parts.push('Medicamentos em uso: ' + a.medicamentos);
    if (a.familiares) parts.push('Antecedentes familiares: ' + a.familiares);
    if (a.tabagismo) parts.push('Tabagismo: ' + a.tabagismo);
    if (a.etilismo) parts.push('Etilismo: ' + a.etilismo);
    if (a.atividade) parts.push('Atividade física: ' + a.atividade);
    if (a.obs) parts.push(a.obs);
    p.historico = parts.join('\n');
  });
}
function saveDB() { store.set(LS_DB, JSON.stringify(db)); }
function log(text, icon = '•') { db.activity.unshift({ t: new Date().toISOString(), icon, text }); db.activity = db.activity.slice(0, 60); }
function nextRegistro() {
  let m = 0;
  db.patients.forEach(p => { const n = parseInt(String(p.registro || '').replace(/\D/g, ''), 10); if (n > m) m = n; });
  return 'P-' + String(m + 1).padStart(4, '0');
}

/* ---------------- toasts ---------------- */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<i>${type === 'ok' ? '✓' : type === 'err' ? '!' : 'i'}</i><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3600);
}

/* ---------------- sessão ---------------- */
let lockTimer = null;
function startLockTimer() {
  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => { if (session()) { logout(true); toast('Sessão bloqueada por inatividade.', 'info'); } }, LOCK_MS);
}
['click', 'keydown', 'mousemove', 'scroll'].forEach(ev =>
  document.addEventListener(ev, () => { if (session()) startLockTimer(); }, { passive: true }));

const session = () => { try { return JSON.parse(sess.get(SS_SESSION)); } catch (e) { return null; } };
function setSession(on, remember) {
  if (on) {
    sess.set(SS_SESSION, JSON.stringify({ user: db.doctor.user, at: Date.now() }));
    if (remember) store.set('prontuario.remember', '1');
    startLockTimer();
  } else { sess.del(SS_SESSION); }
}
function logout(auto) {
  setSession(false);
  clearTimeout(lockTimer);
  $('#app').classList.add('hidden');
  const lg = $('#login');
  lg.classList.remove('gone', 'hidden');
  $('#loginPass').value = '';
  if (!auto) toast('Sessão encerrada com segurança.', 'info');
}

/* ---------------- login ---------------- */
$('#togglePass').addEventListener('click', () => {
  const i = $('#loginPass');
  i.type = i.type === 'password' ? 'text' : 'password';
  $('#togglePass').textContent = i.type === 'password' ? '👁' : '🙈';
});
$('#loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const u = $('#loginUser').value.trim().toLowerCase();
  const p = $('#loginPass').value;
  const err = $('#loginError');
  const ok = (u === db.doctor.user.toLowerCase()) && (hash(p) === db.doctor.pass);
  if (!ok) {
    err.textContent = 'Usuária ou senha incorretos. Verifique e tente novamente.';
    $('.login-card').classList.add('shake');
    setTimeout(() => $('.login-card').classList.remove('shake'), 500);
    return;
  }
  err.textContent = '';
  setSession(true, $('#remember').checked);
  enterApp();
});
function enterApp() {
  const lg = $('#login');
  lg.classList.add('gone');
  setTimeout(() => { lg.classList.add('hidden'); lg.classList.remove('gone'); }, 520);
  setTimeout(() => { $('#app').classList.remove('hidden'); refreshShell(); nav('dashboard'); }, 180);
}
function refreshShell() {
  $('#clinicName').textContent = db.doctor.clinic || 'Clínica';
  $('#sideDocName').textContent = db.doctor.name;
  $('#sideDocCrm').textContent = [db.doctor.crm, db.doctor.especialidade].filter(Boolean).join(' · ');
  $('#sideAvatar').textContent = initials(db.doctor.name);
}

/* ---------------- navegação ---------------- */
let route = { view: 'dashboard', patientId: null, tab: 'resumo' };
function nav(view, opts = {}) {
  route = Object.assign({ view, patientId: null, tab: 'resumo' }, opts);
  $$('#sideNav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (window.innerWidth <= 900) $('#sidebar').classList.remove('open');
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('#sideNav button').forEach(b => b.addEventListener('click', () => nav(b.dataset.view)));
$('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#lockBtn').addEventListener('click', () => logout());
$('#newPatientBtn').addEventListener('click', () => patientForm());

function render() {
  const c = $('#content');
  if (route.view === 'dashboard') c.innerHTML = viewDashboard();
  else if (route.view === 'patients') c.innerHTML = viewPatients();
  else if (route.view === 'consultas') c.innerHTML = viewConsultas();
  else if (route.view === 'settings') c.innerHTML = viewSettings();
  else if (route.view === 'patient') c.innerHTML = viewPatient(route.patientId);
  bindView();
  stagger();
}
function bindView() {}
function stagger() {
  $$('#content .anim').forEach((el, i) => { if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', (i * 0.045) + 's'); });
}
function goPatient(id, tab = 'resumo') { nav('patient', { patientId: id, tab }); }

/* ================= DASHBOARD ================= */
function viewDashboard() {
  const ps = db.patients;
  const all = ps.flatMap(p => (p.consultas || []).map(c => ({ ...c, pid: p.id, pnome: p.nome })));
  const today = new Date().toISOString().slice(0, 10);
  const hoje = all.filter(c => (c.data || '').slice(0, 10) === today).length;
  const mesAtual = all.filter(c => (c.data || '').slice(0, 7) === today.slice(0, 7)).length;
  const recentes = [...all].sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, 4);
  const retornos = all.filter(c => c.retorno && c.retorno >= today).sort((a, b) => a.retorno.localeCompare(b.retorno)).slice(0, 5);
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const k = monthKey(d);
    meses.push({ lab: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), n: all.filter(c => (c.data || '').slice(0, 7) === k).length });
  }
  const maxN = Math.max(1, ...meses.map(m => m.n));
  const hora = new Date().getHours();
  const sauda = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  return `
  <div class="page-head anim">
    <div>
      <h1>${sauda}, ${esc((db.doctor.name || '').split(' ').slice(0, 2).join(' '))} </h1>
      <p>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
    </div>
    <div class="flex gap12 wrap">
      <button class="btn btn-ghost" data-act="go-patients">◉ Ver pacientes</button>
      <button class="btn btn-primary" data-act="new-patient">＋ Novo paciente</button>
    </div>
  </div>

  <div class="grid g4">
    <div class="card stat anim"><div class="ico"></div><div class="num">${ps.length}</div><div class="lbl">Pacientes cadastrados</div></div>
    <div class="card stat anim"><div class="ico"></div><div class="num">${all.length}</div><div class="lbl">Registros clínicos no histórico</div></div>
    <div class="card stat anim"><div class="ico"></div><div class="num">${mesAtual}</div><div class="lbl">Atendimentos neste mês${hoje ? ` · ${hoje} hoje` : ''}</div></div>
  </div>

  <div class="grid g2 mt22">
    <div class="card anim">
      <div class="card-title"><h3>Atendimentos nos últimos 6 meses</h3><span class="badge b-teal">${all.length} no total</span></div>
      <div class="bars">
        ${meses.map((m, i) => `<div class="bar-col" title="${m.n} atendimento(s) em ${m.lab}">
          <div class="val">${m.n || ''}</div>
          <div class="bar" style="height:${Math.max(5, (m.n / maxN) * 100)}%;--d:${i * .08}s"></div>
          <div class="lab">${esc(m.lab)}</div></div>`).join('')}
      </div>
    </div>

    <div class="card anim">
      <div class="card-title"><h3>Próximos retornos</h3><span class="badge b-blue">${retornos.length}</span></div>
      ${retornos.length ? `<div class="grid" style="gap:11px">${retornos.map(r => `
        <div class="flex between center gap12" style="padding:11px 13px;border:1px solid var(--line);border-radius:14px;background:var(--bg)">
          <div style="min-width:0"><b style="font-size:.88rem">${esc(r.pnome)}</b>
            <div class="tiny muted">${esc(r.tipo || 'Consulta')} · ${esc(r.hipotese ? r.hipotese.slice(0, 40) : 'sem hipótese registrada')}</div></div>
          <div style="text-align:right"><span class="badge ${r.retorno === today ? 'b-amber' : 'b-teal'}">${r.retorno === today ? 'Hoje' : fmtDate(r.retorno)}</span></div>
        </div>`).join('')}</div>`
      : `<div class="empty" style="padding:30px 10px"><div class="big">📜</div>Nenhum retorno agendado.<br><span class="tiny">Os retornos marcados nas consultas aparecem aqui.</span></div>`}
    </div>
  </div>

  <div class="grid g2 mt22">
    <div class="card anim">
      <div class="card-title"><h3>Últimos atendimentos</h3><button class="btn btn-ghost btn-sm" data-act="go-consultas">Ver todos</button></div>
      ${recentes.length ? `<div class="timeline">${recentes.map((c, i) => `
        <div class="tl-item open" style="--d:${i * .06}s">
          <div class="tl-head" data-act="open-patient" data-id="${c.pid}">
            <h4>${esc(c.pnome)} <span class="badge b-teal">${esc(c.tipo || 'Consulta')}</span></h4>
            <span class="tiny muted">${fmtDT(c.data)}</span>
          </div>
          <div class="tl-body" style="max-height:none;opacity:1;margin-top:8px">
            <div class="sec"><h5>Queixa principal</h5><p>${esc(c.queixa || '—')}</p></div>
            ${c.hipotese ? `<div class="sec"><h5>Hipótese diagnóstica</h5><p>${esc(c.hipotese)}${c.cid ? ` <span class="badge b-gray">CID ${esc(c.cid)}</span>` : ''}</p></div>` : ''}
          </div>
        </div>`).join('')}</div>`
      : `<div class="empty"><div class="big">☤</div>Nenhum atendimento registrado ainda.<br><span class="tiny">Abra um paciente e clique em "Nova consulta".</span></div>`}
    </div>

    <div class="card anim">
      <div class="card-title"><h3>Atividade recente</h3></div>
      <div class="grid" style="gap:10px">
        ${(db.activity || []).slice(0, 7).map((a, i) => `
          <div class="flex gap12 center anim" style="--d:${i * .05}s;padding:10px 12px;border-radius:13px;background:var(--bg);border:1px solid var(--line)">
            <div class="avatar" style="width:32px;height:32px;border-radius:10px;font-size:.8rem">${esc(a.icon || '•')}</div>
            <div style="min-width:0"><div style="font-size:.85rem">${esc(a.text)}</div><div class="tiny muted">${fmtDT(a.t)}</div></div>
          </div>`).join('') || '<div class="empty tiny">Sem atividade registrada.</div>'}
      </div>
    </div>
  </div>`;
}

/* ================= PACIENTES ================= */
let patientFilter = '';
let patientSort = 'az';
function lastAtendimento(p) {
  return [...(p.consultas || [])].sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0] || {};
}
function viewPatients() {
  const q = patientFilter.toLowerCase();
  const list = db.patients.filter(p => !q || [p.nome, p.cpf, p.telefone, p.registro].join(' ').toLowerCase().includes(q));
  if (patientSort === 'za') list.sort((a, b) => b.nome.localeCompare(a.nome, 'pt-BR'));
  else if (patientSort === 'recente') list.sort((a, b) => (lastAtendimento(b).data || '').localeCompare(lastAtendimento(a).data || ''));
  else if (patientSort === 'consultas') list.sort((a, b) => (b.consultas || []).length - (a.consultas || []).length);
  else list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const agrupar = (patientSort === 'az' || patientSort === 'za');
  let grupos = '', letra = '', buffer = [];
  const flush = () => {
    if (!buffer.length) return;
    const head = agrupar
      ? `<div class="letter-head"${grupos === '' ? ' style="margin-top:0"' : ''}><span>${esc(letra)}</span><em>${buffer.length} paciente${buffer.length > 1 ? 's' : ''}</em></div>`
      : '';
    grupos += head + `<div class="grid g3">${buffer.join('')}</div>`;
    buffer = [];
  };
  list.forEach((p, i) => {
    const L = agrupar ? (p.nome || '?').trim().charAt(0).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '—';
    if (L !== letra) { flush(); letra = L; }
    const age = idade(p.nascimento);
    const nCons = (p.consultas || []).length;
    const last = [...(p.consultas || [])].sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
    buffer.push(`<div class="card patient-card anim" style="--d:${(i % 6) * .05}s" data-act="open-patient" data-id="${p.id}">
      <div class="pc-top">
        <div class="avatar">${initials(p.nome)}</div>
        <div style="min-width:0">
          <b>${esc(p.nome)}</b>
          <div class="tiny muted">${age != null ? age + ' anos' : 'idade não informada'} · ${esc(p.sexo || '—')}</div>
        </div>
      </div>
      <div class="pc-meta">
        <span class="badge b-gray">📋 ${esc(p.registro || '—')}</span>
        <span class="badge b-teal">${nCons} consulta${nCons === 1 ? '' : 's'}</span>
        ${p.tipoSanguineo ? `<span class="badge b-red">${esc(p.tipoSanguineo)}</span>` : ''}
        ${p.historico ? '<span class="badge b-gray">Histórico registrado</span>' : ''}
      </div>
      <div class="divider"></div>
      <div class="tiny muted">Último atendimento: <b>${last ? fmtDate(last.data) + ' · ' + esc(last.tipo || 'Consulta') : 'sem registros'}</b></div>
    </div>`);
  });
  flush();
  return `
  <div class="page-head anim">
    <div><h1>Pacientes</h1><p>${db.patients.length} prontuário(s) · clique em um cartão para abrir</p></div>
    <button class="btn btn-primary" data-act="new-patient">＋ Novo paciente</button>
  </div>
  <div class="card anim" style="padding:14px 18px;margin-bottom:6px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
    <input class="input" id="patientSearch" style="flex:1 1 280px;min-width:220px" placeholder="⌕ Filtrar por nome, prontuário, CPF ou telefone..." value="${esc(patientFilter)}">
    <select class="input" id="patientSort" style="flex:0 1 250px" title="Ordenar a lista">
      <option value="az"${patientSort === 'az' ? ' selected' : ''}>Nome (A → Z)</option>
      <option value="za"${patientSort === 'za' ? ' selected' : ''}>Nome (Z → A)</option>
      <option value="recente"${patientSort === 'recente' ? ' selected' : ''}>Atendimento mais recente</option>
      <option value="consultas"${patientSort === 'consultas' ? ' selected' : ''}>Mais consultas</option>
    </select>
  </div>
  ${list.length ? grupos
  : `<div class="card empty"><div class="big">◉</div>Nenhum paciente encontrado.<br><span class="tiny">Ajuste a busca ou cadastre um novo paciente.</span></div>`}`;
}

/* ================= CONSULTAS (todas) ================= */
function viewConsultas() {
  const all = db.patients.flatMap(p => (p.consultas || []).map(c => ({ ...c, pnome: p.nome, pid: p.id })))
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return `
  <div class="page-head anim"><div><h1>Consultas</h1><p>Histórico completo de todos os atendimentos, do mais recente ao mais antigo.</p></div></div>
  ${all.length ? `<div class="card pad0 anim" style="overflow-x:auto"><table>
    <thead><tr><th>Data</th><th>Paciente</th><th>Tipo</th><th>Queixa principal</th><th>Hipótese / CID</th><th></th></tr></thead>
    <tbody>${all.map(c => `<tr>
      <td style="white-space:nowrap">${fmtDT(c.data)}</td>
      <td><b>${esc(c.pnome)}</b></td>
      <td><span class="badge b-teal">${esc(c.tipo || 'Consulta')}</span></td>
      <td style="max-width:320px">${esc((c.queixa || '—').slice(0, 90))}${(c.queixa || '').length > 90 ? '…' : ''}</td>
      <td>${esc(c.hipotese || '—')}${c.cid ? ` <span class="badge b-gray">${esc(c.cid)}</span>` : ''}</td>
      <td><button class="btn btn-ghost btn-sm" data-act="open-patient" data-id="${c.pid}">Abrir</button></td>
    </tr>`).join('')}</tbody></table></div>`
  : `<div class="card empty"><div class="big">🩺</div>Nenhuma consulta registrada.</div>`}`;
}

/* ================= PRONTUÁRIO DO PACIENTE ================= */
function viewPatient(id) {
  const p = db.patients.find(x => x.id === id);
  if (!p) return `<div class="card empty"><div class="big">✕</div>Paciente não encontrado.</div>`;
  const age = idade(p.nascimento);
  const cons = [...(p.consultas || [])].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const lastWithVitals = cons.find(c => c.vitais && Object.values(c.vitais).some(Boolean));
  const tabs = [['resumo', 'Resumo'], ['consultas', 'Evolução (' + cons.length + ')'], ['historico', 'Histórico'], ['dados', 'Dados cadastrais']];
  let body = '';

  if (route.tab === 'resumo') {
    body = `
    <div class="grid g2">
      <div class="card anim">
        <div class="card-title"><h3>Sinais vitais mais recentes</h3><span class="tiny muted">${lastWithVitals ? fmtDT(lastWithVitals.data) : ''}</span></div>
        ${lastWithVitals ? vitalsHTML(lastWithVitals.vitais)
          : '<div class="empty tiny">Nenhuma consulta com sinais vitais registrada.</div>'}
      </div>
      <div class="card anim">
        <div class="card-title"><h3>Histórico do paciente</h3><button class="btn btn-ghost btn-sm" data-act="edit-patient" data-id="${p.id}">✎ Editar</button></div>
        <div class="sec"><p>${esc(p.historico || 'Nenhum histórico registrado ainda. Use "Editar dados" para descrever o histórico do paciente.')}</p></div>
        <div class="divider"></div>
        <div class="sec"><h5>Tipo sanguíneo</h5><p>${esc(p.tipoSanguineo || 'Não informado')}</p></div>
      </div>
    </div>
    <div class="grid g2 mt22">
      <div class="card anim">
        <div class="card-title"><h3>Contato</h3></div>
        <div class="grid" style="gap:8px;font-size:.88rem">
          <div class="flex between"><span class="muted">Telefone</span><b>${esc(p.telefone || '—')}</b></div>
          <div class="flex between"><span class="muted">E-mail</span><b>${esc(p.email || '—')}</b></div>
          <div class="flex between"><span class="muted">Endereço</span><b style="text-align:right;max-width:62%">${esc(p.endereco || '—')}</b></div>
        </div>
      </div>
      <div class="card anim">
        <div class="card-title"><h3>Últimas evoluções</h3><button class="btn btn-ghost btn-sm" data-act="tab" data-tab="consultas">Ver histórico completo</button></div>
        ${cons.slice(0, 3).map((c, i) => `<div class="anim" style="--d:${i * .06}s;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--bg);margin-bottom:10px">
          <div class="flex between center gap12"><b style="font-size:.88rem">${esc(c.tipo || 'Consulta')}</b><span class="tiny muted">${fmtDT(c.data)}</span></div>
          <p style="font-size:.86rem;margin-top:6px;line-height:1.55">${esc((c.queixa || '').slice(0, 150))}${(c.queixa || '').length > 150 ? '…' : ''}</p>
          ${c.hipotese ? `<div class="tiny" style="margin-top:6px"><span class="badge b-blue">${esc(c.hipotese)}</span></div>` : ''}
        </div>`).join('') || '<div class="empty tiny">Sem evoluções registradas.</div>'}
      </div>
    </div>`;
  }

  if (route.tab === 'consultas') {
    body = cons.length ? `<div class="card anim"><div class="card-title"><h3>Linha do tempo clínica</h3>
      <span class="tiny muted">Clique em um registro para expandir</span></div>
      <div class="timeline">${cons.map((c, i) => consultaItem(c, i)).join('')}</div></div>`
      : `<div class="card empty anim"><div class="big">🩺</div>Nenhuma evolução registrada.<br>
         <button class="btn btn-primary mt14" data-act="new-consulta" data-id="${p.id}">＋ Registrar primeira consulta</button></div>`;
  }

  if (route.tab === 'historico') {
    body = `<div class="card anim">
      <div class="card-title"><h3>Histórico do paciente</h3><button class="btn btn-ghost btn-sm" data-act="edit-patient" data-id="${p.id}">✎ Editar</button></div>
      <div class="sec"><p>${esc(p.historico || 'Nenhum histórico registrado ainda. Use "Editar dados" para descrever o histórico do paciente.')}</p></div>
      <div class="divider"></div>
      <div class="grid g3">
        <div class="sec box"><h5>Tipo sanguíneo</h5><p>${esc(p.tipoSanguineo || 'Não informado')}</p></div>
        <div class="sec box"><h5>Consultas registradas</h5><p>${cons.length}</p></div>
        <div class="sec box"><h5>Último atendimento</h5><p>${cons[0] ? fmtDate(cons[0].data) : '—'}</p></div>
      </div>
    </div>`;
  }

  if (route.tab === 'dados') {
    const d = [
      ['Nome completo', p.nome], ['Número do prontuário', p.registro || '—'],
      ['Data de nascimento', fmtDate(p.nascimento) + (age != null ? ` (${age} anos)` : '')],
      ['Sexo', p.sexo], ['CPF', p.cpf], ['Telefone', p.telefone], ['E-mail', p.email],
      ['Tipo sanguíneo', p.tipoSanguineo], ['Endereço', p.endereco],
      ['Prontuário criado em', fmtDate((p.criadoEm || '').slice(0, 10))]
    ];
    body = `<div class="card anim">
      <div class="card-title"><h3>Dados cadastrais</h3><button class="btn btn-ghost btn-sm" data-act="edit-patient" data-id="${p.id}">✎ Editar</button></div>
      <div class="grid g2">${d.map(([k, v]) => `<div style="padding:12px 0;border-bottom:1px solid var(--line)">
        <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.07em;font-weight:700">${k}</div>
        <div style="margin-top:4px;font-size:.93rem">${esc(v || '—')}</div></div>`).join('')}</div>
    </div>`;
  }

  return `
  <div class="page-head anim no-print">
    <div>
      <button class="btn btn-ghost btn-sm" data-act="go-patients" style="margin-bottom:12px">← Voltar</button>
      <div class="flex gap18 center wrap">
        <div class="avatar" style="width:64px;height:64px;border-radius:21px;font-size:1.2rem">${initials(p.nome)}</div>
        <div>
          <h1 style="font-size:1.75rem">${esc(p.nome)}</h1>
          <p class="muted" style="font-size:.88rem;margin-top:4px">
            ${p.registro ? 'Prontuário ' + esc(p.registro) + ' · ' : ''}${age != null ? age + ' anos' : ''}${p.sexo ? ' · ' + esc(p.sexo) : ''}${p.tipoSanguineo ? ' · ' + esc(p.tipoSanguineo) : ''}
          </p>
        </div>
      </div>
    </div>
    <div class="flex gap12 wrap">
      <button class="btn btn-primary" data-act="new-consulta" data-id="${p.id}">＋ Nova consulta</button>
      <button class="btn btn-ghost" data-act="edit-patient" data-id="${p.id}">✎ Editar dados</button>
      <button class="btn btn-ghost" data-act="print">🖨 Imprimir</button>
      <button class="btn btn-danger" data-act="del-patient" data-id="${p.id}">🗑</button>
    </div>
  </div>

  <div class="print-only" style="margin-bottom:18px">
    <h2>${esc(p.nome)}</h2>
    <p>${esc(p.registro || '')} · ${age != null ? age + ' anos' : ''} · ${esc(p.sexo || '')} · ${esc(p.tipoSanguineo || '')}</p>
    <p>Histórico: ${esc((p.historico || 'não informado').slice(0, 400))}</p>
    <p>Emitido em ${new Date().toLocaleString('pt-BR')} — ${esc(db.doctor.name)} (${esc(db.doctor.crm || '')})</p>
  </div>

  <div class="tabs no-print anim" style="margin-bottom:20px">
    ${tabs.map(([k, l]) => `<button class="${route.tab === k ? 'active' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}
  </div>
  ${body}`;
}

function consultaItem(c, i) {
  const f = vitalFlags(c.vitais || {});
  const alertas = Object.keys(f).filter(k => f[k] === 'bad' || f[k] === 'warn').length;
  return `<div class="tl-item anim" style="--d:${i * .05}s" data-acc>
    <div class="card" style="padding:18px">
      <div class="tl-head" data-act="toggle-acc">
        <h4>${esc(c.tipo || 'Consulta')}
          <span class="badge ${c.tipo === 'Urgência' ? 'b-red' : c.tipo === 'Retorno' ? 'b-blue' : 'b-teal'}">${fmtDate(c.data)}</span>
          ${alertas ? `<span class="badge b-amber">⚠ ${alertas} parâmetro(s) alterado(s)</span>` : ''}
        </h4>
        <div class="flex gap8 center">
          <span class="tiny muted">${(fmtDT(c.data).split('·')[1] || '').trim()}</span>
          <span class="chev">⌄</span>
        </div>
      </div>
      <div class="tl-body">
        <div class="sec"><h5>Queixa principal / história</h5><p>${esc(c.queixa || '—')}</p></div>
        ${c.vitais && Object.values(c.vitais).some(Boolean) ? `<div class="sec"><h5>Sinais vitais</h5>${vitalsHTML(c.vitais)}</div>` : ''}
        ${c.exame ? `<div class="sec"><h5>Exame físico</h5><p>${esc(c.exame)}</p></div>` : ''}
        ${c.hipotese ? `<div class="sec box diag"><h5>Hipótese diagnóstica ${c.cid ? '· CID ' + esc(c.cid) : ''}</h5><p>${esc(c.hipotese)}</p></div>` : ''}
        ${c.conduta ? `<div class="sec box"><h5>Conduta</h5><p>${esc(c.conduta)}</p></div>` : ''}
        ${c.prescricao ? `<div class="sec box presc"><h5>Prescrição / orientações</h5><p>${esc(c.prescricao)}</p></div>` : ''}
        ${c.obs ? `<div class="sec"><h5>Observações</h5><p>${esc(c.obs)}</p></div>` : ''}
        ${c.retorno ? `<div class="sec"><h5>Retorno agendado</h5><span class="badge b-blue">${fmtDate(c.retorno)}</span></div>` : ''}
        <div class="flex gap8 wrap no-print" style="margin-top:16px">
          <button class="btn btn-ghost btn-sm" data-act="edit-consulta" data-id="${c.id}">✎ Editar registro</button>
          <button class="btn btn-danger btn-sm" data-act="del-consulta" data-id="${c.id}">🗑 Excluir</button>
        </div>
      </div>
    </div>
  </div>`;
}

/* ================= AJUSTES ================= */
function viewSettings() {
  const d = db.doctor;
  return `
  <div class="page-head anim"><div><h1>Ajustes</h1><p>Credenciais de acesso, dados profissionais e backup do prontuário.</p></div></div>
  <div class="grid g2">
    <div class="card anim">
      <div class="card-title"><h3>Dados da médica</h3></div>
      <div class="form-grid">
        <label class="field full"><span>Nome completo</span><input id="setName" value="${esc(d.name)}"></label>
        <label class="field"><span>CRM</span><input id="setCrm" value="${esc(d.crm || '')}"></label>
        <label class="field"><span>Especialidade</span><input id="setEsp" value="${esc(d.especialidade || '')}"></label>
        <label class="field full"><span>Nome da clínica / consultório</span><input id="setClinic" value="${esc(d.clinic || '')}"></label>
      </div>
      <button class="btn btn-primary mt14" data-act="save-profile">Salvar dados</button>
    </div>

    <div class="card anim">
      <div class="card-title"><h3>Segurança e acesso</h3></div>
      <label class="field"><span>Usuária de acesso</span><input id="setUser" value="${esc(d.user)}"></label>
      <label class="field mt14"><span>Senha atual</span><input id="setPassOld" type="password" placeholder="••••••••"></label>
      <label class="field mt14"><span>Nova senha</span><input id="setPassNew" type="password" placeholder="mínimo 6 caracteres"></label>
      <label class="field mt14"><span>Confirmar nova senha</span><input id="setPassNew2" type="password" placeholder="repita a nova senha"></label>
      <button class="btn btn-primary mt14" data-act="save-pass">Alterar senha</button>
      <p class="tiny muted mt14">🔒 Os dados são gravados localmente no seu navegador. Use o backup abaixo para transferir entre dispositivos.</p>
    </div>

    <div class="card anim">
      <div class="card-title"><h3>Backup e dados</h3></div>
      <p class="muted" style="font-size:.88rem">${db.patients.length} paciente(s) · ${db.patients.reduce((a, p) => a + (p.consultas || []).length, 0)} registro(s) clínico(s)</p>
      <div class="flex gap12 wrap mt14">
        <button class="btn btn-ghost" data-act="export">⭳ Exportar backup (.json)</button>
        <button class="btn btn-ghost" data-act="import">⭱ Importar backup</button>
        <button class="btn btn-danger" data-act="reset">↺ Restaurar dados de exemplo</button>
      </div>
      <input type="file" id="importFile" accept="application/json" class="hidden">
    </div>

    <div class="card anim">
      <div class="card-title"><h3>Como usar</h3></div>
      <div class="grid" style="gap:10px;font-size:.88rem">
        <div class="pill" style="justify-content:flex-start;padding:11px 13px">1 · Cadastre o paciente em <b>&nbsp;Pacientes → Novo paciente</b></div>
        <div class="pill" style="justify-content:flex-start;padding:11px 13px">2 · A cada atendimento, clique em <b>&nbsp;Nova consulta</b> e registre queixa, vitais e conduta</div>
        <div class="pill" style="justify-content:flex-start;padding:11px 13px">3 · Consulte a trajetória completa na aba <b>&nbsp;Evolução</b></div>
        <div class="pill" style="justify-content:flex-start;padding:11px 13px">4 · Use <b>&nbsp;Imprimir</b> para gerar o prontuário em PDF</div>
        <div class="pill" style="justify-content:flex-start;padding:11px 13px">5 · A sessão se bloqueia sozinha após 20 min sem uso</div>
      </div>
    </div>
  </div>`;
}

/* ================= MODAIS ================= */
function openModal(html, size) {
  const r = $('#modalRoot');
  r.innerHTML = `<div class="modal-bg" data-close></div><div class="modal ${size || ''}">${html}</div>`;
  r.classList.add('open');
  document.body.style.overflow = 'hidden';
  const first = $('#modalRoot input:not([type=hidden]), #modalRoot textarea');
  if (first) setTimeout(() => first.focus(), 120);
}
function closeModal() {
  $('#modalRoot').classList.remove('open');
  $('#modalRoot').innerHTML = '';
  document.body.style.overflow = '';
}
$('#modalRoot').addEventListener('click', e => { if (e.target.dataset.close !== undefined) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && $('#modalRoot').classList.contains('open') && e.target.tagName !== 'TEXTAREA') {
    const save = $('#modalRoot [data-act="save-patient"], #modalRoot [data-act="save-consulta"]');
    if (save) { e.preventDefault(); save.click(); }
  }
});

function patientForm(id) {
  const p = db.patients.find(x => x.id === id) || {};
  openModal(`
    <div class="modal-head"><h3>${id ? 'Editar dados do paciente' : 'Novo paciente'}</h3>
      <button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-sec"><span>Identificação</span></div>
        <label class="field full"><span>Nome completo *</span><input id="f_nome" value="${esc(p.nome || '')}" placeholder="Nome do paciente"></label>
        <label class="field"><span>Data de nascimento</span><input id="f_nasc" type="date" value="${esc((p.nascimento || '').slice(0, 10))}"></label>
        <label class="field"><span>Sexo</span><select id="f_sexo">${['', 'Feminino', 'Masculino', 'Outro'].map(o => `<option ${p.sexo === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
        <label class="field"><span>CPF</span><input id="f_cpf" value="${esc(p.cpf || '')}" placeholder="000.000.000-00"></label>
        <label class="field"><span>Tipo sanguíneo</span><select id="f_sangue">${['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(o => `<option ${p.tipoSanguineo === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>

        <div class="form-sec"><span>Contato</span></div>
        <label class="field"><span>Telefone</span><input id="f_tel" value="${esc(p.telefone || '')}" placeholder="(00) 00000-0000"></label>
        <label class="field"><span>E-mail</span><input id="f_email" type="email" value="${esc(p.email || '')}"></label>
        <label class="field full"><span>Endereço</span><input id="f_end" value="${esc(p.endereco || '')}"></label>

        <div class="form-sec"><span>Histórico do paciente</span></div>
        <label class="field full"><span>Descrição do histórico</span>
          <textarea id="f_hist" style="min-height:160px" placeholder="Descreva livremente o histórico do paciente: condições prévias, medicações em uso, cirurgias, alergias, hábitos, observações relevantes...">${esc(p.historico || '')}</textarea></label>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-primary" data-act="save-patient" data-id="${id || ''}">${id ? 'Salvar alterações' : 'Cadastrar paciente'}</button>
    </div>`);
}

function consultaForm(pid, cid) {
  const p = db.patients.find(x => x.id === pid);
  if (!p) return;
  const c = (p.consultas || []).find(x => x.id === cid) || { vitais: {} };
  const v = c.vitais || {};
  const tipos = ['Consulta', 'Retorno', 'Urgência', 'Teleconsulta', 'Procedimento', 'Exame'];
  openModal(`
    <div class="modal-head"><h3>${cid ? 'Editar registro clínico' : 'Nova consulta'} · <span class="muted" style="font-size:.85rem">${esc(p.nome)}</span></h3>
      <button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-sec"><span>Atendimento</span></div>
        <label class="field"><span>Data e hora</span><input id="c_data" type="datetime-local" value="${esc(c.data || nowLocal())}"></label>
        <label class="field"><span>Tipo de atendimento</span><select id="c_tipo">${tipos.map(t => `<option ${c.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field full"><span>Queixa principal e história da doença atual *</span>
          <textarea id="c_queixa" placeholder="O que o paciente relata, início, duração, fatores de melhora/piora...">${esc(c.queixa || '')}</textarea></label>

        <div class="form-sec"><span>Sinais vitais</span></div>
        <label class="field"><span>Pressão arterial</span><input id="c_pa" value="${esc(v.pa || '')}" placeholder="120/80"></label>
        <label class="field"><span>Freq. cardíaca (bpm)</span><input id="c_fc" value="${esc(v.fc || '')}" placeholder="72"></label>
        <label class="field"><span>Freq. respiratória (irpm)</span><input id="c_fr" value="${esc(v.fr || '')}" placeholder="16"></label>
        <label class="field"><span>Temperatura (°C)</span><input id="c_temp" value="${esc(v.temp || '')}" placeholder="36.5"></label>
        <label class="field"><span>SpO₂ (%)</span><input id="c_spo2" value="${esc(v.spo2 || '')}" placeholder="98"></label>
        <label class="field"><span>Peso (kg)</span><input id="c_peso" value="${esc(v.peso || '')}" placeholder="70"></label>
        <label class="field"><span>Altura (m)</span><input id="c_altura" value="${esc(v.altura || '')}" placeholder="1.70"></label>
        <div class="field"><span>IMC calculado</span><div id="c_imc" class="input" style="display:flex;align-items:center;gap:8px;background:var(--bg)">—</div></div>

        <div class="form-sec"><span>Avaliação</span></div>
        <label class="field full"><span>Exame físico</span>
          <textarea id="c_exame" placeholder="Estado geral, ausculta, palpação, achados relevantes...">${esc(c.exame || '')}</textarea></label>
        <label class="field full"><span>Hipótese diagnóstica</span><input id="c_hip" value="${esc(c.hipotese || '')}" placeholder="Ex.: Infecção do trato urinário"></label>
        <label class="field"><span>CID-10</span><input id="c_cid" value="${esc(c.cid || '')}" placeholder="Ex.: N39.0"></label>
        <label class="field"><span>Retorno</span><input id="c_ret" type="date" value="${esc(c.retorno || '')}"></label>

        <div class="form-sec"><span>Plano terapêutico</span></div>
        <label class="field full"><span>Conduta</span>
          <textarea id="c_cond" placeholder="Exames solicitados, ajustes, encaminhamentos...">${esc(c.conduta || '')}</textarea></label>
        <label class="field full"><span>Prescrição e orientações</span>
          <textarea id="c_presc" placeholder="Medicamento, dose, via e frequência. Uma linha por item.">${esc(c.prescricao || '')}</textarea></label>
        <label class="field full"><span>Observações adicionais</span><textarea id="c_obs">${esc(c.obs || '')}</textarea></label>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-primary" data-act="save-consulta" data-pid="${pid}" data-id="${cid || ''}">${cid ? 'Salvar alterações' : 'Registrar consulta'}</button>
    </div>`);
  const calc = () => {
    const i = imcOf({ peso: $('#c_peso').value, altura: $('#c_altura').value });
    const cl = imcClass(i);
    $('#c_imc').innerHTML = i == null ? '—'
      : `<b style="font-size:1.05rem">${i}</b><span class="badge ${cl.c === 'good' ? 'b-teal' : cl.c === 'bad' ? 'b-red' : 'b-amber'}">${cl.t}</span>`;
  };
  ['c_peso', 'c_altura'].forEach(k => $('#' + k).addEventListener('input', calc));
  calc();
}

/* ================= AÇÕES ================= */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, id = t.dataset.id;
  if (act === 'new-patient') patientForm();
  else if (act === 'go-patients') nav('patients');
  else if (act === 'go-consultas') nav('consultas');
  else if (act === 'open-patient') goPatient(id);
  else if (act === 'tab') { route.tab = t.dataset.tab; render(); }
  else if (act === 'edit-patient') patientForm(id);
  else if (act === 'new-consulta') consultaForm(route.patientId || id);
  else if (act === 'edit-consulta') consultaForm(route.patientId, id);
  else if (act === 'print') window.print();
  else if (act === 'toggle-acc') t.closest('[data-acc]').classList.toggle('open');
  else if (act === 'save-patient') savePatient(id);
  else if (act === 'save-consulta') saveConsulta(t.dataset.pid, id);
  else if (act === 'del-patient') confirmDelete('Excluir prontuário', 'Todos os registros clínicos deste paciente serão removidos. Esta ação não pode ser desfeita.', () => {
    const p = db.patients.find(x => x.id === id);
    db.patients = db.patients.filter(x => x.id !== id);
    log(`Prontuário de ${p ? p.nome : 'paciente'} excluído.`, '🗑'); saveDB(); toast('Prontuário excluído.', 'info'); nav('patients');
  });
  else if (act === 'del-consulta') confirmDelete('Excluir registro clínico', 'O atendimento será removido do histórico do paciente.', () => {
    const p = db.patients.find(x => x.id === route.patientId);
    p.consultas = (p.consultas || []).filter(c => c.id !== id);
    log(`Registro clínico de ${p.nome} excluído.`, '🗑'); saveDB(); toast('Registro excluído.', 'info'); render();
  });
  else if (act === 'save-profile') saveProfile();
  else if (act === 'save-pass') savePass();
  else if (act === 'export') exportBackup();
  else if (act === 'import') $('#importFile').click();
  else if (act === 'reset') confirmDelete('Restaurar dados de exemplo', 'Todos os dados atuais serão substituídos pelos dados de demonstração.', () => {
    db = seed(); saveDB(); refreshShell(); nav('dashboard'); toast('Dados de exemplo restaurados.', 'info');
  });
});

function savePatient(id) {
  const nome = $('#f_nome').value.trim();
  if (!nome) { toast('Informe o nome do paciente.', 'err'); $('#f_nome').focus(); return; }
  const data = {
    nome, nascimento: $('#f_nasc').value, sexo: $('#f_sexo').value, cpf: $('#f_cpf').value.trim(),
    telefone: $('#f_tel').value.trim(), email: $('#f_email').value.trim(), endereco: $('#f_end').value.trim(),
    tipoSanguineo: $('#f_sangue').value,
    historico: $('#f_hist').value.trim()
  };
  let novoReg = '';
  if (id) {
    const p = db.patients.find(x => x.id === id);
    Object.assign(p, data);
    log(`Dados de ${nome} atualizados.`, '✎');
  } else {
    novoReg = nextRegistro();
    db.patients.push(Object.assign({ id: uid(), registro: novoReg, criadoEm: new Date().toISOString(), consultas: [] }, data));
    log(`Paciente ${nome} cadastrado (prontuário ${novoReg}).`, '＋');
  }
  saveDB(); closeModal(); toast(id ? 'Dados atualizados com sucesso.' : `Paciente cadastrado — prontuário ${novoReg}.`);
  if (id) { route.view = 'patient'; route.patientId = id; render(); } else { patientFilter = ''; nav('patients'); }
}

function saveConsulta(pid, cid) {
  const p = db.patients.find(x => x.id === pid);
  if (!p) return;
  const queixa = $('#c_queixa').value.trim();
  if (!queixa) { toast('Descreva a queixa principal.', 'err'); $('#c_queixa').focus(); return; }
  const reg = {
    id: cid || uid(), data: $('#c_data').value || nowLocal(), tipo: $('#c_tipo').value, queixa,
    vitais: { pa: $('#c_pa').value.trim(), fc: $('#c_fc').value.trim(), fr: $('#c_fr').value.trim(),
      temp: $('#c_temp').value.trim(), spo2: $('#c_spo2').value.trim(), peso: $('#c_peso').value.trim(), altura: $('#c_altura').value.trim() },
    exame: $('#c_exame').value.trim(), hipotese: $('#c_hip').value.trim(), cid: $('#c_cid').value.trim(),
    conduta: $('#c_cond').value.trim(), prescricao: $('#c_presc').value.trim(), retorno: $('#c_ret').value, obs: $('#c_obs').value.trim()
  };
  p.consultas = p.consultas || [];
  if (cid) { const i = p.consultas.findIndex(x => x.id === cid); p.consultas[i] = reg; log(`Registro clínico de ${p.nome} atualizado.`, '✎'); }
  else { p.consultas.push(reg); log(`Nova consulta registrada para ${p.nome}.`, '✚'); }
  saveDB(); closeModal();
  toast(cid ? 'Registro clínico atualizado.' : 'Consulta registrada com sucesso.');
  route.patientId = pid; route.view = 'patient'; route.tab = 'consultas'; render();
}

function confirmDelete(title, msg, onOk) {
  openModal(`<div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body"><p style="line-height:1.65">${esc(msg)}</p></div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button>
    <button class="btn btn-danger" id="confirmOk">Confirmar exclusão</button></div>`, 'sm');
  $('#confirmOk').addEventListener('click', () => { closeModal(); onOk(); });
}

function saveProfile() {
  db.doctor.name = $('#setName').value.trim() || db.doctor.name;
  db.doctor.crm = $('#setCrm').value.trim();
  db.doctor.especialidade = $('#setEsp').value.trim();
  db.doctor.clinic = $('#setClinic').value.trim();
  saveDB(); refreshShell(); toast('Dados profissionais atualizados.');
}
function savePass() {
  const oldp = $('#setPassOld').value, n1 = $('#setPassNew').value, n2 = $('#setPassNew2').value;
  const user = $('#setUser').value.trim().toLowerCase();
  if (!user) { toast('Informe a usuária de acesso.', 'err'); return; }
  if (hash(oldp) !== db.doctor.pass) { toast('Senha atual incorreta.', 'err'); return; }
  if (n1.length < 6) { toast('A nova senha deve ter ao menos 6 caracteres.', 'err'); return; }
  if (n1 !== n2) { toast('As senhas não conferem.', 'err'); return; }
  db.doctor.user = user; db.doctor.pass = hash(n1);
  saveDB(); $('#setPassOld').value = $('#setPassNew').value = $('#setPassNew2').value = '';
  toast('Usuária e senha atualizadas com sucesso.');
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'backup-prontuario-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); URL.revokeObjectURL(a.href);
  toast('Backup exportado.', 'info');
}
document.addEventListener('change', e => {
  if (e.target.id !== 'importFile') return;
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.patients || !d.doctor) throw 0;
      db = d; if (!db.activity) db.activity = [];
      saveDB(); refreshShell(); nav('dashboard'); toast('Backup importado com sucesso.');
    } catch (err) { toast('Arquivo inválido.', 'err'); }
  };
  r.readAsText(f); e.target.value = '';
});

/* ================= BUSCA GLOBAL ================= */
const gs = $('#globalSearch'), gr = $('#searchResults');
gs.addEventListener('input', () => {
  const q = gs.value.trim().toLowerCase();
  if (q.length < 2) { gr.classList.add('hidden'); return; }
  const res = db.patients.filter(p => [p.nome, p.cpf, p.telefone, p.registro].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 7);
  gr.innerHTML = res.length ? res.map(p => `<button data-id="${p.id}" data-goto>
      <div class="avatar" style="width:34px;height:34px;border-radius:11px;font-size:.78rem">${initials(p.nome)}</div>
      <div style="min-width:0"><div style="font-size:.88rem;font-weight:600">${esc(p.nome)}</div>
      <div class="tiny muted">${esc(p.registro || '')}${idade(p.nascimento) != null ? ' · ' + idade(p.nascimento) + ' anos' : ''}</div></div>
    </button>`).join('') : `<div class="empty tiny" style="padding:20px">Nenhum paciente encontrado.</div>`;
  gr.classList.remove('hidden');
});
gr.addEventListener('click', e => {
  const b = e.target.closest('[data-goto]'); if (!b) return;
  gs.value = ''; gr.classList.add('hidden'); goPatient(b.dataset.id);
});
document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) gr.classList.add('hidden'); });

/* ================= TEMA ================= */
const THEME_KEY = 'prontuario.theme';
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set(THEME_KEY, t);
  $('#themeBtn').textContent = t === 'dark' ? '☼︎' : '☾';
}
$('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

/* ================= FILTRO DE PACIENTES ================= */
document.addEventListener('input', e => {
  if (e.target.id === 'patientSearch') {
    patientFilter = e.target.value;
    const pos = e.target.selectionStart;
    $('#content').innerHTML = viewPatients();
    const inp = $('#patientSearch'); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'patientSort') { patientSort = e.target.value; render(); }
});

/* ================= INIT ================= */
loadDB();
applyTheme(store.get(THEME_KEY) || 'light');
refreshShell();
if (session()) { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); refreshShell(); nav('dashboard'); startLockTimer(); }
else {
  if (store.get('prontuario.remember')) { $('#loginUser').value = db.doctor.user; setTimeout(() => $('#loginPass').focus(), 600); }
}