/* =========================================================================
   KARDEX DIGITAL DE AULA — Frontend
   =========================================================================
   IMPORTANTE: reemplaza API_URL con la "Web app URL" que te da Apps Script
   al implementar Code.gs (Implementar > Nueva implementación).
   ========================================================================= */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzFT_100Elhwt7l2tq2KTEOE9Px51TL73cS62_pM-2e5vpUcswcLtX7v361-EAw5oBiSg/exec'
};

/* ---------------- almacenamiento local ---------------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  remove(key) { localStorage.removeItem(key); }
};

const KEYS = {
  SESSION: 'kd_session',
  CREDENCIALES: 'kd_credenciales', // credenciales ya validadas una vez, para login offline
  QUEUE: 'kd_queue',
  CACHE: 'kd_cache'
};

let session = store.get(KEYS.SESSION, null);
let queue = store.get(KEYS.QUEUE, []);
let cache = store.get(KEYS.CACHE, {});

function saveQueue() { store.set(KEYS.QUEUE, queue); renderPendingCount(); }
function saveCache() { store.set(KEYS.CACHE, cache); }

/* ---------------- llamadas al backend ---------------- */
function apiCall(action, params) {
  if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('PEGA_AQUI') !== -1) {
    return Promise.resolve({ success: false, error: 'API_URL no configurada todavía.' });
  }
  return fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action }, params))
  })
    .then(r => r.json())
    .catch(err => ({ success: false, error: 'offline' }));
}

/* ---------------- estado de conexión ---------------- */
function actualizarBadgeConexion() {
  const el = document.getElementById('connStatus');
  if (navigator.onLine) {
    el.textContent = 'En línea';
    el.className = 'badge online';
  } else {
    el.textContent = 'Sin conexión';
    el.className = 'badge offline';
  }
}
window.addEventListener('online', actualizarBadgeConexion);
window.addEventListener('offline', actualizarBadgeConexion);

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ---------------- vistas ---------------- */
function mostrarVista(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

/* =========================================================================
   LOGIN
   ========================================================================= */
let tipoSeleccionado = 'docente';

document.getElementById('loginTabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('#loginTabs .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  tipoSeleccionado = btn.dataset.tipo;
});

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const usuario = document.getElementById('loginUsuario').value.trim();
  const password = document.getElementById('loginPassword').value;
  const msgEl = document.getElementById('loginMsg');
  msgEl.textContent = 'Ingresando...';

  const res = await apiCall('login', { tipo: tipoSeleccionado, usuario, password });

  if (res.success) {
    session = Object.assign({ tipo: tipoSeleccionado }, res.data);
    store.set(KEYS.SESSION, session);
    // guardamos credenciales localmente para permitir login sin internet la próxima vez
    const creds = store.get(KEYS.CREDENCIALES, {});
    creds[tipoSeleccionado + ':' + usuario.toLowerCase()] = { usuario, password, sessionData: session };
    store.set(KEYS.CREDENCIALES, creds);
    msgEl.textContent = '';
    iniciarSesion();
    return;
  }

  // si el fallo es por falta de conexión, intentamos con credenciales guardadas
  if (res.error === 'offline') {
    const creds = store.get(KEYS.CREDENCIALES, {});
    const key = tipoSeleccionado + ':' + usuario.toLowerCase();
    const guardado = creds[key];
    if (guardado && guardado.password === password) {
      session = guardado.sessionData;
      store.set(KEYS.SESSION, session);
      msgEl.textContent = '';
      toast('Ingresaste en modo sin conexión.');
      iniciarSesion();
      return;
    }
    msgEl.textContent = 'Sin conexión y sin datos guardados de este usuario en este dispositivo.';
    return;
  }

  msgEl.textContent = res.error || 'No se pudo ingresar.';
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  session = null;
  store.remove(KEYS.SESSION);
  document.getElementById('topbar').classList.add('hidden');
  mostrarVista('view-login');
});

function iniciarSesion() {
  document.getElementById('topbar').classList.remove('hidden');
  document.getElementById('userLabel').textContent = `${session.nombre} (${session.rol})`;
  document.getElementById('loginForm').reset();

  if (session.rol === 'docente') { mostrarVista('view-docente'); initDocente(); }
  else if (['regente', 'secretaria', 'direccion'].includes(session.rol)) { mostrarVista('view-staff'); initStaff(); }
  else if (session.rol === 'padre') { mostrarVista('view-padre'); initPadre(); }
}

/* =========================================================================
   DOCENTE
   ========================================================================= */
