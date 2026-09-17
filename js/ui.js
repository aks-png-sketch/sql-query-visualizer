(function (global) {
  'use strict';

  const THEME_KEY = 'sqlflow-theme';
  const state = { presentationMode: false, theme: 'dark', toastTimer: null, keyboardHandler: null };

  function setTheme(theme, documentObject, storageObject) {
    const doc = documentObject || global.document;
    const storage = storageObject === undefined ? global.localStorage : storageObject;
    state.theme = theme === 'light' ? 'light' : 'dark';
    if (doc && doc.documentElement) { doc.documentElement.dataset.theme = state.theme; doc.documentElement.style.colorScheme = state.theme; }
    const button = doc && doc.getElementById('themeToggleBtn');
    if (button) { const light = state.theme === 'light'; button.textContent = light ? 'Night Mode' : 'Day Mode'; button.setAttribute('aria-pressed', String(light)); button.setAttribute('aria-label', light ? 'Switch to night theme' : 'Switch to day theme'); }
    if (storage) { try { storage.setItem(THEME_KEY, state.theme); } catch (error) { /* Theme still works when storage is unavailable. */ } }
    return state.theme;
  }
  function initializeTheme(documentObject, storageObject, mediaObject) {
    const storage = storageObject === undefined ? global.localStorage : storageObject;
    let saved = null;
    if (storage) { try { saved = storage.getItem(THEME_KEY); } catch (error) { saved = null; } }
    const media = mediaObject || (global.matchMedia ? global.matchMedia('(prefers-color-scheme: light)') : null);
    const selected = saved === 'light' || saved === 'dark' ? saved : media && media.matches ? 'light' : 'dark';
    return setTheme(selected, documentObject, storage);
  }
  function toggleTheme(documentObject, storageObject) { return setTheme(state.theme === 'dark' ? 'light' : 'dark', documentObject, storageObject); }

  function setPresentationMode(enabled, documentObject) {
    const doc = documentObject || global.document;
    state.presentationMode = Boolean(enabled);
    if (doc && doc.body) { doc.body.classList.toggle('presentation-mode', state.presentationMode); }
    const button = doc && doc.getElementById('presentationModeBtn');
    if (button) {
      button.textContent = state.presentationMode ? 'Exit Presentation' : 'Presentation Mode';
      button.setAttribute('aria-pressed', String(state.presentationMode));
    }
    return state.presentationMode;
  }

  function togglePresentationMode(documentObject) {
    return setPresentationMode(!state.presentationMode, documentObject);
  }

  function showToast(message, type, duration, documentObject) {
    const doc = documentObject || global.document;
    const container = doc && doc.getElementById('toastContainer');
    if (!container) { return null; }
    if (state.toastTimer) { global.clearTimeout(state.toastTimer); state.toastTimer = null; }
    container.replaceChildren();
    const toast = doc.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = String(message);
    container.appendChild(toast);
    container.classList.remove('hidden');
    if (duration !== 0) {
      state.toastTimer = global.setTimeout(function () {
        container.classList.add('hidden');
        container.replaceChildren();
        state.toastTimer = null;
      }, duration || 3200);
    }
    return toast;
  }

  function hideToast(documentObject) {
    const doc = documentObject || global.document;
    if (state.toastTimer) { global.clearTimeout(state.toastTimer); state.toastTimer = null; }
    const container = doc && doc.getElementById('toastContainer');
    if (container) { container.classList.add('hidden'); container.replaceChildren(); }
  }

  function installKeyboardShortcuts(callbacks, documentObject) {
    const doc = documentObject || global.document;
    if (!doc) { return function () {}; }
    if (state.keyboardHandler) { doc.removeEventListener('keydown', state.keyboardHandler); }
    state.keyboardHandler = function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        callbacks.run();
      } else if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        callbacks.next();
      } else if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        callbacks.previous();
      } else if (event.key === 'Escape') {
        if (callbacks.escape && callbacks.escape() === true) { return; }
        if (state.presentationMode) { setPresentationMode(false, doc); }
      }
    };
    doc.addEventListener('keydown', state.keyboardHandler);
    return function () {
      doc.removeEventListener('keydown', state.keyboardHandler);
      state.keyboardHandler = null;
    };
  }

  function performDemoReset(actions, documentObject) {
    const callbacks = actions || {};
    if (callbacks.closePanels) { callbacks.closePanels(); }
    hideToast(documentObject);
    setPresentationMode(false, documentObject);
    if (callbacks.reset) { callbacks.reset(); }
    return true;
  }

  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.ui = {
    state: state,
    setPresentationMode: setPresentationMode,
    togglePresentationMode: togglePresentationMode,
    showToast: showToast,
    hideToast: hideToast,
    installKeyboardShortcuts: installKeyboardShortcuts,
    performDemoReset: performDemoReset,
    setTheme: setTheme,
    initializeTheme: initializeTheme,
    toggleTheme: toggleTheme,
    THEME_KEY: THEME_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);
