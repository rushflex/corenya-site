const API = (() => {
  const TOKEN_KEY = 'cv_admin_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';

  async function req(path, options = {}) {
    const { method = 'GET', body, auth = false } = options;
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (error) {
      const err = new Error('Sunucuya ulaşılamadı. Siteyi `node server.js` ile başlattığından emin ol.');
      err.offline = true;
      throw err;
    }

    let data = null;
    try { data = await res.json(); } catch { /* boş yanıt */ }
    if (!res.ok) {
      const err = new Error(data?.error || `İstek başarısız (${res.status})`);
      err.status = res.status;
      err.data = data;
      if (res.status === 401 && path !== '/auth/login') clearToken();
      throw err;
    }
    return data;
  }

  return {
    req,
    get: (path) => req(path),
    post: (path, body) => req(path, { method: 'POST', body }),
    put: (path, body) => req(path, { method: 'PUT', body }),
    del: (path) => req(path, { method: 'DELETE' }),
    adminGet: (path) => req(path, { auth: true }),
    adminPost: (path, body) => req(path, { method: 'POST', body, auth: true }),
    adminPut: (path, body) => req(path, { method: 'PUT', body, auth: true }),
    adminDel: (path) => req(path, { method: 'DELETE', auth: true }),
    get token() { return token; },
    setToken(value) { token = value || ''; if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); },
    clearToken() { token = ''; localStorage.removeItem(TOKEN_KEY); }
  };
})();
