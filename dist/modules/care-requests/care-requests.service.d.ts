import { User } from '../../shared/types';
import { CreateCareRequestInput, DeclineCareRequestInput, WithdrawCareRequestInput, CareRequestResponse } from './care-requests.types';
/**
 * 1. Create a Care Request
 */
export declare function createCareRequest(user: User, rawInput: CreateCareRequestInput): Promise<CareRequestResponse>;
/**
 * 2. Get Incoming Care Requests (Caregiver Triage)
 */
export declare function getIncomingCareRequests(user: User, status?: string): Promise<CareRequestResponse[]>;
/**
 * 3. Get Outgoing Care Requests (Patient / Family)
 */
export declare function getOutgoingCareRequests(user: User, targetPatientId?: string, statusFilter?: string): Promise<CareRequestResponse[]>;
/**
 * 4. Get Care Request By ID
 */
export declare function getCareRequestById(user: User, requestId: string): Promise<CareRequestResponse>;
/**
 * 5. Accept Care Request (Atomic Transaction)
 */
export declare function acceptCareRequest(caregiverUser: User, requestId: string): Promise<{
    request: CareRequestResponse;
    relationship: any;
}>;
/**
 * 6. Decline Care Request
 */
export declare function declineCareRequest(caregiverUser: User, requestId: string, input: DeclineCareRequestInput): Promise<{
    request: CareRequestResponse;
}>;
/**
 * 7. Withdraw Care Request
 */
export declare function withdrawCareRequest(user: User, requestId: string, input: WithdrawCareRequestInput): Promise<{
    request: CareRequestResponse;
}>;
/**
 * 8. Background Maintenance: Sweep and Mark Expired Care Requests
 * Transitions PENDING requests past expires_at to EXPIRED, and dispatches CARE_REQUEST_EXPIRED notifications.
 */
export declare function sweepExpiredCareRequests(): Promise<number>;
//# sourceMappingURL=care-requests.service.d.ts.map