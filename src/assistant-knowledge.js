'use strict';

const LOCALES = new Set(['fr', 'en', 'rw', 'rn', 'sw', 'ln']);
const STOP_WORDS = new Set(['avec', 'pour', 'dans', 'avec', 'that', 'this', 'from', 'vous', 'votre', 'comment', 'what', 'when', 'where', 'about', 'the', 'and', 'les', 'des', 'une', 'que', 'qui', 'est']);
const SENSITIVE_PATTERNS = [
    /\b(?:pin|password|mot\s+de\s+passe|otp|one[- ]time\s+(?:passcode|code)|code\s+(?:secret|de\s+v[eé]rification))\b.{0,20}\b[a-z0-9!@#$%^&*]{4,}\b/i,
    /\b(?:card|carte|mobile\s*money|momo|bank|banque|compte\s+bancaire|wallet)\b.{0,30}\b\d(?:[ -]?\d){7,}\b/i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\+?\d(?:[ .()-]?\d){7,}\b/
];

const COPY = Object.freeze({
    fr: {
        disclaimer: 'Assistant informatif AVEC : ceci ne constitue pas un conseil financier ou juridique.',
        sensitive: 'Pour votre sécurité, ne partagez jamais de PIN, mot de passe, code OTP, coordonnées ou informations financières. Utilisez les contrôles sécurisés après connexion.',
        security: 'AVEC ne demande jamais votre PIN, mot de passe, code OTP ou détail de paiement dans cette conversation.',
        account: 'Créez un compte, vérifiez votre e-mail, puis terminez les vérifications demandées dans votre espace membre.',
        group: 'Depuis votre espace membre, vous pouvez découvrir, demander à rejoindre ou créer un groupe selon les règles AVEC.',
        wallet: 'Les portefeuilles personnel, AVEC et du groupe sont distincts. Les paiements de cette plateforme restent en mode SANDBOX.',
        default: 'Je peux expliquer les comptes, groupes AVEC, sécurité, portefeuille SANDBOX, communauté et actualités de la plateforme.'
    },
    en: {
        disclaimer: 'AVEC informational assistant: this is not financial or legal advice.',
        sensitive: 'For your safety, never share a PIN, password, OTP, contact details, or financial information. Use secure controls after signing in.',
        security: 'AVEC never asks for your PIN, password, OTP, or payment details in this conversation.',
        account: 'Create an account, verify your email, then complete the checks requested in your member area.',
        group: 'From your member area, you can discover, request to join, or create a group under AVEC rules.',
        wallet: 'Personal, AVEC, and group wallets are separate. Payments on this platform remain in SANDBOX mode.',
        default: 'I can explain platform accounts, AVEC groups, security, the SANDBOX wallet, community, and news.'
    },
    rw: {
        disclaimer: 'Umufasha wa AVEC atanga amakuru gusa; si inama y’imari cyangwa iy’amategeko.',
        sensitive: 'Ku bw’umutekano, ntugatange PIN, ijambo banga, OTP, aderesi cyangwa amakuru y’imari.',
        security: 'AVEC ntiyigera isaba PIN, ijambo banga, OTP cyangwa amakuru yo kwishyura hano.',
        account: 'Fungura konti, wemeze imeyili, hanyuma urangize igenzura risabwa.',
        group: 'Mu mwanya w’umunyamuryango ushobora gushaka, gusaba kwinjira cyangwa gukora itsinda.',
        wallet: 'Amasakoshi yawe, aya AVEC n’ay’itsinda aratandukanye; ubwishyu buri muri SANDBOX.',
        default: 'Nshobora gusobanura konti, amatsinda AVEC, umutekano, SANDBOX n’amakuru.'
    },
    rn: {
        disclaimer: 'Umufasha wa AVEC atanga amakuru gusa; si impanuro z’amahera canke z’amategeko.',
        sensitive: 'Ku mutekano wawe, ntutanga PIN, ijambo banga, OTP, aderesi canke amakuru y’amahera.',
        security: 'AVEC ntisaba PIN, ijambo banga, OTP canke amakuru yo kwishura muri iki kiganiro.',
        account: 'Fungura konti, wemeze imeyili, hanyuma urangize igenzura risabwa.',
        group: 'Mu kibanza c’umunywanyi ushobora kurondera, gusaba kwinjira canke gukora umugwi.',
        wallet: 'Amafaranga yawe, aya AVEC n’ay’umugwi aratandukanye; ukwishura kuri SANDBOX.',
        default: 'Nshobora gusigura konti, imigwi AVEC, umutekano, SANDBOX n’amakuru.'
    },
    sw: {
        disclaimer: 'Msaidizi wa AVEC hutoa maelezo pekee; si ushauri wa kifedha au kisheria.',
        sensitive: 'Kwa usalama wako, usishiriki PIN, nenosiri, OTP, anwani au taarifa za kifedha.',
        security: 'AVEC haiombi PIN, nenosiri, OTP au maelezo ya malipo katika mazungumzo haya.',
        account: 'Fungua akaunti, thibitisha barua pepe, kisha kamilisha uthibitishaji unaohitajika.',
        group: 'Kwenye nafasi ya mwanachama unaweza kutafuta, kuomba kujiunga au kuunda kikundi.',
        wallet: 'Pochi binafsi, AVEC na ya kikundi zimetenganishwa; malipo ni SANDBOX.',
        default: 'Ninaweza kueleza akaunti, vikundi vya AVEC, usalama, SANDBOX na habari.'
    },
    ln: {
        disclaimer: 'Mosungi ya AVEC apesaka kaka makambo; ezali toli ya mbongo to mibeko te.',
        sensitive: 'Mpo na bokengi, kopesa PIN, mot de passe, OTP, adrɛsi to makambo ya mbongo te.',
        security: 'AVEC esengaka PIN, mot de passe, OTP to makambo ya kofuta te awa.',
        account: 'Fungola konti, ndimisa imeyili, bongo silisa bondimisi oyo esengami.',
        group: 'Na esika ya mondimi okoki koluka, kosenga kokota to kosala lisanga.',
        wallet: 'Ba portefeuille ya yo, AVEC mpe lisanga ekabwani; kofuta ezali SANDBOX.',
        default: 'Nakoki kolimbola ba konti, masanga AVEC, bokengi, SANDBOX mpe bansango.'
    }
});

function localeFor(locale) {
    return LOCALES.has(locale) ? locale : 'fr';
}

function cleanText(value, maximum = 1200) {
    if (typeof value !== 'string') return null;
    const text = value.normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    return text && Array.from(text).length <= maximum ? text : null;
}

function containsSensitiveData(value) {
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(value));
}

