(function (global) {
  'use strict';
  function button(parent, details) {
    const action = parent.ownerDocument.createElement('button'); action.type = 'button'; action.textContent = 'Ask AI Tutor (optional)';
    const status = parent.ownerDocument.createElement('p'); status.setAttribute('role', 'status');
    parent.append(action, status);
    if (!global.SqlFlow.quizSync || !global.SqlFlow.quizSync.available()) {
      action.disabled = true;
      action.textContent = 'AI Tutor not configured';
      status.textContent = 'Verified explanations remain available. No AI provider is connected to this public site.';
      return action;
    }
    action.addEventListener('click', async function () {
      action.disabled = true; status.textContent = 'Checking AI Tutor availability…';
      const controller = new AbortController(); const timer = global.setTimeout(function () { controller.abort(); }, 15000);
      try {
        const configured = await global.fetch('/api/ai-tutor/status', { signal: controller.signal }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); });
        if (!configured.configured) { status.textContent = 'AI Tutor not configured. The verified solution above remains available.'; return; }
        status.textContent = 'Requesting an optional explanation…';
        const response = await global.fetch('/api/ai-tutor/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details), signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        status.textContent = 'AI suggestion (not grading): ' + data.explanation + ' Verified answer: ' + data.verified_answer;
      } catch (_) { status.textContent = 'AI Tutor unavailable. Use the verified solution above.'; }
      finally { global.clearTimeout(timer); action.disabled = false; }
    });
    return action;
  }
  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.aiTutor = { button: button };
})(typeof window !== 'undefined' ? window : globalThis);