async function initDocente() {
  const sel = document.getElementById('selCursoMateria');
  sel.innerHTML = '<option value="">Cargando...</option>';

  let cursos = cache['cursosDocente:' + session.cod_doc];
  const res = await apiCall('getCursosDocente', { cod_doc: session.cod_doc });
  if (res.success) {
    cursos = res.data;
    cache['cursosDocente:' + session.cod_doc] = cursos;
    saveCache();
  }
  if (!cursos) { sel.innerHTML = '<option value="">Sin datos guardados. Conéctate una vez.</option>'; return; }

  sel.innerHTML = '<option value="">-- selecciona --</option>' +
    cursos.map((c, i) => `<option value="${i}">${c.curso} — ${c.materia}</option>`).join('');
  sel.onchange = () => {
    if (sel.value === '') { document.getElementById('cardListaDocente').classList.add('hidden'); return; }
    const c = cursos[sel.value];
    cargarEstudiantesDocente(c.curso, c.materia);
  };
  document.getElementById('cardListaDocente').classList.add('hidden');
}

async function cargarEstudiantesDocente(curso, materia) {
  document.getElementById('cursoMateriaTitulo').innerHTML =
    `${curso} — ${materia} <button class="btn small" id="btnVerKardexCurso">Ver kardex del curso</button>`;
  document.getElementById('cardListaDocente').classList.remove('hidden');

  let estudiantes = cache['estudiantes:' + curso];
  const res = await apiCall('getEstudiantesCurso', { curso });
  if (res.success) { estudiantes = res.data; cache['estudiantes:' + curso] = estudiantes; saveCache(); }
  if (!estudiantes) { toast('No hay datos guardados de este curso todavía.'); return; }

  let tipos = cache['tipos:docente'];
  const resTipos = await apiCall('getTiposNovedad', { categoria: 'docente' });
  if (resTipos.success) { tipos = resTipos.data; cache['tipos:docente'] = tipos; saveCache(); }

  renderListaEstudiantes('listaEstudiantesDocente', estudiantes, est => {
    abrirModalNovedad(est, 'docente', curso, materia, tipos || []);
  });

  document.getElementById('filtroAlumnoDocente').oninput = e => {
    filtrarLista('listaEstudiantesDocente', e.target.value);
  };

  document.getElementById('btnVerKardexCurso').onclick = () => verKardexCurso(curso, true);
}

/* =========================================================================
   STAFF (regente / secretaría / dirección)
   ========================================================================= */
const CATEGORIA_STAFF = { regente: 'regente', secretaria: 'secretaria', direccion: 'direccion' };
const TITULO_STAFF = {
  regente: 'Registrar atraso',
  secretaria: 'Registrar permiso',
  direccion: 'Registrar suspensión'
};

async function initStaff() {
  document.getElementById('staffTitulo').textContent = TITULO_STAFF[session.rol] || 'Registrar novedad';

  document.getElementById('btnModoCurso').onclick = () => cambiarModoStaff('curso');
  document.getElementById('btnModoBuscar').onclick = () => cambiarModoStaff('buscar');
  cambiarModoStaff('curso');

  const sel = document.getElementById('selCursoStaff');
  sel.innerHTML = '<option value="">Cargando...</option>';
  let cursos = cache['cursos'];
  const res = await apiCall('getCursos', {});
  if (res.success) { cursos = res.data; cache['cursos'] = cursos; saveCache(); }
  if (!cursos) { sel.innerHTML = '<option value="">Sin datos guardados. Conéctate una vez.</option>'; }
  else {
    sel.innerHTML = '<option value="">-- selecciona un curso --</option>' + cursos.map(c => `<option value="${c}">${c}</option>`).join('');
    sel.onchange = () => { if (sel.value) cargarEstudiantesStaff(sel.value); else document.getElementById('cardListaStaff').classList.add('hidden'); };
  }

  // cachear lista completa de estudiantes para poder buscar offline
  const resTodos = await apiCall('getTodosEstudiantes', {});
  if (resTodos.success) { cache['todosEstudiantes'] = resTodos.data; saveCache(); }

  let debounceT;
  document.getElementById('buscarAlumnoStaff').oninput = e => {
    clearTimeout(debounceT);
    debounceT = setTimeout(() => buscarStaff(e.target.value), 300);
  };
}

function cambiarModoStaff(modo) {
  document.getElementById('btnModoCurso').classList.toggle('active', modo === 'curso');
  document.getElementById('btnModoBuscar').classList.toggle('active', modo === 'buscar');
  document.getElementById('staffPorCurso').classList.toggle('hidden', modo !== 'curso');
  document.getElementById('staffBuscar').classList.toggle('hidden', modo !== 'buscar');
  document.getElementById('cardListaStaff').classList.add('hidden');
}

