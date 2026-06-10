/**
 * Core Awareness Engine — evaluates all 4 state dimensions for a patient
 * on every location ping. Writes result to patient_states (upsert).
 *
 * Called asynchronously from location.controller.ping — never blocks HTTP.
 *
 * Changes from v1:
 *  - GPS confidence filter: skip alert creation for accuracy_m >= 50 (Low Confidence)
 *  - ZONE_ENTER alert created when patient returns inside a zone
 *  - APPROACHING_BOUNDARY alert created for approaching zones
 *  - FCM push sent to caregivers on BREACH / CRITICAL / APPROACHING / SOS
 *  - WebSocket state:change emitted to patient room after state upsert
 */
export declare function evaluateAwareness(patientId: string, lat: number, lng: number, speed_kmh: number, accuracy_m?: number, battery_pct?: number, network_status?: string): Promise<void>;
export declare function updateEngagement(patientId: string, state: string): Promise<void>;
export declare function getPatientState(patientId: string): Promise<any>;
export declare function getAllPatientStates(caregiverId: string): Promise<any[]>;
export declare function triggerSOS(patientId: string): Promise<void>;
//# sourceMappingURL=awareness.service.d.ts.map