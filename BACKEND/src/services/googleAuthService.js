// Google Identity Services (GIS) token verification.
//
// The web dashboard and the Android app both obtain a signed Google ID token
// (a JWT) from Google and POST it to /api/auth/google. Nothing is trusted until
// the signature, issuer and audience of that token have been checked here, so
// the browser/app never has to be trusted and no client secret is shipped.
//
// Configure with GOOGLE_CLIENT_ID (comma separated if you have several OAuth
// clients, e.g. a web client and an Android client that share an audience).

import { createRemoteJWKSet, jwtVerify } from 'jose';

// Google publishes the rotating public keys used to sign ID tokens.
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

// Google uses both spellings depending on the issuer version.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export class GoogleAuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'GoogleAuthError';
    this.status = status;
  }
}

export function configuredGoogleClientIds() {
  return (process.env.GOOGLE_CLIENT_ID || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isGoogleAuthConfigured() {
  return configuredGoogleClientIds().length > 0;
}

function looksLikeJwt(token) {
  return typeof token === 'string' && token.split('.').length === 3 && token.length < 8192;
}

/**
 * Verify a Google ID token and return the identity it carries.
 *
 * @param {string} credential Raw ID token (JWT) from Google Sign-In.
 * @returns {Promise<{sub: string, email: string, name: string, picture: string|null, emailVerified: boolean}>}
 */
export async function verifyGoogleIdToken(credential) {
  const audience = configuredGoogleClientIds();
  if (audience.length === 0) {
    throw new GoogleAuthError('Google sign-in is not configured on this server', 503);
  }

  // Cheap shape check first: a malformed token must never trigger a JWKS fetch.
  if (!looksLikeJwt(credential)) {
    throw new GoogleAuthError('Invalid Google credential', 401);
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience,
      clockTolerance: 60
    }));
  } catch (error) {
    // Never leak verification internals (key ids, claim names) to the client.
    console.warn('[auth] Google token rejected:', error.code || error.message);
    throw new GoogleAuthError('Google credential could not be verified', 401);
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';
  if (!email) {
    throw new GoogleAuthError('Google account did not share an email address', 401);
  }

  return {
    sub: String(payload.sub || ''),
    email,
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email.split('@')[0],
    picture: typeof payload.picture === 'string' ? payload.picture : null,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true'
  };
}