async function buscarStaff(q) {
  q = q.trim();
  if (!q) { document.getElementById('cardListaStaff').classList.add('hidden'); return; }

  let resultados = null;
  const res = await apiCall('buscarEstudiantes', { q });
  if (res.success) resultados = res.data;
  else {
    const todos = cache['todosEstudiantes'] || [];
    const ql = q.toLowerCase();
    resultados = todos.filter(e =>
      (String(e.APELLIDOS) + ' ' + String(e.NOMBRES)).toLowerCase().includes(ql) ||
      String(e.COD_EST).includes(ql)
    ).slice(0, 30);
  }

  document.getElementById('cardListaStaff').classList.remove('hidden');
  const tipos = await getTiposStaffCache();
  renderListaEstudiantes('listaEstudiantesStaff', resultados, est => {
    abrirModalNovedad(est, session.rol, est.CURSO, '', tipos);
  });
}

async function cargarEstudiantesStaff(curso) {
  document.getElementById('cardListaStaff').classList.remove('hidden');
  let estudiantes = cache['estudiantes:' + curso];
  const res = await apiCall('getEstudiantesCurso', { curso });
  if (res.success) { estudiantes = res.data; cache['estudiantes:' + curso] = estudiantes; saveCache(); }
  if (!estudiantes) { toast('No hay datos guardados de este curso todavía.'); return; }

  const tipos = await getTiposStaffCache();
  renderListaEstudiantes('listaEstudiantesStaff', estudiantes, est => {
    abrirModalNovedad(est, session.rol, curso, '', tipos);
  });
}

async function getTiposStaffCache() {
  let tipos = cache['tipos:' + session.rol];
  const res = await apiCall('getTiposNovedad', { categoria: session.rol });
  if (res.success) { tipos = res.data; cache['tipos:' + session.rol] = tipos; saveCache(); }
  return tipos || [];
}

/* =========================================================================
   PADRE
   ========================================================================= */
function initPadre() {
  const sel = document.getElementById('selHijo');
  const hijos = session.hijos || [];
  sel.innerHTML = '<option value="">-- selecciona --</option>' +
    hijos.map((h, i) => `<option value="${i}">${h.APELLIDOS} ${h.NOMBRES} (${h.CURSO})</option>`).join('');
  sel.onchange = () => {
    if (sel.value === '') { document.getElementById('cardKardexPadre').classList.add('hidden'); return; }
    verKardexHijo(hijos[sel.value]);
  };
}

async function verKardexHijo(hijo) {
  document.getElementById('cardKardexPadre').classList.remove('hidden');
  document.getElementById('kardexPadreTitulo').textContent = `Kardex de ${hijo.APELLIDOS} ${hijo.NOMBRES}`;
  const lista = document.getElementById('listaKardexPadre');
  lista.innerHTML = '<li>Cargando...</li>';

  let nov = cache['kardexEst:' + hijo.COD_EST];
  const res = await apiCall('getKardexEstudiante', { cod_est: hijo.COD_EST });
  if (res.success) { nov = res.data; cache['kardexEst:' + hijo.COD_EST] = nov; saveCache(); }

  if (!nov) { lista.innerHTML = '<li>No hay datos guardados todavía. Conéctate a internet una vez.</li>'; return; }
  renderKardex(lista, nov);
}

/* =========================================================================
   KARDEX DE CURSO (docente / staff)
   ========================================================================= */
let volverA = null;
async function verKardexCurso(curso, esDocente) {
  volverA = () => { mostrarVista(session.rol === 'docente' ? 'view-docente' : 'view-staff'); };
  mostrarVista('view-kardex-curso');
  document.getElementById('kardexCursoTitulo').textContent = `Kardex del curso ${curso}`;
  const lista = document.getElementById('listaKardexCurso');
  lista.innerHTML = '<li>Cargando...</li>';

  const params = { curso };
  if (esDocente) params.usuario_actual = session.usuario;

  let nov = cache['kardexCurso:' + curso];
  const res = await apiCall('getKardexCurso', params);
  if (res.success) { nov = res.data; cache['kardexCurso:' + curso] = nov; saveCache(); }

  if (!nov) { lista.innerHTML = '<li>No hay datos guardados todavía. Conéctate a internet una vez.</li>'; return; }
  renderKardex(lista, nov);
}
document.getElementById('btnVolverKardex').addEventListener('click', () => { if (volverA) volverA(); });

/* =========================================================================
   RENDER helpers
   ========================================================================= */
function renderListaEstudiantes(ulId, estudiantes, onClick) {
  const ul = document.getElementById(ulId);
  ul.innerHTML = '';
  estudiantes.forEach(est => {
    const li = document.createElement('li');
    const pendientes = queue.filter(q => String(q.cod_est) === String(est.COD_EST)).length;
    li.innerHTML = `<div><div class="student-name">${est.APELLIDOS}, ${est.NOMBRES}</div>
      <div class="student-sub">${est.CURSO} · Cod. ${est.COD_EST}</div></div>
      ${pendientes ? `<span class="pending-dot" title="${pendientes} novedad(es) pendiente(s) de sincronizar">●</span>` : ''}`;
    li.onclick = () => onClick(est);
    ul.appendChild(li);
  });
  if (!estudiantes.length) ul.innerHTML = '<li>Sin resultados.</li>';
}

