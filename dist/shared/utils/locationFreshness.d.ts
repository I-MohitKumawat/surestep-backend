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
export type LocationFreshnessTier = 'CURRENT' | 'RECENT' | 'STALE' | 'UNAVAILABLE';
export declare const FRESHNESS_CURRENT_MAX_MIN = 5;
export declare const FRESHNESS_RECENT_MAX_MIN = 20;
export declare const FRESHNESS_CURRENT_MAX_ACCURACY_M = 50;
export declare const FUTURE_TIMESTAMP_SKEW_TOLERANCE_MS = 60000;
export interface LocationFreshnessResult {
    freshness_tier: LocationFreshnessTier;
    is_low_confidence: boolean;
    age_minutes: number | null;
}
export declare function computeLocationFreshness(recordedAt: string | Date | null | undefined, accuracyM?: number | null, nowMs?: number): LocationFreshnessResult;
//# sourceMappingURL=locationFreshness.d.ts.map