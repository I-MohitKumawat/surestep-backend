/**
 * SureStep — modules/location/authoritative-safe-zones.service.ts
 *
 * Authoritative Care Circle Safe Zones & Location Telemetry Service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.5, 4.3, 6.1, 6.2)
 *   - docs/workflows/08-LOCATION-AND-SAFE-ZONES.md
 *
 * Invariants:
 *   - Safe Zones are owned by the Care Circle (safe_zones.circle_id).
 *   - Managed strictly by Circle Owner only in V1 (create, edit, delete, attach/detach patients).
 *   - Non-Owner members and caregivers receive 403 Forbidden.
 *   - Stale/offline telemetry (> 20 min or accuracy > 50m) NEVER generates Safe Zone breach alerts.
 *   - Stored in location_observations for historical audit/activity only.
 */
export interface CreateSafeZoneDTO {
    name: string;
    centerLat: number;
    centerLng: number;
    radiusMeters: number;
    monitoredPatientIds?: string[];
}
export interface UpdateSafeZoneDTO {
    name?: string;
    centerLat?: number;
    centerLng?: number;
    radiusMeters?: number;
    isActive?: boolean;
}
export interface LocationObservationDTO {
    lat: number;
    lng: number;
    accuracyMeters: number;
    altitudeMeters?: number | null;
    batteryPct?: number | null;
    isCharging?: boolean;
    recordedAt: string | Date;
}
export declare class AuthoritativeSafeZonesService {
    /**
     * 1. Create a Safe Zone for a Care Circle (Circle Owner only)
     */
    createSafeZone(circleId: string, actorId: string, dto: CreateSafeZoneDTO): Promise<any>;
    /**
     * 2. Update a Safe Zone (Circle Owner only)
     */
    updateSafeZone(circleId: string, zoneId: string, actorId: string, dto: UpdateSafeZoneDTO): Promise<any>;
    /**
     * 3. Delete / Deactivate a Safe Zone (Circle Owner only)
     */
    deleteSafeZone(circleId: string, zoneId: string, actorId: string): Promise<any>;
    /**
     * 4. Attach a Patient to a Safe Zone (Circle Owner only)
     */
    attachPatient(circleId: string, zoneId: string, patientId: string, actorId: string): Promise<any>;
    /**
     * 5. Detach a Patient from a Safe Zone (Circle Owner only)
     */
    detachPatient(circleId: string, zoneId: string, patientId: string, actorId: string): Promise<{
        detached: boolean;
    }>;
    /**
     * 6. List Safe Zones for a Circle
     */
    listCircleSafeZones(circleId: string): Promise<any[]>;
    /**
     * 7. Record Location Observation and Evaluate Safe Zones
     * Invariant (TARGET_ARCHITECTURE.md §6.1):
     *   - Stale / offline telemetry (> 20 min or accuracy > 50m) NEVER generates breach alerts.
     *   - Normal monitoring resumes when fresh telemetry arrives.
     */
    ingestLocationObservation(patientId: string, dto: LocationObservationDTO): Promise<{
        observation: any;
        freshnessTier: "RECENT" | "STALE";
        monitoringActive: boolean;
        breachAlertGenerated: boolean;
        reason: string;
        triggeredAlerts?: undefined;
    } | {
        observation: any;
        freshnessTier: "CURRENT";
        monitoringActive: boolean;
        breachAlertGenerated: boolean;
        triggeredAlerts: any[];
        reason?: undefined;
    }>;
}
export declare const authoritativeSafeZonesService: AuthoritativeSafeZonesService;
//# sourceMappingURL=authoritative-safe-zones.service.d.ts.map