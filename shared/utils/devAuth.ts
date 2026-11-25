/**
 * Development authentication bypass guard.
 *
 * `mock-dev-*` bearer/socket tokens are strictly disabled by default and are
 * NEVER permitted in production, regardless of any environment flag.
 */
export function isDevAuthBypassAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_DEV_AUTH_BYPASS === 'true'
  );
}
