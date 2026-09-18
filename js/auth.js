const API_BASE = 'https://health-system-sosd.onrender.com';

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

// Adds a show/hide eye button to every password field on the page, so
// the user can check what they typed before submitting. Works whether
// the input already sits inside a Bootstrap .input-group (login,
// register) or is a plain .form-control on its own (settings, reset
// password, create-staff) -- it wraps it in an .input-group on the fly
// if needed.
function addPasswordToggles() {
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.toggleAdded) return;
    input.dataset.toggleAdded = 'true';

    let group = input.parentElement;
    if (!group || !group.classList.contains('input-group')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'input-group';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      group = wrapper;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline-secondary';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', 'Show password');
    btn.innerHTML = '<i class="bi bi-eye"></i>';

    btn.addEventListener('click', function () {
      const nowShowing = input.type === 'password';
      input.type = nowShowing ? 'text' : 'password';
      btn.innerHTML = nowShowing
        ? '<i class="bi bi-eye-slash"></i>'
        : '<i class="bi bi-eye"></i>';
      btn.setAttribute('aria-label', nowShowing ? 'Hide password' : 'Show password');
    });

    group.appendChild(btn);
  });
}

document.addEventListener('DOMContentLoaded', addPasswordToggles);
