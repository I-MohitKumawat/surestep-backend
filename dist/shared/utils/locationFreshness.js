"use strict";
/**
 * Engineering location freshness classification (TARGET_ARCHITECTURE.md §6.1).
 *
 * Note: Workflow 08-LOCATION-AND-SAFE-ZONES.md §2 defines the conceptual tiers
 * (Current, Recent, Stale, Unavailable) and explicitly delegates numeric
 * thresholds to technical architecture. The 5-minute, 20-minute, 50-metre, and
 * future-timestamp skew limits below are explicit engineering defaults rather
 * than clinical product rules:
 *   - CURRENT:     valid non-future ping age <= 5 min AND accuracy <= 50m (when reported)
 *   - RECENT:      valid non-future ping age <= 20 min (or <= 5 min with accuracy > 50m)
 *   - STALE:       valid non-future ping age > 20 min
 *   - UNAVAILABLE: missing, invalid, or future-dated (> 60s skew) timestamp
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FUTURE_TIMESTAMP_SKEW_TOLERANCE_MS = exports.FRESHNESS_CURRENT_MAX_ACCURACY_M = exports.FRESHNESS_RECENT_MAX_MIN = exports.FRESHNESS_CURRENT_MAX_MIN = void 0;
exports.computeLocationFreshness = computeLocationFreshness;
exports.FRESHNESS_CURRENT_MAX_MIN = 5;
exports.FRESHNESS_RECENT_MAX_MIN = 20;
exports.FRESHNESS_CURRENT_MAX_ACCURACY_M = 50;
exports.FUTURE_TIMESTAMP_SKEW_TOLERANCE_MS = 60000;
function computeLocationFreshness(recordedAt, accuracyM, nowMs = Date.now()) {
    if (!recordedAt) {
        return {
            freshness_tier: 'UNAVAILABLE',
            is_low_confidence: false,
            age_minutes: null,
        };
    }
    const recordedMs = recordedAt instanceof Date
        ? recordedAt.getTime()
        : new Date(recordedAt).getTime();
    if (Number.isNaN(recordedMs)) {
        return {
            freshness_tier: 'UNAVAILABLE',
            is_low_confidence: false,
            age_minutes: null,
        };
    }
    // Future-dated observations beyond benign clock skew are unreliable and must
    // never be classified as CURRENT.
    if (recordedMs - nowMs > exports.FUTURE_TIMESTAMP_SKEW_TOLERANCE_MS) {
        return {
            freshness_tier: 'UNAVAILABLE',
            is_low_confidence: true,
            age_minutes: null,
        };
    }
    const ageMinutes = Math.max(0, (nowMs - recordedMs) / (1000 * 60));
    const numericAcc = accuracyM != null ? Number(accuracyM) : null;
    const hasAccuracy = numericAcc !== null && Number.isFinite(numericAcc);
    const isLowConfidence = hasAccuracy && numericAcc > exports.FRESHNESS_CURRENT_MAX_ACCURACY_M;
    let freshnessTier;
    if (ageMinutes <= exports.FRESHNESS_CURRENT_MAX_MIN && !isLowConfidence) {
        freshnessTier = 'CURRENT';
    }
    else if (ageMinutes <= exports.FRESHNESS_RECENT_MAX_MIN) {
        freshnessTier = 'RECENT';
    }
    else {
        freshnessTier = 'STALE';
    }
    return {
        freshness_tier: freshnessTier,
        is_low_confidence: isLowConfidence,
        age_minutes: Math.round(ageMinutes * 10) / 10,
    };
}
//# sourceMappingURL=locationFreshness.js.map