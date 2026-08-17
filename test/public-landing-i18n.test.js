const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publicPath = path.join(__dirname, '..', 'public');
const read = file => fs.readFileSync(path.join(publicPath, file), 'utf8');

test('public landing and news copy use explicit keys with every supported locale', () => {
    const index = read('index.html');
    const news = read('news.html');
    const i18n = read('i18n.js');
    const keys = [
        'spaces_wallet_title', 'spaces_group_title', 'spaces_contacts_title',
        'platform_title', 'platform_savings_title', 'platform_credit_title', 'platform_community_title',
        'facebook_title', 'assistant_title', 'assistant_safety',
        'home_news_title', 'home_news_text', 'home_news_action',
        'news_intro_title', 'news_intro_text', 'news_privacy_text'
    ];

    keys.forEach(key => assert.match(`${index}\n${news}`, new RegExp(`data-i18n="${key}"`)));
    ['fr', 'en', 'rw', 'rn', 'sw', 'ln'].forEach(locale => {
        const start = i18n.indexOf(`        ${locale}: {`, i18n.indexOf('const landing'));
        const end = i18n.indexOf('\n        },', start);
        const dictionary = i18n.slice(start, end);
        keys.forEach(key => assert.match(dictionary, new RegExp(`${key}:`), `${locale} lacks ${key}`));
    });
});

test('portal and group authored copy uses explicit keys in every locale dictionary', () => {
    const platform = read('platform.html');
    const social = read('social.html');
    const group = read('group.html');
    const i18n = read('i18n.js');
    const keys = [
        'portal_activation_help', 'portal_phone_sandbox_help', 'portal_group_creation_help',
        'social_contacts_title', 'social_publish_content_title',
        'group_member_dashboard', 'group_wallet_funding', 'group_settings_title',
        'group_join_requests_title', 'group_chat_title'
    ];

    keys.forEach(key => assert.match(`${platform}\n${social}\n${group}`, new RegExp(`data-i18n="${key}"`)));
    assert.match(i18n, /const completeSources = Object\.freeze/);
    assert.match(i18n, /LOCALES\.map\(language => \[language, Object\.freeze/);
    keys.forEach(key => assert.match(i18n, new RegExp(`"${key}"`), `missing locale key ${key}`));
    ['fr', 'en', 'rw', 'rn', 'sw', 'ln'].forEach(locale => {
        assert.match(i18n, new RegExp(`\\b${locale}\\b`), `missing locale ${locale}`);
    });
});

test('assistant boot is safe without i18n and optional browser APIs', () => {
    const home = read('home.js');
    assert.match(home, /window\.AVEC_I18N \|\| \{ t:/);
    assert.match(home, /DOMContentLoaded/);
    assert.match(home, /typeof reply\.scrollIntoView === 'function'/);
});
