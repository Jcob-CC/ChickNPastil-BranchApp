const assert = require('node:assert/strict');
const test = require('node:test');
const { createVerificationEmail } = require('../lib/email_templates');

test('verification email includes a styled HTML body and plain-text fallback', () => {
    const template = createVerificationEmail({
        title: 'Sign in to your account',
        message: 'Use the verification code below.',
        code: '123456',
    });

    assert.match(template.text, /Verification code: 123456/);
    assert.match(template.text, /expires in 10 minutes/);
    assert.match(template.html, /<!doctype html>/);
    assert.match(template.html, /Chick N Pastil/);
    assert.match(template.html, /Sign in to your account/);
    assert.match(template.html, /123456/);
});
