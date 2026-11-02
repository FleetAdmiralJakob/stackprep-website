// Applies a saved colour theme before the page paints, so there is no flash.
// Loaded without defer on purpose; without a saved choice the system setting applies via CSS.
(() => {
  'use strict';
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.dataset.theme = saved;
    }
  } catch {
    // Storage blocked (private mode, strict settings): the system setting applies.
  }
})();
