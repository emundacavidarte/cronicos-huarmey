/**
 * session.js
 * T-03b: sesión del cliente. Guarda el token que entrega POST /api/auth/login, lo envía como
 * "Authorization: Bearer" en toda llamada a /api y /fhir, y cierra la sesión cuando el servidor responde 401.
 * El rol y la red que se muestran vienen siempre de la respuesta del servidor; ocultar botones aquí es solo
 * comodidad: el control real de permisos lo hace el servidor (403).
 * Módulo universal (navegador y Node), igual que semaforo.js, para poder probarlo con server/tests/testSession.js.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.AuthSession = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  const STORAGE_KEY = 'maxime_cronicos_sesion_v1';
  const ROLES = ['ADMIN', 'COORDINADOR', 'DIRECTOR'];

  const PERMISOS = {
    ADMIN: Object.freeze({ verResumen: true, verPacientes: true, escribir: true, gestionarUsuarios: true }),
    COORDINADOR: Object.freeze({ verResumen: true, verPacientes: true, escribir: true, gestionarUsuarios: false }),
    DIRECTOR: Object.freeze({ verResumen: true, verPacientes: false, escribir: false, gestionarUsuarios: false })
  };
  const SIN_PERMISOS = Object.freeze({ verResumen: false, verPacientes: false, escribir: false, gestionarUsuarios: false });

  /** Qué puede hacer cada rol (espejo de lo que aplica el servidor). Rol desconocido: nada. */
  function permisosDe(role) {
    return Object.prototype.hasOwnProperty.call(PERMISOS, role) ? PERMISOS[role] : SIN_PERMISOS;
  }

  function memoryStorage() {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: k => { m.delete(k); }
    };
  }

  function defaultStorage() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage;
    } catch (e) { /* almacenamiento bloqueado por el navegador */ }
    return memoryStorage();
  }

  function mensajeDe(body, porDefecto) {
    try {
      const d = body && body.issue && body.issue[0] && body.issue[0].diagnostics;
      if (typeof d === 'string' && d) return d;
    } catch (e) { /* cuerpo inesperado */ }
    return porDefecto;
  }

  function usuarioValido(u) {
    return !!u && typeof u === 'object' && typeof u.username === 'string' && u.username.length > 0 && ROLES.includes(u.role);
  }

  function limpiarUsuario(u) {
    return {
      username: u.username,
      nombre: typeof u.nombre === 'string' && u.nombre ? u.nombre : u.username,
      role: u.role,
      red: typeof u.red === 'string' && u.red ? u.red : null
    };
  }

  function headersComoObjeto(h) {
    const out = {};
    if (!h) return out;
    if (typeof Headers !== 'undefined' && h instanceof Headers) {
      h.forEach((v, k) => { out[k] = v; });
      return out;
    }
    return Object.assign(out, h);
  }

  function create(options) {
    const opts = options || {};
    const storage = opts.storage || defaultStorage();
    const now = opts.now || (() => Date.now());
    const getEndpoints = opts.getEndpoints || (() => ({}));
    const onExpired = typeof opts.onExpired === 'function' ? opts.onExpired : () => {};
    const doFetch = opts.fetchImpl || ((...args) => fetch(...args));

    let session = null;

    function borrarAlmacenado() {
      try { storage.removeItem(STORAGE_KEY); } catch (e) { /* sin almacenamiento */ }
    }

    function guardar() {
      if (!session) return;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch (e) { /* cuota o bloqueo: queda solo en memoria */ }
    }

    function vigente(s) {
      if (!s || typeof s.token !== 'string' || !s.token || !usuarioValido(s.user)) return false;
      const exp = Date.parse(s.expires_at);
      return Number.isFinite(exp) && exp > now();
    }

    function cargar() {
      let raw = null;
      try { raw = storage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
      if (raw === null || raw === undefined) return;
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      if (vigente(parsed)) {
        session = { token: parsed.token, expires_at: parsed.expires_at, user: limpiarUsuario(parsed.user) };
      } else {
        borrarAlmacenado();
      }
    }

    function cerrar(avisar) {
      const habia = session !== null;
      session = null;
      borrarAlmacenado();
      if (avisar && habia) onExpired('expired');
    }

    async function login(username, password) {
      const url = getEndpoints().AUTH_LOGIN;
      let res;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          cache: 'no-store'
        });
      } catch (e) {
        return { ok: false, status: 0, message: 'No se pudo conectar con el servidor. Verifique que esté encendido.' };
      }
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }

      if (!res.ok) {
        return { ok: false, status: res.status, message: mensajeDe(body, 'No se pudo iniciar sesión (código ' + res.status + ').') };
      }
      const exp = body ? Date.parse(body.expires_at) : NaN;
      if (!body || typeof body.token !== 'string' || !body.token || !Number.isFinite(exp) || !usuarioValido(body.user)) {
        return { ok: false, status: res.status, message: 'El servidor respondió de forma inesperada. Intente de nuevo.' };
      }
      session = { token: body.token, expires_at: body.expires_at, user: limpiarUsuario(body.user) };
      guardar();
      return { ok: true, status: res.status, user: session.user };
    }

    function logout() {
      const token = session ? session.token : null;
      cerrar(false);
      if (token) {
        try {
          const endpoints = getEndpoints();
          const logoutUrl = endpoints.AUTH_LOGOUT || (endpoints.AUTH_LOGIN ? endpoints.AUTH_LOGIN.replace('/login', '/logout') : '/api/auth/logout');
          Promise.resolve(doFetch(logoutUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            cache: 'no-store'
          })).catch(() => {});
        } catch (e) {}
      }
    }

    /** fetch con el token. Un 401 con el token vigente cierra la sesión; un 403 no (es falta de permiso). */
    async function authFetch(url, init) {
      const base = init || {};
      if (session && !vigente(session)) cerrar(true);
      const usado = session ? session.token : null;
      const headers = headersComoObjeto(base.headers);
      if (usado) headers.Authorization = 'Bearer ' + usado;
      if (base.body && typeof base.body === 'string' && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
      const res = await doFetch(url, Object.assign({}, base, { headers, cache: 'no-store' }));
      if (res && res.status === 401 && usado && session && session.token === usado) cerrar(true);
      return res;
    }

    /** Al recargar la página: confirma con el servidor que el token sigue siendo válido y toma de él el rol actual. */
    async function restore() {
      if (!session) return null;
      let res;
      try {
        res = await authFetch(getEndpoints().AUTH_ME);
      } catch (e) {
        return null; // sin red no se puede afirmar que la sesión venció
      }
      if (!res || res.status !== 200) return null;
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      if (!body || !usuarioValido(body.user)) {
        cerrar(false);
        return null;
      }
      session.user = limpiarUsuario(body.user);
      guardar();
      return session.user;
    }

    /** Cierra la sesión si el token ya venció (la pestaña pudo quedar abierta, inactiva). Devuelve true si la cerró. */
    function checkExpiry() {
      if (session && !vigente(session)) {
        cerrar(true);
        return true;
      }
      return false;
    }

    cargar();

    return {
      login,
      logout,
      authFetch,
      restore,
      checkExpiry,
      isLoggedIn: () => session !== null,
      getUser: () => (session ? session.user : null),
      getToken: () => (session ? session.token : null),
      getExpiresAt: () => (session ? session.expires_at : null)
    };
  }

  return { STORAGE_KEY, ROLES, permisosDe, create };
});
