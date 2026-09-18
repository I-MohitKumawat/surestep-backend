import { User, UserMeResult } from '../../shared/types';
export declare function getMe(userId: string): Promise<UserMeResult>;
export declare function updateMe(userId: string, data: {
    name?: string;
    preferred_language?: string;
    city?: string;
    date_of_birth?: string;
    gender?: string;
    photo_url?: string;
}): Promise<User>;
export declare function upsertPatientProfile(userId: string, data: any): Promise<any>;
export declare function getPatientProfile(patientId: string): Promise<any>;
export declare function upsertCaregiverProfile(userId: string, data: any): Promise<any>;
export declare function getCaregiverProfile(caregiverId: string): Promise<any>;
export declare function upsertFamilyProfile(userId: string, data: any): Promise<any>;
//# sourceMappingURL=users.service.d.ts.map