function tokens(value) {
    return [...new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
        .filter(token => !STOP_WORDS.has(token)))];
}

function safeSubmission(value, maximum) {
    const text = cleanText(value, maximum);
    return text && !containsSensitiveData(text) ? text : null;
}

function route(question) {
    const normalized = question.toLocaleLowerCase();
    if (/(pin|password|mot de passe|otp|code|sécurité|securite|usalama|umutekano|bokengi)/u.test(normalized)) return 'security';
    if (/(wallet|portefeuille|momo|mobile money|paiement|retrait|dépôt|depot|pochi)/u.test(normalized)) return 'wallet';
    if (/(groupe|group|avec|épargne|epargne|saving|kikundi|itsinda|umugwi|lisanga)/u.test(normalized)) return 'group';
    if (/(compte|account|inscri|register|email|imeyili|akaunti|konti)/u.test(normalized)) return 'account';
    return 'default';
}

function retrieve(question, entries) {
    const queryTokens = tokens(question);
    if (!queryTokens.length) return [];
    return entries.map(entry => {
        const corpus = tokens(`${entry.title || ''} ${entry.body || ''}`);
        const matches = queryTokens.filter(token => corpus.includes(token)).length;
        return { entry, matches };
    }).filter(item => item.matches > 0)
        .sort((left, right) => right.matches - left.matches || Number(right.entry.id) - Number(left.entry.id))
        .slice(0, 2);
}

function answerQuestion({ question, locale, entries = [] }) {
    const language = localeFor(locale);
    const clean = cleanText(question, 500);
    if (!clean) return { error: 'invalid_question' };
    if (containsSensitiveData(clean)) return { answer: `${COPY[language].sensitive} ${COPY[language].disclaimer}`, blocked: true, sources: [] };
    const matches = retrieve(clean, entries);
    const answer = matches.length
        ? `${matches.map(({ entry }) => entry.body).join('\n\n')} ${COPY[language].disclaimer}`
        : `${COPY[language][route(clean)]} ${COPY[language].disclaimer}`;
    return { answer, blocked: false, sources: matches.map(({ entry }) => Number(entry.id)) };
}

module.exports = { COPY, answerQuestion, cleanText, containsSensitiveData, localeFor, retrieve, safeSubmission };
