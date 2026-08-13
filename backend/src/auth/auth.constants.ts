export const SESSION_COOKIE_NAME = 'dormproj_session';
export const OAUTH_STATE_COOKIE_NAME = 'oauth_state';

export const SESSION_TTL = '24h';
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Живёт ровно на время OAuth-редиректа туда и обратно — незачем держать дольше.
export const OAUTH_STATE_MAX_AGE_MS = 5 * 60 * 1000;

export const ROSNOU_ID_SCOPE = 'email';
