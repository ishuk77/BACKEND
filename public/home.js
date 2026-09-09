(() => {
    function boot() {
    const i18n = window.AVEC_I18N || { t: (key, fallback = key) => fallback, locale: 'fr' };
    const messages = document.getElementById('assistantMessages');
    const question = document.getElementById('assistantQuestion');
    const form = document.getElementById('assistantForm');
    const saveForReview = document.getElementById('assistantSaveForReview');
    if (!messages || !question || !form) return;

    function appendMessage(className, value) {
        const reply = document.createElement('p');
        reply.className = `assistant-message ${className}`;
        reply.textContent = value;
        messages.appendChild(reply);
        if (typeof reply.scrollIntoView === 'function') reply.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const text = question.value.trim();
        if (!text) return;
        appendMessage('assistant-question', text);
        question.value = '';
        const button = form.querySelector('button[type="submit"], button');
        if (button) button.disabled = true;
        try {
            const response = await fetch('/api/assistant/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text, locale: i18n.locale, saveForReview: Boolean(saveForReview && saveForReview.checked) })
            });
            const data = await response.json().catch(() => ({}));
            appendMessage('assistant-answer', data.answer || data.error || i18n.t('assistant_unavailable'));
        } catch (_) {
            appendMessage('assistant-answer', i18n.t('assistant_unavailable'));
        } finally {
            if (button) button.disabled = false;
        }
    });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
