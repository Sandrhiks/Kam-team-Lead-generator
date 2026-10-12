// Applies the saved light/dark theme before the page paints.
try {
  const t = JSON.parse(localStorage.getItem("kds.theme"));
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) { /* storage unavailable: keep the default dark theme */ }
