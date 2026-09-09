const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publicPath = path.join(__dirname, '..', 'public');
const pages = ['index.html', 'platform.html', 'social.html', 'group.html', 'news.html', 'admin.html'];
const i18n = fs.readFileSync(path.join(publicPath, 'i18n.js'), 'utf8');

test('critical authored UI leaves and accessibility labels declare explicit i18n keys', () => {
    pages.forEach(page => {
        const html = fs.readFileSync(path.join(publicPath, page), 'utf8');
        const leaves = html.matchAll(/<([A-Za-z][\w:-]*)(\s[^<>]*?)?>([^<>]+)<\/\1>/g);
        for (const match of leaves) {
            const text = match[3].replace(/&nbsp;|&#160;/g, ' ');
            if (['script', 'style'].includes(match[1].toLowerCase()) || !/[A-Za-zÀ-ÿ]/.test(text)) continue;
            assert.match(match[2] || '', /data-i18n=/, `${page} has an unkeyed authored leaf: ${match[3].trim()}`);
        }
        for (const tag of html.matchAll(/<[A-Za-z][^<>]*>/g)) {
            for (const attribute of ['placeholder', 'title', 'aria-label', 'alt']) {
                if (new RegExp(`\\s${attribute}="[^"]+"`).test(tag[0])) {
                    assert.match(tag[0], new RegExp(`data-i18n-${attribute}=`), `${page} has an unkeyed ${attribute}`);
                }
            }
        }
    });
    assert.doesNotMatch(i18n, /createTreeWalker|captureStatic|SHOW_TEXT/);
    ['fr', 'en', 'rw', 'rn', 'sw', 'ln'].forEach(locale => assert.match(i18n, new RegExp(`\\b${locale}\\s*:`)));
    const generatedKeys = [...i18n.matchAll(/"(ui_authored_\d+)":/g)].map(match => match[1]);
    assert.ok(generatedKeys.length >= 200, 'authored UI key catalogue should cover the audited pages');
    assert.match(i18n, /\.\.\.generatedSources/, 'generated authored keys must be included in every locale dictionary');
    ['fr', 'en', 'rw', 'rn', 'sw', 'ln'].forEach(locale => {
        assert.match(i18n, new RegExp(`${locale}: \\{[^}]*assistant_optin[^}]*assistant_unavailable`), `${locale} lacks assistant UI copy`);
    });
});
