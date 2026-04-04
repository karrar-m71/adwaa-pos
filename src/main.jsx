import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── إجبار الأرقام اللاتينية (الإنجليزية) حتى مع اللغة العربية ──────────────
(function forceLatinNumerals() {
  const fix = (locale) => {
    if (!locale) return 'en-US';
    if (typeof locale === 'string' && /^ar/i.test(locale) && !locale.includes('-u-')) {
      return locale + '-u-nu-latn';
    }
    return locale;
  };
  const origNum  = Number.prototype.toLocaleString;
  const origDateS = Date.prototype.toLocaleDateString;
  const origDateTS = Date.prototype.toLocaleString;

  Number.prototype.toLocaleString = function(l, o) { return origNum.call(this, fix(l), o); };
  Date.prototype.toLocaleDateString = function(l, o) { return origDateS.call(this, fix(l), o); };
  Date.prototype.toLocaleString    = function(l, o) { return origDateTS.call(this, fix(l), o); };
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
