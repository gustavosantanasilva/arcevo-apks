(function () {
  const form = document.getElementById('adminLoginForm');
  const message = document.getElementById('loginMessage');

  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = 'Validando...';

    const data = Object.fromEntries(new FormData(form).entries());

    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const payload = await response.json();
    if (!response.ok) {
      message.textContent = payload.error || 'Falha no login';
      return;
    }

    message.textContent = 'Acesso liberado. Redirecionando...';
    window.location.href = '/admin';
  });
})();
