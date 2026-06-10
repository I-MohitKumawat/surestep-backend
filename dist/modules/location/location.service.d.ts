export declare function recordPing(patientId: string, data: {
    lat: number;
    lng: number;
    accuracy_m?: number;
    source?: string;
    speed_kmh?: number;
    heading?: number;
    battery_pct?: number;
    network_status?: string;
    recorded_at: string;
    is_offline_sync?: boolean;
}): Promise<any>;
export declare function getCurrentLocation(patientId: string): Promise<any>;
export declare function getLocationTrail(patientId: string, limit?: number, cursor?: string): Promise<{
    pings: any[];
    has_more: boolean;
    next_cursor: any;
}>;
export declare function getZones(patientId: string): Promise<any[]>;
export declare function createZone(creatorId: string, patientId: string, data: any): Promise<any>;
export declare function updateZone(zoneId: string, userId: string, data: any): Promise<any>;
export declare function deactivateZone(zoneId: string): Promise<any>;
export declare function getAlerts(patientId: string, limit?: number, cursor?: string): Promise<{
    alerts: any[];
    has_more: boolean;
    next_cursor: any;
}>;
export declare function acknowledgeAlert(alertId: string, userId: string): Promise<any>;
export declare function evaluateGeofence(patientId: string, lat: number, lng: number): Promise<{
    state: string;
    breachedZones: any[];
    approachingZones: any[];
    activeZone?: any;
}>;
export declare function upsertUserLocation(userId: string, data: {
    lat: number;
    lng: number;
    accuracy_m?: number;
    speed_kmh?: number;
    heading?: number;
    battery_pct?: number;
    recorded_at: string;
}): Promise<void>;
export declare function getCareCircleMapLocations(patientId: string): Promise<{
    patient: {
        id: any;
        role: any;
        photo_url: any;
        name: any;
        lat: number | null;
        lng: number | null;
        recorded_at: any;
    } | null;
    caregiver: {
        id: any;
        role: any;
        photo_url: any;
        name: any;
        lat: number | null;
        lng: number | null;
        recorded_at: any;
    } | null;
    familyMembers: {
        id: any;
        role: any;
        photo_url: any;
        name: any;
        lat: number | null;
        lng: number | null;
        recorded_at: any;
    }[];
}>;
//# sourceMappingURL=location.service.d.ts.map