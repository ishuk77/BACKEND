(() => {
    const i18n = window.AVEC_I18N;
    const messages = document.getElementById('assistantMessages');
    const question = document.getElementById('assistantQuestion');

    function answer(value) {
        const q = value.toLowerCase();
        if (/(pin|mot de passe|password|otp|code|momo|mobile money)/.test(q)) return i18n.t('assistant_security');
        if (/(groupe|avec|épargne|epargne|rejoindre|join)/.test(q)) return i18n.t('assistant_group');
        if (/(email|e-mail|inscri|compte|account)/.test(q)) return i18n.t('assistant_account');
        if (/(wallet|portefeuille|argent|transfert|retrait|recharge)/.test(q)) return i18n.t('assistant_wallet');
        if (/(communaut|facebook|actualité|actualit|publication)/.test(q)) return i18n.t('assistant_community');
        return i18n.t('assistant_default');
    }

    document.getElementById('assistantForm').addEventListener('submit', event => {
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
        reply.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
})();
