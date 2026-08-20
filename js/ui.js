(function (global) {
  'use strict';

  const state = { presentationMode: false, toastTimer: null, keyboardHandler: null };

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
    performDemoReset: performDemoReset
  };
})(typeof window !== 'undefined' ? window : globalThis);