function filtrarLista(ulId, texto) {
  const t = texto.toLowerCase();
  document.querySelectorAll(`#${ulId} > li`).forEach(li => {
    li.style.display = li.textContent.toLowerCase().includes(t) ? '' : 'none';
  });
}

const TAG_LABEL = { docente: 'Docente', regente: 'Atraso', secretaria: 'Permiso', direccion: 'Dirección' };

function renderKardex(ul, novedades) {
  ul.innerHTML = '';
  if (!novedades.length) { ul.innerHTML = '<li>Sin novedades registradas.</li>'; return; }
  novedades.forEach(n => {
    const li = document.createElement('li');
    const fecha = (n.TIMESTAMP || n.FECHA || '').toString().slice(0, 10);
    li.innerHTML = `
      <span class="kardex-tag tag-${n.CATEGORIA}">${n.TIPO}</span>
      <span class="kardex-detalle">${n.DETALLE || ''}</span>
      <span class="kardex-meta">${fecha} ${n.MATERIA ? '· ' + n.MATERIA : ''} · ${n.REGISTRADO_POR_NOMBRE || ''}</span>`;
    ul.appendChild(li);
  });
}

/* =========================================================================
   MODAL registrar novedad
   ========================================================================= */
let modalContexto = null;

function abrirModalNovedad(est, categoria, curso, materia, tipos) {
  modalContexto = { est, categoria, curso, materia };
  document.getElementById('modalAlumnoNombre').textContent = `${est.APELLIDOS}, ${est.NOMBRES}`;
  const sel = document.getElementById('modalTipo');
  sel.innerHTML = (tipos || []).map(t => `<option value="${t}">${t}</option>`).join('');
  document.getElementById('modalDetalle').value = '';
  document.getElementById('modalNovedad').classList.remove('hidden');
}

document.getElementById('modalCancelar').addEventListener('click', () => {
  document.getElementById('modalNovedad').classList.add('hidden');
});

document.getElementById('modalGuardar').addEventListener('click', () => {
  const { est, categoria, curso, materia } = modalContexto;
  const tipo = document.getElementById('modalTipo').value;
  const detalle = document.getElementById('modalDetalle').value.trim();

  queue.push({
    id_local: 'loc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    cod_est: est.COD_EST,
    curso,
    categoria,
    tipo,
    detalle,
    materia,
    usuario: session.usuario,
    nombre: session.nombre,
    fecha: new Date().toISOString().slice(0, 10)
  });
  saveQueue();
  document.getElementById('modalNovedad').classList.add('hidden');
  toast('Guardado en este dispositivo. Presiona "Sincronizar" cuando tengas internet.');

  // refresca el punto naranja en la lista visible
  if (categoria === 'docente') document.querySelectorAll('#listaEstudiantesDocente > li').forEach(() => {});
  refrescarListasVisibles();
});

function refrescarListasVisibles() {
  ['listaEstudiantesDocente', 'listaEstudiantesStaff'].forEach(id => {
    const ul = document.getElementById(id);
    if (ul) ul.querySelectorAll('li').forEach(li => {}); // los puntos se recalculan al re-renderizar la lista
  });
}

/* =========================================================================
   SINCRONIZACIÓN
   ========================================================================= */
function renderPendingCount() {
  const el = document.getElementById('pendingCount');
  if (queue.length > 0) { el.textContent = queue.length; el.classList.remove('hidden'); }
  else { el.classList.add('hidden'); }
}

document.getElementById('syncBtn').addEventListener('click', sincronizar);

async function sincronizar() {
  if (!queue.length) { toast('No hay novedades pendientes.'); return; }
  toast('Sincronizando...');
  const res = await apiCall('registrarNovedades', { novedades: queue });
  if (!res.success) {
    toast('Sin conexión. Se reintentará más tarde.');
    return;
  }
  const guardadosIds = new Set(
    res.data.filter(r => r.estado === 'guardado' || r.estado === 'duplicado').map(r => r.id_local)
  );
  queue = queue.filter(q => !guardadosIds.has(q.id_local));
  saveQueue();
  toast('Sincronizado correctamente.');

  // refresca vistas de kardex abiertas para reflejar lo recién subido
  cache = {}; // fuerza a repedir del servidor la próxima vez que se abra cada curso/estudiante
  saveCache();
  if (session) {
    if (session.rol === 'docente') initDocente();
    else if (session.rol === 'padre') initPadre();
    else initStaff();
  }
}

/* =========================================================================
   ARRANQUE
   ========================================================================= */
actualizarBadgeConexion();
renderPendingCount();
if (session) iniciarSesion(); else mostrarVista('view-login');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
