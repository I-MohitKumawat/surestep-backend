"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDevAuthBypassAllowed = isDevAuthBypassAllowed;
/**
 * Development authentication bypass guard.
 *
 * `mock-dev-*` bearer/socket tokens are strictly disabled by default and are
 * NEVER permitted in production, regardless of any environment flag.
 */
function isDevAuthBypassAllowed() {
    return (process.env.NODE_ENV !== 'production' &&
        process.env.ALLOW_DEV_AUTH_BYPASS === 'true');
}
//# sourceMappingURL=devAuth.js.map