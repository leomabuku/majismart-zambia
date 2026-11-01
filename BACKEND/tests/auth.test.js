import test from 'node:test';
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { shutdownServer } from '../src/server.js';
import { configuredGoogleClientIds, GoogleAuthError, verifyGoogleIdToken } from '../src/services/googleAuthService.js';

const BASE_URL = 'http://localhost:5000';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@majismart.zm';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'AdminPassword2026!';
const CUSTOMER_EMAIL = 'mwape@community.zm';
const CUSTOMER_PASSWORD = process.env.SEED_CUSTOMER_PASSWORD || 'CustomerPass2026!';

function post(path, body) {
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

after(async () => {
  await shutdownServer();
});

// ---------------------------------------------------------------------------
// Password sign-in must keep working for the two seeded demo accounts.
// ---------------------------------------------------------------------------

test('seeded admin can still sign in with email and password', async () => {
  const response = await post('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.token, 'a token should be issued');
  assert.equal(body.user.email, ADMIN_EMAIL);
  assert.equal(body.user.role, 'admin');
  assert.equal(body.user.password_hash, undefined, 'password hashes must never be returned');
});

test('seeded customer can still sign in with email and password', async () => {
  const response = await post('/api/auth/login', { email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.role, 'customer');
});

test('wrong password is rejected', async () => {
  const response = await post('/api/auth/login', { email: ADMIN_EMAIL, password: 'not-the-password' });
  assert.equal(response.status, 401);
});

test('session token identifies the signed-in user on /auth/me', async () => {
  const login = await (await post('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })).json();
  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${login.token}` }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.email, ADMIN_EMAIL);
});

test('logout is acknowledged without invalidating the shared secret', async () => {
  const response = await post('/api/auth/logout', {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

// ---------------------------------------------------------------------------
// Google sign-in endpoint guards. The happy path needs a real Google token and
// Google's JWKS, which is exercised manually against a real client id.
// ---------------------------------------------------------------------------

test('google sign-in requires a credential', async () => {
  const response = await post('/api/auth/google', {});
  assert.equal(response.status, 400);
});

test('google sign-in refuses malformed credentials', async () => {
  const previous = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  try {
    const response = await post('/api/auth/google', { credential: 'not-a-jwt' });
    assert.equal(response.status, 401);

    const longToken = `${'a'.repeat(40)}.${'b'.repeat(40)}.${'c'.repeat(40)}`;
    const second = await post('/api/auth/google', { credential: longToken });
    assert.equal(second.status, 401);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previous;
  }
});

test('google sign-in reports 503 when the server has no client id configured', async () => {
  const previous = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    const response = await post('/api/auth/google', { credential: 'header.payload.signature' });
    assert.equal(response.status, 503);
  } finally {
    if (previous !== undefined) process.env.GOOGLE_CLIENT_ID = previous;
  }
});

test('client id allow-list is parsed from a comma separated env value', () => {
  const previous = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = ' web-client.apps.googleusercontent.com , android-client.apps.googleusercontent.com ,';
  try {
    assert.deepEqual(configuredGoogleClientIds(), [
      'web-client.apps.googleusercontent.com',
      'android-client.apps.googleusercontent.com'
    ]);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previous;
  }
});

test('token verification rejects junk before any network call', async () => {
  const previous = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  try {
    await assert.rejects(
      () => verifyGoogleIdToken('definitely-not-a-jwt'),
      (error) => error instanceof GoogleAuthError && error.status === 401
    );
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previous;
  }
});
