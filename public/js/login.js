document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login');
  const registerForm = document.getElementById('register');
  const loginContainer = document.getElementById('loginForm');
  const registerContainer = document.getElementById('registerForm');
  const loginError = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');
  const showRegister = document.getElementById('showRegister');
  const showLogin = document.getElementById('showLogin');

  showRegister?.addEventListener('click', (e) => {
    e.preventDefault();
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'block';
    registerError.style.display = 'none';
  });

  showLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    registerContainer.style.display = 'none';
    loginContainer.style.display = 'block';
    loginError.style.display = 'none';
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    try {
      const res = await callApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      clearSellitnowCsrfCache();
      setToken(res.token);
      setUser(res.user);
      const redirect = new URLSearchParams(location.search).get('redirect');
      window.location.href = redirect || '/';
    } catch (err) {
      loginError.textContent = err.message;
      loginError.style.display = 'block';
    }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.style.display = 'none';
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    try {
      const res = await callApi('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      clearSellitnowCsrfCache();
      setToken(res.token);
      setUser(res.user);
      const redirect = new URLSearchParams(location.search).get('redirect');
      window.location.href = redirect || '/';
    } catch (err) {
      registerError.textContent = err.message;
      registerError.style.display = 'block';
    }
  });
});
