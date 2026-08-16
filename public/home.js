(() => {
    function boot() {
    const i18n = window.AVEC_I18N || { t: (key, fallback = key) => fallback };
    const messages = document.getElementById('assistantMessages');
    const question = document.getElementById('assistantQuestion');
    const form = document.getElementById('assistantForm');
    if (!messages || !question || !form) return;

    function answer(value) {
        const q = value.toLowerCase();
        if (/(pin|mot de passe|password|otp|code|momo|mobile money|bokengi|usalama)/.test(q)) return i18n.t('assistant_security');
        if (/(groupe|avec|épargne|epargne|rejoindre|join|lisanga|kikundi|itsinda|umugwi|akiba|bobombi)/.test(q)) return i18n.t('assistant_group', 'Please create or join an AVEC group from your member account.');
        if (/(email|e-mail|inscri|compte|account|akaunti|konti)/.test(q)) return i18n.t('assistant_account');
        if (/(wallet|portefeuille|argent|transfert|retrait|recharge|pochi)/.test(q)) return i18n.t('assistant_wallet');
        if (/(communaut|facebook|actualité|actualit|publication|jumuiya|lisanga|umuryango)/.test(q)) return i18n.t('assistant_community', 'Visit AVEC Community for public conversations and announcements.');
        return i18n.t('assistant_default', 'I can help with registration, security, groups, savings, wallets, the community and news.');
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        const text = question.value.trim();
        if (!text) return;
        const user = document.createElement('p');
        user.className = 'assistant-message assistant-question';
        user.textContent = text;
        const reply = document.createElement('p');
        reply.className = 'assistant-message assistant-answer';
        reply.textContent = answer(text);
        messages.append(user, reply);
        question.value = '';
        if (typeof reply.scrollIntoView === 'function') reply.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
