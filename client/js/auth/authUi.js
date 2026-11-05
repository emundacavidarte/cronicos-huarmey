/**
 * authUi.js
 * T-03b: pantalla de acceso, chip del usuario, cierre de sesión, elementos visibles según el rol
 * (atributo data-permiso) y pantalla del Administrador para registrar usuarios.
 * La lógica de sesión y el token viven en session.js; aquí solo hay interfaz.
 * Ocultar un botón es comodidad: quien decide si una acción se permite es siempre el servidor (403).
 */
(function (root) {
  'use strict';

  const ROL_TXT = { ADMIN: 'Administrador', COORDINADOR: 'Coordinador', DIRECTOR: 'Director' };
  const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

  function byId(id) { return document.getElementById(id); }

  function esc(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function create(deps) {
    const app = deps.app;
    const session = app.session;
    const Perm = root.AuthSession;
    let redes = null;
    let usuarios = [];
    let objetivoClave = null;
    let enTransito = false;
    let avisoMostrado = false;

    function permisosActuales() {
      const u = session.getUser();
      return Object.assign({ sesion: !!u }, Perm.permisosDe(u ? u.role : null));
    }

    /** Muestra u oculta cada elemento con data-permiso y rellena el chip del usuario. */
    function aplicarRol() {
      const u = session.getUser();
      const p = permisosActuales();
      document.body.classList.toggle('sesion-activa', !!u);
      document.body.dataset.rol = u ? u.role : '';
      document.querySelectorAll('[data-permiso]').forEach(el => {
        el.classList.toggle('perm-hidden', p[el.dataset.permiso] !== true);
      });
      const nombre = byId('user-chip-name');
      const rol = byId('user-chip-role');
      const chip = byId('user-chip');
      if (nombre) nombre.textContent = u ? u.nombre : '';
      if (rol) rol.textContent = u ? (ROL_TXT[u.role] + (u.red ? ' · ' + u.red : '')) : '';
      if (chip) chip.title = u ? 'Usuario: ' + u.username : '';
    }

    function setInert(valor) {
      const cont = document.querySelector('.app-container');
      if (cont) cont.toggleAttribute('inert', valor);
    }

    function mostrarLogin(mensaje) {
      cerrarUsuarios();
      aplicarRol();
      const overlay = byId('login-overlay');
      if (!overlay) return;
      overlay.classList.add('active');
      setInert(true);
      const err = byId('login-error');
      const us = byId('login-username');
      const pw = byId('login-password');
      const btn = byId('login-submit');
      if (err) err.textContent = mensaje || '';
      if (pw) pw.value = '';
      if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
      if (us && pw) (us.value ? pw : us).focus();
    }

    function entrar() {
      const overlay = byId('login-overlay');
      if (overlay) overlay.classList.remove('active');
      setInert(false);
      aplicarRol();
      app.onLogin(session.getUser());
    }

    async function enviarLogin(ev) {
      ev.preventDefault();
      if (enTransito) return;
      const us = byId('login-username');
      const pw = byId('login-password');
      const err = byId('login-error');
      const btn = byId('login-submit');
      const usuario = (us.value || '').trim();
      const clave = pw.value || '';
      if (!usuario || !clave) {
        err.textContent = 'Ingrese su usuario y su clave.';
        return;
      }
      enTransito = true;
      btn.disabled = true;
      btn.textContent = 'Verificando...';
      err.textContent = '';
      const r = await session.login(usuario, clave);
      enTransito = false;
      pw.value = '';
      if (r.ok) {
        us.value = '';
        entrar();
        return;
      }
      btn.disabled = false;
      btn.textContent = 'Ingresar';
      err.textContent = r.message;
      pw.focus();
    }

    function salir() {
      session.logout();
      app.limpiarSesion();
      mostrarLogin('Sesión cerrada.');
    }

    /** El token venció o el servidor lo rechazó (401): se borra todo y se vuelve a pedir el acceso. */
    function alVencer() {
      avisoMostrado = true;
      app.limpiarSesion();
      mostrarLogin('Su sesión venció o fue cerrada. Ingrese nuevamente.');
    }

    // ---------- Pantalla del Administrador: usuarios ----------
    function endpoints() { return (root.APP_CONFIG && root.APP_CONFIG.getApi()) || {}; }

    function setMsgUsuarios(texto, ok) {
      const el = byId('usuarios-msg');
      if (!el) return;
      el.textContent = texto || '';
      el.className = 'usuarios-msg ' + (texto ? (ok ? 'ok' : 'error') : '');
    }

    async function leerError(res, porDefecto) {
      try {
        const b = await res.json();
        const d = b && b.issue && b.issue[0] && b.issue[0].diagnostics;
        if (typeof d === 'string' && d) return d;
      } catch (e) { /* sin cuerpo */ }
      return porDefecto;
    }

    async function cargarRedes() {
      if (redes) return redes;
      const res = await session.authFetch(endpoints().AUTH_REDES);
      if (!res.ok) throw new Error(await leerError(res, 'No se pudo cargar la lista de redes.'));
      const b = await res.json();
      redes = Array.isArray(b.data) ? b.data : [];
      const sel = byId('nuevo-usuario-red');
      if (sel) {
        sel.innerHTML = '<option value="">-- Seleccione la red (RIS) --</option>' +
          redes.map(r => `<option value="${esc(r.nombre)}">${esc(r.etiqueta)}</option>`).join('');
      }
      await cargarEstablecimientos();
      return redes;
    }

    let establecimientos = [];

    async function cargarEstablecimientos() {
      try {
        const res = await session.authFetch(String(endpoints().API_USERS).replace(/\/users$/, '/establishments'));
        if (!res.ok) return;
        const b = await res.json();
        establecimientos = Array.isArray(b.data) ? b.data : [];
      } catch (e) { establecimientos = []; }
      poblarEstablecimientos();
    }

    /** Muestra solo los establecimientos de la red elegida (la red se compara sin tildes ni mayúsculas). */
    function poblarEstablecimientos() {
      const sel = byId('nuevo-usuario-establecimiento');
      if (!sel) return;
      const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
      const red = norm(byId('nuevo-usuario-red') ? byId('nuevo-usuario-red').value : '');
      const lista = establecimientos.filter(e => red && norm(e.red_salud).startsWith(red));
      sel.innerHTML = '<option value="">Todos los de su red</option>' +
        lista.map(e => `<option value="${esc(e.cod_renipress)}">${esc(e.nombre)} (${esc(e.categoria || 'sin categoría')})</option>`).join('');
    }

    function renderUsuarios() {
      const cont = byId('usuarios-lista');
      if (!cont) return;
      const yo = session.getUser();
      if (!usuarios.length) {
        cont.innerHTML = '<div class="usuarios-vacio">No hay usuarios registrados.</div>';
        return;
      }
      cont.innerHTML = usuarios.map(u => {
        const esYo = yo && u.username === yo.username;
        const activo = u.activo !== false;
        return `
          <div class="usuario-fila ${activo ? '' : 'inactivo'}">
            <div class="usuario-datos">
              <div class="usuario-nombre">${esc(u.nombre)} <span class="usuario-login">(${esc(u.username)})</span></div>
              <div class="usuario-meta">
                <span class="usuario-rol rol-${esc(u.role)}">${esc(ROL_TXT[u.role] || u.role)}</span>
                ${u.red ? `<span>${esc(u.red)}</span>` : '<span>Todas las redes</span>'}
                ${u.establecimiento_id ? `<span>Establecimiento ${esc(u.establecimiento_id)}</span>` : ''}
                <span>${activo ? 'Activo' : 'Desactivado'}</span>
              </div>
            </div>
            <div class="usuario-acciones">
              <button type="button" class="btn-mini" data-acc="clave" data-user="${esc(u.username)}">🔑 Clave</button>
              <button type="button" class="btn-mini" data-acc="estado" data-user="${esc(u.username)}" ${esYo ? 'disabled title="No puede desactivarse a sí mismo"' : ''}>${activo ? '⏸ Desactivar' : '▶ Activar'}</button>
            </div>
          </div>`;
      }).join('');
    }

    async function cargarUsuarios() {
      const cont = byId('usuarios-lista');
      if (cont) cont.innerHTML = '<div class="usuarios-vacio">Cargando usuarios...</div>';
      const res = await session.authFetch(endpoints().API_USERS);
      if (!res.ok) {
        if (res.status !== 401 && cont) cont.innerHTML = `<div class="usuarios-vacio">${esc(await leerError(res, 'No se pudo cargar la lista de usuarios.'))}</div>`;
        return;
      }
      const b = await res.json();
      usuarios = Array.isArray(b.data) ? b.data : [];
      renderUsuarios();
    }

    let usuariosEscListener = null;

    async function abrirUsuarios() {
      if (!permisosActuales().gestionarUsuarios) return;
      const modal = byId('modal-usuarios');
      if (!modal) return;
      modal.classList.add('active');
      setMsgUsuarios('');
      cerrarCambioClave();

      if (usuariosEscListener) document.removeEventListener('keydown', usuariosEscListener);
      usuariosEscListener = (ev) => { if (ev.key === 'Escape') cerrarUsuarios(); };
      document.addEventListener('keydown', usuariosEscListener);
      const primero = byId('nuevo-usuario-login');
      if (primero) primero.focus();

      try {
        await cargarRedes();
        await cargarUsuarios();
      } catch (e) {
        setMsgUsuarios(e.message || 'No se pudo cargar la información.', false);
      }
    }

    function cerrarUsuarios() {
      if (usuariosEscListener) { document.removeEventListener('keydown', usuariosEscListener); usuariosEscListener = null; }
      const modal = byId('modal-usuarios');
      if (modal) modal.classList.remove('active');
      const f = byId('form-nuevo-usuario');
      if (f) f.reset();
      actualizarCampoRed();
      cerrarCambioClave();
      usuarios = [];
      redes = null;
      const lista = byId('usuarios-lista');
      if (lista) lista.innerHTML = '';
      setMsgUsuarios('');
    }

    function actualizarCampoRed() {
      const rol = byId('nuevo-usuario-rol');
      const wrap = byId('nuevo-usuario-red-wrap');
      if (!rol || !wrap) return;
      wrap.style.display = rol.value === 'ADMIN' ? 'none' : 'block';
      const wrapEst = byId('nuevo-usuario-establecimiento-wrap');
      if (wrapEst) wrapEst.style.display = rol.value === 'ADMIN' ? 'none' : 'block';
      poblarEstablecimientos();
    }

    async function crearUsuario(ev) {
      ev.preventDefault();
      const username = byId('nuevo-usuario-login').value.trim().toLowerCase();
      const nombre = byId('nuevo-usuario-nombre').value.trim();
      const role = byId('nuevo-usuario-rol').value;
      const red = byId('nuevo-usuario-red').value;
      const password = byId('nuevo-usuario-clave').value;
      if (!USERNAME_RE.test(username)) return setMsgUsuarios('Usuario: de 3 a 32 caracteres entre letras minúsculas, números, punto, guion y guion bajo.', false);
      if (!nombre) return setMsgUsuarios('Escriba el nombre completo de la persona.', false);
      if (!role) return setMsgUsuarios('Seleccione el rol.', false);
      if (role !== 'ADMIN' && !red) return setMsgUsuarios('Seleccione la red (RIS) del Coordinador o Director.', false);
      if (password.length < 10) return setMsgUsuarios('La clave debe tener al menos 10 caracteres.', false);

      const body = { username, nombre, role, password };
      if (role !== 'ADMIN') {
        body.red = red;
        const est = byId('nuevo-usuario-establecimiento');
        if (est && est.value) body.establecimiento_id = est.value;
      }
      const btn = byId('nuevo-usuario-guardar');
      btn.disabled = true;
      try {
        const res = await session.authFetch(endpoints().API_USERS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.status === 401) return;
        if (!res.ok) return setMsgUsuarios(await leerError(res, 'No se pudo registrar el usuario.'), false);
        byId('form-nuevo-usuario').reset();
        actualizarCampoRed();
        setMsgUsuarios(`Usuario "${username}" registrado. Entréguele su clave en persona.`, true);
        await cargarUsuarios();
      } catch (e) {
        setMsgUsuarios('No se pudo conectar con el servidor.', false);
      } finally {
        btn.disabled = false;
      }
    }

    async function modificarUsuario(username, cambios, exito) {
      try {
        const res = await session.authFetch(endpoints().API_USERS + '/' + encodeURIComponent(username), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cambios)
        });
        if (res.status === 401) return false;
        if (!res.ok) {
          setMsgUsuarios(await leerError(res, 'No se pudo modificar el usuario.'), false);
          return false;
        }
        const yo = session.getUser();
        if (yo && yo.username === username && cambios.password) {
          // Cambiar la propia clave cierra la sesión actual en el servidor
          salir();
          return true;
        }
        setMsgUsuarios(exito, true);
        await cargarUsuarios();
        return true;
      } catch (e) {
        setMsgUsuarios('No se pudo conectar con el servidor.', false);
        return false;
      }
    }

    function cerrarCambioClave() {
      objetivoClave = null;
      const box = byId('usuarios-clave-box');
      if (box) box.style.display = 'none';
      const inp = byId('usuarios-clave-nueva');
      if (inp) inp.value = '';
    }

    function abrirCambioClave(username) {
      objetivoClave = username;
      const box = byId('usuarios-clave-box');
      const tit = byId('usuarios-clave-titulo');
      if (tit) tit.textContent = 'Nueva clave para "' + username + '"';
      if (box) box.style.display = 'block';
      const inp = byId('usuarios-clave-nueva');
      if (inp) { inp.value = ''; inp.focus(); }
    }

    async function guardarCambioClave() {
      const inp = byId('usuarios-clave-nueva');
      const clave = inp ? inp.value : '';
      if (!objetivoClave) return;
      if (clave.length < 10) return setMsgUsuarios('La clave debe tener al menos 10 caracteres.', false);
      const objetivo = objetivoClave;
      const ok = await modificarUsuario(objetivo, { password: clave }, `Clave de "${objetivo}" actualizada. Sus sesiones anteriores se cerraron.`);
      if (ok) cerrarCambioClave();
    }

    function clickEnLista(ev) {
      const btn = ev.target.closest('button[data-acc]');
      if (!btn || btn.disabled) return;
      const username = btn.dataset.user;
      const u = usuarios.find(x => x.username === username);
      if (!u) return;
      if (btn.dataset.acc === 'clave') {
        abrirCambioClave(username);
      } else if (btn.dataset.acc === 'estado') {
        const activar = u.activo === false;
        modificarUsuario(username, { activo: activar }, activar ? `Usuario "${username}" activado.` : `Usuario "${username}" desactivado. Su sesión se cerró.`);
      }
    }

    // ---------- Inicio ----------
    function on(id, evento, fn) {
      const el = byId(id);
      if (el) el.addEventListener(evento, fn);
    }

    function bind() {
      on('login-form', 'submit', enviarLogin);
      on('login-ver-clave', 'click', () => {
        const pw = byId('login-password');
        const btn = byId('login-ver-clave');
        const visible = pw.type === 'text';
        pw.type = visible ? 'password' : 'text';
        btn.textContent = visible ? '👁 Mostrar' : '🙈 Ocultar';
      });
      on('btn-logout', 'click', () => salir());
      on('btn-logout-mobile', 'click', () => salir());
      on('btn-usuarios', 'click', abrirUsuarios);
      on('btn-usuarios-mobile', 'click', abrirUsuarios);
      on('usuarios-cerrar', 'click', cerrarUsuarios);
      on('form-nuevo-usuario', 'submit', crearUsuario);
      on('nuevo-usuario-rol', 'change', actualizarCampoRed);
      on('nuevo-usuario-red', 'change', poblarEstablecimientos);
      on('usuarios-lista', 'click', clickEnLista);
      on('usuarios-clave-guardar', 'click', guardarCambioClave);
      on('usuarios-clave-cancelar', 'click', cerrarCambioClave);

      // Al volver a la pestaña o cada minuto: si el token venció, cerrar la sesión sin esperar a la próxima llamada
      document.addEventListener('visibilitychange', () => { if (!document.hidden) session.checkExpiry(); });
      setInterval(() => session.checkExpiry(), 60000);

      // Cierre por inactividad (equipos compartidos del hospital): sin uso durante INACTIVIDAD_MINUTOS se cierra la
      // sesión en el servidor y se borran los datos de la pantalla. Valor por defecto: 30 minutos (config.js).
      const minutos = (root.APP_CONFIG && Number(root.APP_CONFIG.INACTIVIDAD_MINUTOS)) || 30;
      let ultimaActividad = Date.now();
      ['click', 'keydown', 'mousemove', 'touchstart', 'wheel'].forEach(tipo =>
        document.addEventListener(tipo, () => { ultimaActividad = Date.now(); }, { passive: true, capture: true }));
      setInterval(() => {
        if (session.isLoggedIn() && Date.now() - ultimaActividad > minutos * 60000) {
          session.logout();
          app.limpiarSesion();
          mostrarLogin(`Sesión cerrada por inactividad (${minutos} minutos sin uso). Ingrese nuevamente.`);
        }
      }, 30000);
      actualizarCampoRed();
      aplicarRol();
    }

    /** Arranque de la página: restaura la sesión guardada (si el servidor la acepta) o pide el acceso. */
    async function iniciar() {
      bind();
      if (!session.isLoggedIn()) {
        // C-14: si la sesión guardada ya venció, la pantalla de acceso lo dice
        const vencio = typeof session.vencioAlCargar === 'function' && session.vencioAlCargar();
        mostrarLogin(vencio ? 'Su sesión venció. Ingrese nuevamente.' : '');
        return;
      }
      avisoMostrado = false;
      setInert(true);
      // C-02: sin internet no se puede confirmar la sesión ni traer datos. No se descarta la sesión ni se guardan
      // datos de pacientes en el equipo: se avisa y se reintenta solo cuando vuelve la conexión.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        mostrarLogin('Sin conexión a internet. El sistema necesita conexión para mostrar los datos; se reintentará al volver la conexión.');
        window.addEventListener('online', () => window.location.reload(), { once: true });
        return;
      }
      const u = await session.restore();
      if (u) {
        entrar();
      } else if (!avisoMostrado) {
        // Sin respuesta del servidor la sesión no se puede confirmar: se descarta y se pide el acceso de nuevo
        session.logout();
        app.limpiarSesion();
        mostrarLogin('No se pudo verificar su sesión. Ingrese nuevamente.');
      }
    }

    return { iniciar, aplicarRol, mostrarLogin, salir, alVencer, abrirUsuarios, cerrarUsuarios };
  }

  root.AuthUi = { create };
})(typeof window !== 'undefined' ? window : this);
