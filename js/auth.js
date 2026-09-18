const API_BASE = 'https://health-system-sosd.onrender.com/api/setup/init?key=Secret123';

const Auth = {
  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  saveSession(token, user) {
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(user));
  },

  getToken() {
    return sessionStorage.getItem('token');
  },

  getUser() {
    const raw = sessionStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  },

  logout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    window.location.href = 'login.html';
  },

  requireAuth() {
    if (!this.getToken()) {
      window.location.href = 'login.html';
      return null;
    }
    return this.getUser();
  },

  async apiFetch(path, options = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {}
    );
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(API_BASE + path, { ...options, headers });
    } catch (err) {
      throw new Error('Could not reach the server. Is the backend running?');
    }

    if (res.status === 401 && token) {
      // We sent a session token and the server rejected it -- that's an
      // expired/invalid session. A 401 with NO token (e.g. the login
      // request itself, which never had a token to send) just means
      // "wrong email or password" and should fall through to show the
      // server's own error message instead of silently redirecting.
      this.logout();
      throw new Error('Session expired, please log in again.');
    }

    let body = null;
    try {
      body = await res.json();
    } catch (_) {}

    if (!res.ok) {
      throw new Error((body && body.message) || `Request failed (${res.status})`);
    }

    return body;
  },
};
