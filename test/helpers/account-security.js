const assert = require('node:assert/strict');
const countries = require('../../public/momo-countries');

const emailCodes = new Map();
const emailEndpoint = 'https://email-otp.test/deliver';
let emailDeliveryInstalled = false;

function countryForPhone(phone) {
    return countries
        .slice()
        .sort((left, right) => right.dialCode.length - left.dialCode.length)
        .find(country => phone.startsWith(country.dialCode))?.name;
}

function installEmailDeliveryCapture() {
    process.env.EMAIL_OTP_PROVIDER = 'http';
    process.env.EMAIL_OTP_ENDPOINT = emailEndpoint;
    process.env.EMAIL_OTP_API_KEY = 'test-email-otp-key';
    process.env.EMAIL_OTP_FROM = 'no-reply@example.test';
    if (emailDeliveryInstalled) return;
    const fetch = global.fetch;
    global.fetch = async (url, options) => {
        if (String(url) === emailEndpoint) {
            const payload = JSON.parse(options.body);
            const code = payload.text.match(/\b(\d{6})\b/)?.[1];
            if (!code) throw new Error('E-mail OTP test delivery did not contain a code.');
            emailCodes.set(payload.to, code);
            return { ok: true };
        }
        return fetch(url, options);
    };
    emailDeliveryInstalled = true;
}

async function verifyEmailPurpose(request, email, browserSessionId, purpose) {
    installEmailDeliveryCapture();
    const requested = await request('POST', '/api/platform/email-verifications/request', {
        body: { email, browserSessionId, purpose }
    });
    assert.equal(requested.status, 202);
    const code = emailCodes.get(email);
    assert.match(code || '', /^\d{6}$/);
    const activated = await request('POST', '/api/platform/email-verifications/verify', {
        body: { email, browserSessionId, purpose, code }
    });
    assert.equal(activated.status, 200);
    return activated.data;
}
async function activateAccount(request, email, browserSessionId) {
    return verifyEmailPurpose(request, email, browserSessionId, 'activation');
}

async function registerActiveAccount(request, {
    prenom = 'Membre',
    name = 'AVEC',
    phone,
    identityNumber,
    pin = '1234',
    browserSessionId,
    email = `member-${phone.replace(/\D/g, '')}@example.test`
}) {
    const registration = await request('POST', '/api/platform/auth/register', {
        body: {
            prenom, name, email, country: countryForPhone(phone), phone, identityNumber,
            pin, pinConfirmation: pin
        }
    });
    assert.equal(registration.status, 201);

    const activated = await activateAccount(request, email, browserSessionId);
    const delivery = await request('POST', '/api/platform/phone-verifications/request', {
        token: activated.accessToken, body: { phone, browserSessionId }
    });
    assert.equal(delivery.status, 201);
    const verification = await request('POST', '/api/platform/phone-verifications/verify', {
        token: activated.accessToken,
        body: { phone, browserSessionId, code: delivery.data.sandboxCode }
    });
    assert.equal(verification.status, 200);
    const secured = await request('PUT', '/api/platform/profile/security', {
        token: activated.accessToken,
        body: { browserSessionId, phoneVerificationToken: verification.data.verificationToken }
    });
    assert.equal(secured.status, 200);
    return {
        status: registration.status,
        data: {
            ...registration.data,
            ...activated,
            account: secured.data.account
        }
    };
}

module.exports = { activateAccount, registerActiveAccount, verifyEmailPurpose };
