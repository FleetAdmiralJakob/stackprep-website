// StackPrep: theme toggle and waitlist form.
// Only textContent and attributes are written, so nothing can inject markup.
(() => {
  'use strict';

  // Theme toggle: overrides the system setting and remembers the choice.

  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches);
    const render = () => toggle.setAttribute('aria-pressed', String(isDark()));

    toggle.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem('theme', next);
      } catch {
        // Storage blocked: the choice lasts until the page is reloaded.
      }
      render();
    });

    systemDark.addEventListener('change', render);
    toggle.hidden = false;
    render();
  }

  // Waitlist form: progressive enhancement. Without JavaScript the form posts normally.

  const form = document.querySelector('[data-waitlist]');
  if (!form) return;

  // Native validation stays on without JavaScript; with it, errors show inline instead.
  form.noValidate = true;

  const status = form.querySelector('[data-status]');
  const button = form.querySelector('button[type="submit"]');

  const messages = {
    pending: 'Wird gesendet …',
    success: 'Fast geschafft. Bestätige deine Anmeldung über den Link in der E-Mail, die wir dir gerade geschickt haben.',
    invalid: 'Bitte gib deine E-Mail-Adresse ein und bestätige beide Häkchen.',
    error: 'Die Anmeldung hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.',
  };

  const setStatus = (state) => {
    status.textContent = messages[state];
    status.dataset.state = state;
  };

  form.addEventListener('input', (event) => {
    if (event.target.matches('[aria-invalid="true"]') && event.target.checkValidity()) {
      event.target.removeAttribute('aria-invalid');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const invalid = [...form.elements].filter((el) => el.willValidate && !el.checkValidity());
    invalid.forEach((el) => el.setAttribute('aria-invalid', 'true'));
    if (invalid.length > 0) {
      setStatus('invalid');
      invalid[0].focus();
      return;
    }

    // Honeypot: people never see this field, bots tend to fill it.
    if (form.elements.website.value !== '') {
      setStatus('success');
      form.reset();
      return;
    }

    button.disabled = true;
    setStatus('pending');

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      form.reset();
      setStatus('success');
    } catch {
      setStatus('error');
    } finally {
      button.disabled = false;
    }
  });
})();
