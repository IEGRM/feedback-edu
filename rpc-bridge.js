/* FEEDBACK+ EDU — puente GitHub Pages <-> Google Apps Script
   Conserva la sintaxis google.script.run para no reescribir la aplicación.
   El micrófono permanece en la página TOP LEVEL de GitHub Pages.
*/
(() => {
  'use strict';

  const CFG = window.FEEDBACK_EDU_CONFIG || {};
  const APPS_SCRIPT_URL = String(CFG.appsScriptUrl || '').trim();
  const CHANNEL = 'feedback-edu-bridge-v1';
  const pending = new Map();
  const queue = [];
  const nonce = (() => {
    const a = new Uint32Array(4);
    crypto.getRandomValues(a);
    return Array.from(a, n => n.toString(16).padStart(8, '0')).join('');
  })();

  let bridgeWindow = null;
  let bridgeOrigin = '';
  let ready = false;
  let iframe = null;

  function isConfigured() {
    return /^https:\/\/script\.google\.com\/.+\/macros\/.+\/exec(?:[?#].*)?$/i.test(APPS_SCRIPT_URL) ||
           /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:[?#].*)?$/i.test(APPS_SCRIPT_URL);
  }

  function allowedBridgeOrigin(origin) {
    const extra = Array.isArray(CFG.bridgeOrigins) ? CFG.bridgeOrigins : [];
    if (extra.includes(origin)) return true;
    try {
      const u = new URL(origin);
      return u.protocol === 'https:' &&
        (u.hostname === 'script.google.com' ||
         u.hostname.endsWith('.script.googleusercontent.com') ||
         u.hostname.endsWith('.googleusercontent.com'));
    } catch (_) {
      return false;
    }
  }

  function configError() {
    const msg = 'Falta configurar la URL /exec de Google Apps Script en config.js.';
    console.error(msg);
    window.dispatchEvent(new CustomEvent('feedback-bridge-error', {detail:{message:msg}}));
  }

  function makeBridgeUrl() {
    const u = new URL(APPS_SCRIPT_URL);
    u.searchParams.set('mode', 'bridge');
    u.searchParams.set('bridgeNonce', nonce);
    return u.toString();
  }

  function createIframe() {
    if (!isConfigured()) {
      configError();
      return;
    }
    iframe = document.createElement('iframe');
    iframe.id = 'feedbackAppsScriptBridge';
    iframe.title = 'Conexión segura con Google Apps Script';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText =
      'position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0;pointer-events:none;';
    iframe.src = makeBridgeUrl();
    (document.body || document.documentElement).appendChild(iframe);
  }

  function flushQueue() {
    if (!ready || !bridgeWindow) return;
    while (queue.length) sendNow(queue.shift());
  }

  function sendNow(req) {
    if (!bridgeWindow || !bridgeOrigin) {
      queue.push(req);
      return;
    }
    bridgeWindow.postMessage({
      channel: CHANNEL,
      type: 'RPC_REQUEST',
      nonce,
      id: req.id,
      method: req.method,
      args: req.args
    }, bridgeOrigin);
  }

  function rpc(method, args, success, failure, userObject) {
    const id = (crypto.randomUUID ? crypto.randomUUID() :
      Date.now().toString(36) + Math.random().toString(36).slice(2));
    pending.set(id, {success, failure, userObject});
    const req = {id, method, args};

    if (ready) sendNow(req);
    else queue.push(req);

    // Evitar llamadas colgadas indefinidamente.
    setTimeout(() => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      const err = {message:'No hubo respuesta de Google Apps Script. Verifica la URL /exec y la implementación.'};
      if (typeof p.failure === 'function') p.failure(err, p.userObject);
      else console.error(err.message);
    }, 45000);
  }

  function makeRunner(success, failure, userObject) {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === 'withSuccessHandler') return fn => makeRunner(fn, failure, userObject);
        if (prop === 'withFailureHandler') return fn => makeRunner(success, fn, userObject);
        if (prop === 'withUserObject') return obj => makeRunner(success, failure, obj);
        if (prop === 'then') return undefined; // no convertir el Proxy en thenable
        return (...args) => rpc(String(prop), args, success, failure, userObject);
      }
    });
  }

  window.addEventListener('message', event => {
    const d = event.data || {};
    if (d.channel !== CHANNEL || d.nonce !== nonce) return;

    if (d.type === 'BRIDGE_READY') {
      if (!allowedBridgeOrigin(event.origin)) return;
      bridgeWindow = event.source;
      bridgeOrigin = event.origin;
      ready = true;
      flushQueue();
      window.dispatchEvent(new CustomEvent('feedback-bridge-ready'));
      return;
    }

    if (d.type === 'RPC_RESPONSE') {
      if (!ready || event.source !== bridgeWindow || event.origin !== bridgeOrigin) return;
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);

      if (d.ok) {
        if (typeof p.success === 'function') p.success(d.result, p.userObject);
      } else {
        const err = d.error || {message:'Error desconocido en Apps Script.'};
        if (typeof p.failure === 'function') p.failure(err, p.userObject);
        else console.error(err.message || err);
      }
    }
  });

  // API compatible con google.script.run.
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = makeRunner(null, null, null);

  // Crear el iframe cuando ya exista <body>.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createIframe, {once:true});
  } else {
    createIframe();
  }
})();
