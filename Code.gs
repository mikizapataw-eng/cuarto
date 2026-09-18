/**
 * KARDEX DIGITAL DE AULA — Backend (Google Apps Script + Google Sheets)
 * ----------------------------------------------------------------------
 * Cómo instalar:
 * 1. Sube el archivo KardexDigital_DB.xlsx a tu Google Drive y ábrelo con
 *    Google Sheets (se convierte automáticamente).
 * 2. Dentro de esa hoja: Extensiones > Apps Script.
 * 3. Borra el contenido de Code.gs que aparece por defecto y pega TODO
 *    este archivo.
 * 4. Implementar > Nueva implementación > tipo "Aplicación web".
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier usuario (o "Cualquier usuario con
 *        cuenta de Google" si prefieres restringirlo)
 * 5. Copia la URL que te da ("Web app URL") y pégala como API_URL en
 *    app.js (frontend).
 * 6. Cada vez que edites este código, tienes que crear una NUEVA
 *    implementación (o "Manage deployments" > editar la existente) para
 *    que los cambios se reflejen en la URL publicada.
 */

const SHEETS = {
  DOCENTES: 'Docentes',
  ESTUDIANTES: 'Estudiantes',
  ASIGNACION: 'AsignacionDocenteMateria',
  STAFF: 'UsuariosStaff',
  PADRES: 'Padres',
  TIPOS: 'TiposNovedad',
  NOVEDADES: 'Novedades'
};

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheetData_(name) {
  const sheet = ss_().getSheetByName(name);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter(row => row[0] !== '' && row[0] !== null)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) { return jsonOut_({ success: true, data: data }); }
function fail_(msg) { return jsonOut_({ success: false, error: msg }); }

function doGet(e) {
  try {
    return route_(e.parameter.action, e.parameter);
  } catch (err) {
    return fail_(String(err));
  }
}

function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action || (e.parameter && e.parameter.action);
    return route_(action, body);
  } catch (err) {
    return fail_(String(err));
  }
}

function route_(action, params) {
  switch (action) {
    case 'login': return login_(params);
    case 'getCursosDocente': return getCursosDocente_(params);
    case 'getEstudiantesCurso': return getEstudiantesCurso_(params);
    case 'getCursos': return getCursos_();
    case 'getTodosEstudiantes': return ok_(sheetData_(SHEETS.ESTUDIANTES));
    case 'buscarEstudiantes': return buscarEstudiantes_(params);
    case 'getTiposNovedad': return getTiposNovedad_(params);
    case 'getKardexCurso': return getKardexCurso_(params);
    case 'getKardexEstudiante': return getKardexEstudiante_(params);
    case 'registrarNovedades': return registrarNovedades_(params);
    default: return fail_('Acción no reconocida: ' + action);
  }
}

/* ---------------- LOGIN ---------------- */
// tipo: 'docente' | 'staff' | 'padre'
function login_(p) {
  const usuario = String(p.usuario || '').trim().toLowerCase();
  const password = String(p.password || '');

  if (p.tipo === 'docente') {
    const docentes = sheetData_(SHEETS.DOCENTES);
    const d = docentes.find(r => String(r.USUARIO).toLowerCase() === usuario && String(r.PASSWORD) === password);
    if (!d) return fail_('Usuario o contraseña incorrectos.');
    return ok_({ rol: 'docente', cod_doc: d.COD_DOC, nombre: d.NOMBRE_DOC, usuario: d.USUARIO });
  }

  if (p.tipo === 'staff') {
    const staff = sheetData_(SHEETS.STAFF);
    const s = staff.find(r => String(r.USUARIO).toLowerCase() === usuario && String(r.PASSWORD) === password);
    if (!s) return fail_('Usuario o contraseña incorrectos.');
    return ok_({ rol: s.ROL, nombre: s.NOMBRE, usuario: s.USUARIO });
  }

  if (p.tipo === 'padre') {
    const padres = sheetData_(SHEETS.PADRES);
    const pa = padres.find(r => String(r.USUARIO).toLowerCase() === usuario && String(r.PASSWORD) === password);
    if (!pa) return fail_('Usuario o contraseña incorrectos.');
    const codigos = String(pa.COD_EST_HIJOS).split(',').map(c => c.trim()).filter(Boolean);
    const estudiantes = sheetData_(SHEETS.ESTUDIANTES).filter(e => codigos.indexOf(String(e.COD_EST)) !== -1);
    return ok_({ rol: 'padre', nombre: pa.NOMBRE, usuario: pa.USUARIO, hijos: estudiantes });
  }

  return fail_('Tipo de usuario no válido.');
}

