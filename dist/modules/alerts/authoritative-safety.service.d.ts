/**
 * SureStep — modules/alerts/authoritative-safety.service.ts
 *
 * Authoritative Safety Alerts Lifecycle and Decoupled Responder Service.
 * Baselines:
 *   - docs/architecture/TARGET_ARCHITECTURE.md (Sections 3.6, 4.3, 5.3)
 *   - docs/workflows/07-SAFETY.md
 *
 * Invariants:
 *   - SOS and Safe Zone breaches stored in safety_alerts.
 *   - Status: TRIGGERED -> ACTIVE -> VIEWED -> RESOLVED.
 *   - Responder actions recorded in safety_alert_responses (action: IM_RESPONDING).
 *   - Multiple responders permitted; does NOT mutate alert status away from active visibility.
 *   - Alert resolution is STRICTLY Circle Owner only in V1. Non-Owners receive 403 Forbidden.
 *   - No FALSE_ALARM status in V1.
 */
import { User } from '../../shared/types';
export declare class AuthoritativeSafetyService {
    /**
     * 1. Trigger SOS Alert (Patient-initiated)
     */
    triggerSOS(patientId: string, lat?: number, lng?: number): Promise<any>;
    /**
     * 2. Record "I'm Responding" Action
     * Decoupled responder ledger: records action without granting exclusive ownership or resolving alert.
     */
    respondToAlert(alertId: string, responderUser: User, notes?: string): Promise<{
        alert: any;
        response: any;
    }>;
    /**
     * 3. Resolve Safety Alert
     * INVARIANT: Resolving an alert is strictly Circle Owner only in V1 (TARGET_ARCHITECTURE.md §3.6, §4.3, §5.3).
     * Responding does NOT grant resolution authority.
     * Circle members and caregivers receive 403 Forbidden.
     */
    resolveAlert(alertId: string, resolverUser: User, notes?: string): Promise<{
        alert: any;
        response: any;
    }>;
    /**
     * 4. List Alerts for a Care Circle
     */
    listCircleAlerts(circleId: string, status?: string): Promise<any[]>;
    /**
     * 5. List Alerts for a Patient
     */
    listPatientAlerts(patientId: string, status?: string): Promise<any[]>;
    /**
     * Helper: Assert actor is authorized to receive and respond to alerts for the patient.
     */
    private assertAuthorizedRecipient;
}
export declare const authoritativeSafetyService: AuthoritativeSafetyService;
//# sourceMappingURL=authoritative-safety.service.d.ts.map