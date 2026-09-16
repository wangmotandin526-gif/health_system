const API_BASE = ''; 

const Auth = {
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

    if (res.status === 401) {
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