/* ---------------- DOCENTE: cursos y materias asignadas ---------------- */
function getCursosDocente_(p) {
  const cod_doc = String(p.cod_doc);
  const asign = sheetData_(SHEETS.ASIGNACION).filter(a => String(a.COD_DOC) === cod_doc);
  return ok_(asign.map(a => ({ curso: a.CURSO, materia: a.MATERIA })));
}

/* ---------------- Estudiantes de un curso ---------------- */
function getEstudiantesCurso_(p) {
  const curso = String(p.curso);
  const est = sheetData_(SHEETS.ESTUDIANTES)
    .filter(e => String(e.CURSO) === curso)
    .sort((a, b) => String(a.APELLIDOS).localeCompare(String(b.APELLIDOS)));
  return ok_(est);
}

/* ---------------- Lista de todos los cursos (para regente/secretaría/dirección) ---------------- */
function getCursos_() {
  const est = sheetData_(SHEETS.ESTUDIANTES);
  const cursos = [...new Set(est.map(e => String(e.CURSO)))].sort();
  return ok_(cursos);
}

/* ---------------- Buscar estudiante por nombre (secretaría/dirección) ---------------- */
function buscarEstudiantes_(p) {
  const q = String(p.q || '').toLowerCase().trim();
  if (!q) return ok_([]);
  const est = sheetData_(SHEETS.ESTUDIANTES).filter(e =>
    (String(e.APELLIDOS) + ' ' + String(e.NOMBRES)).toLowerCase().indexOf(q) !== -1 ||
    String(e.COD_EST).indexOf(q) !== -1
  );
  return ok_(est.slice(0, 30));
}

/* ---------------- Catálogo de tipos de novedad por categoría ---------------- */
function getTiposNovedad_(p) {
  const categoria = String(p.categoria);
  const tipos = sheetData_(SHEETS.TIPOS).filter(t => t.CATEGORIA === categoria).map(t => t.TIPO);
  return ok_(tipos);
}

/* ---------------- Kardex de un curso (visible al abrir un curso) ----------------
   Regla: se ven TODAS las novedades de regente/secretaría/dirección, pero de
   categoría 'docente' solo las que registró el usuario actual (si se pasa
   usuario_actual). Si no se pasa (ej. regente/secretaría/dirección viendo el
   curso), se ven todas menos las de otros docentes salvo que soloPropias=false. */
function getKardexCurso_(p) {
  const curso = String(p.curso);
  const usuarioActual = p.usuario_actual ? String(p.usuario_actual).toLowerCase() : null;
  let nov = sheetData_(SHEETS.NOVEDADES).filter(n => String(n.CURSO) === curso);

  if (usuarioActual) {
    nov = nov.filter(n =>
      n.CATEGORIA !== 'docente' ||
      String(n.REGISTRADO_POR_USUARIO).toLowerCase() === usuarioActual
    );
  }
  nov.sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP));
  return ok_(nov);
}

/* ---------------- Kardex completo de un estudiante (para padres) ---------------- */
function getKardexEstudiante_(p) {
  const cod_est = String(p.cod_est);
  let nov = sheetData_(SHEETS.NOVEDADES).filter(n => String(n.COD_EST) === cod_est);
  nov.sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP));
  return ok_(nov);
}

/* ---------------- Registrar novedades (batch, para sincronizar la cola offline) ---------------- */
function registrarNovedades_(p) {
  const lista = p.novedades || [];
  if (!lista.length) return fail_('Nada que registrar.');

  const sheet = ss_().getSheetByName(SHEETS.NOVEDADES);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let lastRow = sheet.getLastRow();
    const existingIds = new Set(
      sheet.getRange(2, 1, Math.max(lastRow - 1, 0), 1).getValues().flat().map(String)
    );
    const rows = [];
    const resultados = [];
    lista.forEach(n => {
      // n.id_local viene del frontend (evita duplicados si se reintenta el sync)
      const id = n.id_local || Utilities.getUuid();
      if (existingIds.has(String(id))) {
        resultados.push({ id_local: n.id_local, estado: 'duplicado' });
        return;
      }
      const now = new Date();
      rows.push([
        id,
        now.toISOString(),
        n.fecha || Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        n.cod_est,
        n.curso,
        n.categoria,
        n.tipo,
        n.detalle || '',
        n.materia || '',
        n.usuario,
        n.nombre
      ]);
      existingIds.add(String(id));
      resultados.push({ id_local: n.id_local, estado: 'guardado', id: id });
    });
    if (rows.length) {
      sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    return ok_(resultados);
  } finally {
    lock.releaseLock();
  }
}
