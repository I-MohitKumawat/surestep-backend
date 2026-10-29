# SureStep V1 — API Contracts

This document specifies the exact API contracts for all working V1 backend endpoints of the SureStep dementia care platform.

---

## 1. Overview & Standard Conventions

### Base URL
```
http://localhost:3000/api/v1
```

### Standard Headers
All protected endpoints require a Firebase Bearer token:
```http
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

### Developer Token Bypass (Local / Manual Testing)
The backend includes a dev-mode token interceptor in `shared/middleware/authenticate.ts`. You can test any role directly without generating real Firebase SMS OTPs by passing one of the following tokens in the `Authorization` header:

* `mock-dev-patient-token` (Auto-provisions/authenticates demo `PATIENT`: Demo Patient, `+919999999999`)
* `mock-dev-caregiver-token` (Auto-provisions/authenticates demo `CAREGIVER`: Demo Caregiver, `+918888888888`)
* `mock-dev-family-token` (Auto-provisions/authenticates demo `FAMILY`: Demo Family, `+917777777777`)

### Standard Response Envelope (HTTP 200 / 201)
All successful endpoints return data wrapped inside a standard JSON envelope:
```json
{
  "success": true,
  "data": { ... }
}
```

### Standard Error Envelope (HTTP 4xx / 5xx)
All errors return consistent structure:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description of error"
  }
}
```

#### Common Error Codes
* `400 BAD_REQUEST / VALIDATION_ERROR`: Invalid inputs or business rule validation failed.
* `401 UNAUTHORIZED`: Missing, expired, or invalid Bearer token.
* `403 ROLE_NOT_PERMITTED`: Caller role does not permit this action.
* `403 RELATIONSHIP_REQUIRED`: Caller has no confirmed relationship with target patient.
* `404 NOT_FOUND`: Target entity or patient does not exist.
* `404 USER_NOT_PROVISIONED`: Firebase token valid, but user row not yet created via `/auth/provision`.
* `409 CONFLICT / ACTIVE_RELATIONSHIP_EXISTS`: Duplicate request, state conflict, or active link already exists.
* `422 VALIDATION_ERROR`: Zod schema validation failed.

---

## 2. Authentication & User Identity

### `POST /auth/provision`
Creates or links the in-app database record immediately after Firebase signs in.
* **Auth**: Public (Reads Bearer token from `Authorization` header)
* **Allowed Roles**: Any
* **Request Body**:
```json
{
  "name": "Ramesh Kumar",
  "role": "PATIENT",
  "phone": "+919876543210",
  "preferred_language": "en"
}
```
*Field Specifications*:
* `name` (string, required): 1–100 characters.
* `role` (string, optional): `"PATIENT"` | `"CAREGIVER"` | `"FAMILY"`. Defaults to `"PATIENT"`.
* `phone` (string, optional): E.164 format (e.g. `+919876543210`).
* `preferred_language` (string, optional): ISO code (default: `"en"`).
* **Success Response** (`201 Created`):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "e4b2d1c0-1234-4567-89ab-cdef01234567",
      "firebase_uid": "firebase_uid_string",
      "email": "user@example.com",
      "phone": "+919876543210",
      "name": "Ramesh Kumar",
      "role": "PATIENT",
      "preferred_language": "en",
      "is_active": true,
      "onboarding_complete": false,
      "created_at": "2026-10-28T10:00:00.000Z",
      "updated_at": "2026-10-28T10:00:00.000Z"
    }
  }
}
```

---

### `GET /users/me`
Fetches current session user, resolved active domain role, and linked care context graph.
* **Auth**: Bearer token required
* **Allowed Roles**: All (`PATIENT`, `CAREGIVER`, `FAMILY`)
* **Request Body**: None
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "e4b2d1c0-1234-4567-89ab-cdef01234567",
      "name": "Ramesh Kumar",
      "role": "PATIENT",
      "phone": "+919876543210",
      "city": "Bangalore",
      "onboarding_complete": true
    },
    "activeRole": "PATIENT",
    "careContext": {
      "relationships": [
        {
          "id": "rel-uuid",
          "patient_user_id": "e4b2d1c0-1234-4567-89ab-cdef01234567",
          "related_user_id": "caregiver-uuid",
          "relationship_type": "CAREGIVER",
          "status": "ACTIVE_CARE",
          "patient_name": "Ramesh Kumar",
          "related_name": "Priya Sharma"
        }
      ],
      "profiles": {
        "hasPatientProfile": true,
        "hasCaregiverProfile": false,
        "hasFamilyProfile": false,
        "patientOnboardingSource": "SELF"
      }
    }
  }
}
```

---

### `PATCH /users/me`
Updates core user metadata.
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Request Body** (all fields optional):
```json
{
  "name": "Ramesh K.",
  "preferred_language": "hi",
  "city": "Bangalore",
  "date_of_birth": "1954-08-15",
  "gender": "MALE",
  "photo_url": "http://localhost:3000/uploads/photo-123.jpg"
}
```
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "e4b2d1c0-1234-4567-89ab-cdef01234567",
      "name": "Ramesh K.",
      "city": "Bangalore",
      "preferred_language": "hi"
    }
  }
}
```

---

### `POST /auth/devices`
Registers or updates FCM device token for push notifications.
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Request Body**:
```json
{
  "device_type": "PHONE_ANDROID",
  "device_token": "fcm_token_string_here",
  "device_name": "Pixel 7 Pro",
  "os_version": "Android 14",
  "app_version": "1.0.0"
}
```
*Valid `device_type`*: `"PHONE_IOS"`, `"PHONE_ANDROID"`, `"WEARABLE"`, `"GLASS"`, `"HOME_HUB"`.
* **Success Response** (`201 Created`):
```json
{
  "success": true,
  "data": {
    "device": {
      "id": "device-uuid",
      "user_id": "user-uuid",
      "device_token": "fcm_token_string_here",
      "last_seen_at": "2026-10-28T10:05:00.000Z"
    }
  }
}
```

---

## 3. Role Profiles & Onboarding

### `PUT /users/patient` (Alias: `PUT /profiles/patient`)
Upserts patient clinical baseline and emergency contact data.
* **Auth**: Bearer token required
* **Allowed Roles**: `PATIENT`
* **Request Body**:
```json
{
  "emergency_contact_name": "Anita Kumar",
  "emergency_contact_phone": "+919876543211",
  "emergency_contact_relation": "DAUGHTER",
  "diagnosis": "Alzheimer's Disease",
  "diagnosis_date": "2023-11-20",
  "severity_level": "MILD",
  "living_arrangement": "WITH_FAMILY",
  "care_needs": ["MEDICATION_REMINDERS", "MEAL_PREPARATION", "MOBILITY_ASSISTANCE"],
  "safety_concerns": ["WANDERING", "FALL_RISK"],
  "communication_preferences": ["SIMPLE_WORDS", "REPEATED_PROMPTS"],
  "medications": [
    { "name": "Donepezil", "dosage": "10mg", "timing": "08:30" }
  ],
  "known_triggers": ["Loud noises", "Crowds"],
  "comfort_items": ["Old family photo album", "Blue shawl"],
  "favourite_songs": ["Classical Carnatic instrumental"]
}
```
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "profile": {
      "user_id": "patient-uuid",
      "diagnosis": "Alzheimer's Disease",
      "severity_level": "MILD",
      "emergency_contact_status": "PENDING",
      "updated_at": "2026-10-28T10:10:00.000Z"
    }
  }
}
```

---

### `GET /users/patient/:id` (Alias: `GET /profiles/patient/:id`)
Retrieves a patient's profile.
* **Auth**: Bearer token required
* **Allowed Roles**: Linked Caregiver, Linked Family, or Patient
* **Params**: `:id` (UUID of patient)
* **Success Response** (`200 OK`): Returns populated `profile` object.

---

### `PUT /users/caregiver` (Alias: `PUT /profiles/caregiver`)
Upserts professional caregiver qualifications, rates, and discoverability settings.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Request Body**:
```json
{
  "professional_role": "REGISTERED_NURSE",
  "years_of_experience": 8,
  "dementia_experience_years": 5,
  "has_dementia_training": true,
  "specializations": ["Dementia Care", "Palliative Care", "Mobility Assistance"],
  "care_capabilities": [
    "MEDICATION_ADMINISTRATION",
    "VITAL_SIGNS_MONITORING",
    "WANDERING_PREVENTION",
    "FALL_PREVENTION"
  ],
  "qualifications": [
    { "degree": "B.Sc Nursing", "institution": "NIMHANS", "year": 2018 }
  ],
  "languages_spoken": ["English", "Hindi", "Kannada"],
  "availability_types": ["FULL_TIME", "MORNING_SHIFT", "EVENING_SHIFT"],
  "service_city": "Bangalore",
  "service_radius_km": 15,
  "max_patients": 3,
  "hourly_rate": 350.00,
  "daily_rate": 2400.00,
  "bio": "Certified geriatric nurse specialized in memory care and behavioral support.",
  "is_discoverable": true
}
```
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "profile": {
      "user_id": "caregiver-uuid",
      "professionalRole": "REGISTERED_NURSE",
      "yearsExperience": 8,
      "dementiaExperienceYears": 5,
      "serviceCity": "Bangalore",
      "hourlyRate": "350.00",
      "dailyRate": "2400.00",
      "isDiscoverable": true,
      "rating": null,
      "ratingCount": 0
    }
  }
}
```

---

### `GET /users/caregiver/:id` (Alias: `GET /profiles/caregiver/:id`)
Retrieves a caregiver's public or detailed profile.
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Params**: `:id` (UUID of caregiver)
* **Success Response** (`200 OK`): Returns `{ profile: CaregiverProfile }`.

---

### `PUT /users/family` (Alias: `PUT /profiles/family`)
Upserts family member preferences and patient proximity.
* **Auth**: Bearer token required
* **Allowed Roles**: `FAMILY`
* **Request Body**:
```json
{
  "relation_label": "Daughter",
  "proximity": "SAME_CITY",
  "whatsapp_number": "+919876543211",
  "notify_on_breach": true,
  "notify_on_missed_critical": true,
  "notify_on_sos": true,
  "notify_on_daily_digest": true,
  "digest_frequency": "DAILY"
}
```
* **Success Response** (`200 OK`): Returns updated family profile row.

---

## 4. Caregiver Discovery & Care Requests

### `GET /care/discovery/caregivers`
Searches verified, discoverable caregivers with normalized city filtering.
* **Auth**: Bearer token required
* **Allowed Roles**: `PATIENT`, `FAMILY`
* **Query Parameters**:
  * `city` (string, optional) — matches aliases (e.g. `bengaluru` matches `bangalore`)
  * `specialization` (string, optional)
  * `maxRate` (number, optional)
  * `limit` (number, optional, default: `20`)
  * `cursor` (string, optional)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "caregivers": [
      {
        "id": "caregiver-uuid",
        "name": "Priya Sharma",
        "photoUrl": "http://localhost:3000/uploads/photo-caregiver.jpg",
        "city": "Bangalore",
        "professionalRole": "REGISTERED_NURSE",
        "yearsExperience": 8,
        "dementiaExperienceYears": 5,
        "hourlyRate": 350.0,
        "dailyRate": 2400.0,
        "rating": 4.9,
        "ratingCount": 12,
        "isVerified": true,
        "specializations": ["Dementia Care"]
      }
    ],
    "hasMore": false,
    "nextCursor": null
  }
}
```

---

### `GET /care/discovery/caregivers/:caregiverId`
Detailed caregiver view with capacity and capabilities breakdown.
* **Auth**: Bearer token required
* **Allowed Roles**: `PATIENT`, `FAMILY`
* **Params**: `:caregiverId` (UUID)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "caregiver": {
      "id": "caregiver-uuid",
      "name": "Priya Sharma",
      "bio": "Certified geriatric nurse...",
      "professionalRole": "REGISTERED_NURSE",
      "yearsExperience": 8,
      "dementiaExperienceYears": 5,
      "careCapabilities": ["MEDICATION_ADMINISTRATION"],
      "qualifications": [...],
      "languagesSpoken": ["English", "Kannada"],
      "hourlyRate": 350.0,
      "dailyRate": 2400.0,
      "rating": 4.9,
      "ratingCount": 12,
      "hasCapacity": true
    }
  }
}
```

---

### `POST /care-requests`
Submits a formal care request to a caregiver.
* **Auth**: Bearer token required
* **Allowed Roles**: `PATIENT`, `FAMILY`
* **Request Body**:
```json
{
  "patientId": "patient-uuid",
  "caregiverId": "caregiver-uuid",
  "scheduleType": "RECURRING",
  "requestedShifts": ["MORNING", "AFTERNOON"],
  "daysOfWeek": [1, 2, 3, 4, 5],
  "startDate": "2026-11-01",
  "proposedRateType": "HOURLY",
  "proposedRateInr": 350,
  "requestedCapabilities": ["MEDICATION_ADMINISTRATION", "WANDERING_PREVENTION"],
  "careContextNotes": "Assistance needed for morning medication, breakfast, and outdoor walk."
}
```
*Schedule Type Rules*:
* `RECURRING`: Requires `requestedShifts` and `daysOfWeek` (0=Sun, 1=Mon, ..., 6=Sat); `endDate` must be omitted.
* `DATE_RANGE`: Requires `requestedShifts`, `startDate`, and `endDate`.
* `ONE_TIME`: Requires `requestedShifts` and `startDate`; `endDate` and `daysOfWeek` must be omitted.
* **Success Response** (`201 Created`):
```json
{
  "success": true,
  "data": {
    "request": {
      "id": "req-uuid",
      "patientId": "patient-uuid",
      "caregiverId": "caregiver-uuid",
      "requesterId": "requester-uuid",
      "status": "PENDING",
      "scheduleType": "RECURRING",
      "startDate": "2026-11-01",
      "proposedRateInr": 350,
      "expiresAt": "2026-11-03T10:00:00.000Z"
    }
  }
}
```

---

### `GET /care-requests/incoming`
Lists care requests received by the authenticated caregiver.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Query Parameters**: `status` (`ALL`, `PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED`)
* **Success Response** (`200 OK`): Returns `{ requests: [ CareRequest ] }`.

---

### `GET /care-requests/outgoing`
Lists care requests sent by the authenticated patient/family.
* **Auth**: Bearer token required
* **Allowed Roles**: `PATIENT`, `FAMILY`
* **Query Parameters**: `patientId` (UUID, optional if patient), `status` (optional)
* **Success Response** (`200 OK`): Returns `{ requests: [ CareRequest ] }`.

---

### `GET /care-requests/:id`
Retrieves single care request details.
* **Auth**: Bearer token required
* **Allowed Roles**: Parties to the request (requester, patient, caregiver, or family)
* **Params**: `:id` (UUID)
* **Success Response** (`200 OK`): Returns populated `request` object.

---

### `POST /care-requests/:id/accept`
Caregiver accepts a pending care request.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Params**: `:id` (UUID of care request)
* **Side-Effect**: Atomically updates `care_requests.status = 'ACCEPTED'` and inserts/updates `patient_relationships` with status `'ACCEPTED'`.
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "request": {
      "id": "req-uuid",
      "status": "ACCEPTED"
    },
    "relationship": {
      "id": "rel-uuid",
      "patient_user_id": "patient-uuid",
      "related_user_id": "caregiver-uuid",
      "relationship_type": "CAREGIVER",
      "status": "ACCEPTED"
    }
  }
}
```

---

### `POST /care-requests/:id/decline`
Caregiver declines a care request.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Params**: `:id` (UUID of care request)
* **Request Body**:
```json
{
  "declineReason": "SCHEDULE_CONFLICT",
  "notes": "Currently at maximum patient capacity during morning shifts."
}
```
* **Success Response** (`200 OK`): Returns `{ request: { id, status: "DECLINED" } }`.

---

### `POST /care-requests/:id/withdraw`
Requester cancels their own pending care request.
* **Auth**: Bearer token required
* **Allowed Roles**: `PATIENT`, `FAMILY`
* **Params**: `:id` (UUID of care request)
* **Request Body**:
```json
{
  "withdrawReason": "FOUND_ANOTHER_CAREGIVER",
  "notes": "Arranged alternative care support."
}
```
* **Success Response** (`200 OK`): Returns `{ request: { id, status: "WITHDRAWN" } }`.

---

## 5. Relationships & Care Circle Lifecycle

### `GET /relationships/my-patients`
Returns all active and pending patients linked to the caregiver.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "patients": [
      {
        "id": "patient-uuid",
        "name": "Ramesh Kumar",
        "photo_url": null,
        "city": "Bangalore",
        "relationship_id": "rel-uuid",
        "relationship_type": "CAREGIVER",
        "status": "ACTIVE_CARE",
        "confirmed_at": "2026-10-15T09:00:00.000Z"
      }
    ]
  }
}
```

---

### `GET /relationships/my-caregivers`
Returns confirmed caregivers linked to the patient.
* **Auth**: Bearer token required
* **Allowed Roles**: `PATIENT`, `FAMILY`
* **Query Parameters**: `patientId` (UUID, required if caller is `FAMILY`)
* **Success Response** (`200 OK`): Returns `{ caregivers: [ CaregiverSummary ] }`.

---

### `POST /relationships/patient/:patientId/meet`
Marks the initial meeting/consultation between caregiver and patient as completed.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Params**: `:patientId` (UUID)
* **State Transition**: Moves `patient_relationships.status` from `'ACCEPTED'` to `'MEETING_COMPLETED'`, unlocking the clinical assessment.
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "relationship": {
      "id": "rel-uuid",
      "status": "MEETING_COMPLETED"
    }
  }
}
```

---

### `POST /family/request-access`
Family member submits a request to join a patient's care circle using the patient's registered phone number.
* **Auth**: Bearer token required
* **Allowed Roles**: `FAMILY`
* **Request Body**:
```json
{
  "patient_phone": "+919876543210"
}
```
* **Success Response** (`201 Created`):
```json
{
  "success": true,
  "data": {
    "relationship": {
      "id": "rel-uuid",
      "patient_user_id": "patient-uuid",
      "related_user_id": "family-uuid",
      "relationship_type": "FAMILY_CLOSE",
      "status": "PENDING"
    },
    "message": "Access requested — awaiting care circle approval"
  }
}
```

---

### `GET /family/access-status`
Checks the approval status of a family member's pending access request.
* **Auth**: Bearer token required
* **Allowed Roles**: `FAMILY`
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "status": {
      "status": "PENDING",
      "relationship_type": "FAMILY_CLOSE",
      "patient_name": "Ramesh Kumar"
    }
  }
}
```

---

### `POST /relationships/family/:id/approve`
Caregiver approves a family member's access request.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Params**: `:id` (UUID of the `patient_relationships` record)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "relationship": {
      "id": "rel-uuid",
      "status": "CONFIRMED"
    }
  }
}
```

---

### `POST /care-relationships/:relationshipId/end`
Terminates an ongoing care relationship.
* **Auth**: Bearer token required
* **Allowed Roles**: Patient, Caregiver, or authorized Family party to the relationship
* **Params**: `:relationshipId` (UUID)
* **Request Body**:
```json
{
  "reason": "PATIENT_CHOICE",
  "notes": "Family moving to another city."
}
```
*Valid Reasons*: `"PATIENT_CHOICE"`, `"CAREGIVER_RESIGNATION"`, `"MUTUAL_AGREEMENT"`, `"CARE_NEEDS_CHANGED"`, `"RELOCATION"`, `"NON_PAYMENT"`, `"BREACH_OF_TERMS"`, `"OTHER"`.
* **Success Response** (`200 OK`): Returns `{ relationship: { id, status: "ENDED", ended_at: "..." } }`.

---

### `POST /care-relationships/:relationshipId/resignation`
Caregiver submits a formal resignation notice.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Params**: `:relationshipId` (UUID)
* **Request Body**:
```json
{
  "reason": "HEALTH_REASONS",
  "notes": "Unable to continue full-time shifts starting next month."
}
```
*Valid Reasons*: `"PERSONAL_REASONS"`, `"HEALTH_REASONS"`, `"SCHEDULE_UNSUITABLE"`, `"RELOCATION"`, `"CARE_NEEDS_EXCEED_SKILLS"`, `"OTHER"`.
* **Success Response** (`200 OK`): Returns `{ resignation: { id, status: "PENDING", ... } }`.

---

## 6. Clinical Assessments & Care Plans

### `POST /assessments/patient/:patientId`
Saves a draft assessment or completes and locks the assessment, automatically generating the patient's Care Plan and elevating the relationship to `ACTIVE_CARE`.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER` (must have relationship status `MEETING_COMPLETED`, `ASSESSMENT_PENDING`, or `ACTIVE_CARE`)
* **Params**: `:patientId` (UUID)
* **Request Body**:
```json
{
  "status": "COMPLETED",
  "patient_basics": {
    "preferred_name": "Ramesh-ji",
    "living_arrangement": "Lives with daughter",
    "primary_language": "Kannada"
  },
  "emergency_contacts": [
    {
      "name": "Anita Kumar",
      "relationship": "Daughter",
      "phone": "+919876543211",
      "priority": 1
    }
  ],
  "cognitive": {
    "memory_concerns": "Short-term memory loss; forgets recent conversations",
    "orientation_concerns": "Disoriented in evenings (sundowning)",
    "wandering_risk": "High in unfamiliar settings",
    "confusion_frequency": "DAILY"
  },
  "risk": {
    "fall_risk": "Medium",
    "wandering_risk": "High",
    "medication_adherence_risk": "High",
    "emergency_risk": "Low"
  },
  "mobility": "Independent with walking stick",
  "support_needs": {
    "medication_reminders": true,
    "meal_reminders": true,
    "hydration_reminders": true
  },
  "tech_comfort": "Needs caregiver help to use phone",
  "notes": {
    "clinical_summary": "Mild-to-moderate cognitive impairment requiring structured routine stabilization."
  }
}
```
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "assessmentId": "assessment-uuid",
    "status": "COMPLETED",
    "relationshipStatus": "ACTIVE_CARE"
  }
}
```

---

### `GET /care-plans/patient/:patientId`
Fetches the active Care Plan generated from the completed clinical assessment.
* **Auth**: Bearer token required
* **Allowed Roles**: Linked Caregiver, Linked Family, or Patient
* **Params**: `:patientId` (UUID)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "carePlan": {
      "id": "careplan-uuid",
      "patient_id": "patient-uuid",
      "assessment_id": "assessment-uuid",
      "care_goals": "Stabilize daily routines; prevent wandering; ensure 100% adherence to Donepezil.",
      "monitoring_requirements": "Active geofencing 24/7; hourly routine adherence verification; sundowning prompts.",
      "risk_profile": {
        "fall_risk": "Medium",
        "wandering_risk": "High",
        "medication_adherence_risk": "High",
        "emergency_risk": "Low"
      },
      "created_at": "2026-10-28T10:30:00.000Z",
      "updated_at": "2026-10-28T10:30:00.000Z"
    }
  }
}
```

---

## 7. Routines & Daily Tasks

### `GET /routines/patient/:patientId`
Lists all active routine templates configured for a patient.
* **Auth**: Bearer token required
* **Allowed Roles**: Caregiver, Family, Patient
* **Params**: `:patientId` (UUID)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "template-uuid",
        "patient_id": "patient-uuid",
        "title": "Morning Medication",
        "instructions_md": "Take 1 tablet of **Donepezil (10mg)** with a full glass of water.",
        "caregiver_notes": "Ensure patient has eaten breakfast before taking medication.",
        "category": "medication",
        "priority": "critical",
        "icon_name": "pill",
        "start_date": "2026-10-01",
        "end_date": null,
        "is_active": true,
        "execution_times": [
          { "id": "time-uuid", "template_id": "template-uuid", "scheduled_time": "08:30:00" }
        ],
        "attachments": []
      }
    ]
  }
}
```

---

### `POST /routines/patient/:patientId`
Creates a new routine template and immediately generates today's task instance and scheduled reminders.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Params**: `:patientId` (UUID)
* **Request Body**:
```json
{
  "title": "Hydration Check",
  "instructions_md": "Drink a glass of warm water or tender coconut.",
  "category": "hydration",
  "priority": "medium",
  "icon_name": "glass-water",
  "start_date": "2026-10-28",
  "completion_window": "1 hour",
  "execution_times": [
    { "scheduled_time": "11:00:00" },
    { "scheduled_time": "16:00:00" }
  ]
}
```
* **Success Response** (`201 Created`): Returns created routine template with execution times.

---

### `PATCH /routines/:id`
Updates an existing routine template and re-synchronizes pending task instances.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER` (must be the creator)
* **Params**: `:id` (UUID of routine template)
* **Request Body**: Same fields as creation (partial updates supported).
* **Success Response** (`200 OK`): Returns updated routine template.

---

### `DELETE /routines/:id`
Soft-deletes (deactivates) a routine template and cancels all uncompleted task instances.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Params**: `:id` (UUID)
* **Success Response** (`200 OK`): `{ "success": true, "data": { "message": "Routine deactivated" } }`

---

### `GET /tasks/patient/:patientId/today`
Fetches today's routine tasks for the patient. Synchronizes generated tasks on demand if not yet generated.
* **Auth**: Bearer token required
* **Allowed Roles**: Patient, Linked Caregiver, Linked Family
* **Params**: `:patientId` (UUID)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "task-uuid",
        "patient_id": "patient-uuid",
        "template_id": "template-uuid",
        "title": "Morning Medication",
        "instructions_md": "Take 1 tablet of **Donepezil (10mg)** with a full glass of water.",
        "category": "medication",
        "priority": "critical",
        "scheduled_time": "08:30:00",
        "scheduled_date": "2026-10-28",
        "status": "PENDING",
        "is_critical": true,
        "completed_at": null,
        "completed_by": null
      }
    ]
  }
}
```

---

### `POST /tasks/:id/status`
Updates the status of a daily task (used by both the online UI and the mobile offline sync queue).
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Params**: `:id` (UUID of task instance)
* **Request Body**:
```json
{
  "status": "DONE",
  "client_action_id": "c73a2169-234b-4861-a8cf-8d960714b785"
}
```
*Valid Status Values*: `"PENDING"`, `"DONE"`, `"MISSED"`, `"OVERDUE"`, `"UNSURE"`, `"SKIPPED"`.
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "task": {
      "id": "task-uuid",
      "status": "DONE",
      "completed_at": "2026-10-28T08:34:12.000Z",
      "completed_by": "patient-uuid",
      "client_action_id": "c73a2169-234b-4861-a8cf-8d960714b785"
    }
  }
}
```

---

### `GET /tasks/patient/:patientId/adherence`
Returns the daily adherence summary snapshot for a given date.
* **Auth**: Bearer token required
* **Allowed Roles**: Linked Caregiver, Family, Patient
* **Params**: `:patientId` (UUID)
* **Query Parameters**: `date` (YYYY-MM-DD, defaults to current date)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "adherence": {
      "patient_id": "patient-uuid",
      "snapshot_date": "2026-10-28",
      "total_tasks": 5,
      "completed_tasks": 4,
      "missed_tasks": 0,
      "critical_missed": 0,
      "adherence_pct": 80.0
    }
  }
}
```

---

## 8. Location, Geofencing & Safety Alerts

### `POST /location/ping`
Ingests real-time GPS telemetry from mobile device. Evaluates geofence boundaries and updates patient safety state.
* **Auth**: Bearer token required
* **Allowed Roles**: `PATIENT`, `CAREGIVER`, `FAMILY`
* **Request Body**:
```json
{
  "lat": 12.971598,
  "lng": 77.594562,
  "accuracy_m": 8.5,
  "battery_pct": 82,
  "network_status": "WIFI",
  "speed_kmh": 0.0,
  "heading": 0.0,
  "recorded_at": "2026-10-28T10:45:00.000Z"
}
```
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "ping": {
      "id": "ping-uuid",
      "patient_id": "patient-uuid",
      "lat": 12.971598,
      "lng": 77.594562,
      "recorded_at": "2026-10-28T10:45:00.000Z"
    }
  }
}
```

---

### `GET /location/patient/:patientId/care-circle-map`
Fetches current location coordinates for patient, assigned caregiver, and family members for the live map screen.
* **Auth**: Bearer token required
* **Allowed Roles**: Linked Caregiver, Family, Patient
* **Params**: `:patientId` (UUID)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "patient": {
      "id": "patient-uuid",
      "name": "Ramesh Kumar",
      "role": "PATIENT",
      "photo_url": null,
      "lat": 12.971598,
      "lng": 77.594562,
      "recorded_at": "2026-10-28T10:45:00.000Z",
      "battery_pct": 82,
      "safety_state": "SAFE",
      "current_zone_name": "Home Safe Zone"
    },
    "caregiver": {
      "id": "caregiver-uuid",
      "name": "Priya Sharma",
      "role": "CAREGIVER",
      "photo_url": "http://localhost:3000/uploads/photo-cg.jpg",
      "lat": 12.973000,
      "lng": 77.596000,
      "recorded_at": "2026-10-28T10:44:20.000Z"
    },
    "familyMembers": [
      {
        "id": "family-uuid",
        "name": "Anita Kumar",
        "role": "FAMILY",
        "photo_url": null,
        "lat": 12.980000,
        "lng": 77.600000,
        "recorded_at": "2026-10-28T10:40:00.000Z"
      }
    ]
  }
}
```

---

### `GET /location/geofences/patient/:patientId`
Retrieves all configured geofence zones for a patient.
* **Auth**: Bearer token required
* **Allowed Roles**: Linked Caregiver, Family, Patient
* **Params**: `:patientId` (UUID)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "zones": [
      {
        "id": "zone-uuid",
        "patient_id": "patient-uuid",
        "label": "Home Safe Zone",
        "zone_type": "HOME",
        "center_lat": 12.971598,
        "center_lng": 77.594562,
        "radius_m": 250,
        "boundary_type": "SOFT",
        "approach_threshold_pct": 80,
        "is_active": true
      }
    ]
  }
}
```

---

### `POST /location/geofences/patient/:patientId`
Creates a new geofence boundary zone.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`, `GUARDIAN`
* **Params**: `:patientId` (UUID)
* **Request Body**:
```json
{
  "label": "Park Walk Boundary",
  "zone_type": "PARK",
  "center_lat": 12.974000,
  "center_lng": 77.598000,
  "radius_m": 400,
  "boundary_type": "HARD",
  "approach_threshold_pct": 85
}
```
* **Success Response** (`201 Created`): Returns created geofence zone.

---

### `POST /alerts/sos/patient/:patientId`
Triggers an emergency SOS signal for the patient.
* **Auth**: Bearer token required
* **Allowed Roles**: `PATIENT` (must match caller's own ID)
* **Params**: `:patientId` (UUID)
* **Side-Effect**: Sets `patient_states.sos_active = true`, creates a `CRITICAL` geofence alert, and broadcasts `sos:triggered` on WebSocket.
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "message": "SOS triggered",
    "alert": {
      "id": "alert-uuid",
      "patient_id": "patient-uuid",
      "alert_type": "SOS_TRIGGERED",
      "severity": "CRITICAL",
      "status": "OPEN",
      "lat": 12.971598,
      "lng": 77.594562,
      "created_at": "2026-10-28T10:50:00.000Z"
    }
  }
}
```

---

### `GET /alerts/caregiver/feed`
Returns aggregated active alerts across all patients linked to the authenticated caregiver.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`
* **Query Parameters**: `limit` (default: `30`), `cursor` (optional ISO timestamp)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "alert-uuid",
        "patient_id": "patient-uuid",
        "patient_name": "Ramesh Kumar",
        "alert_type": "ZONE_BREACH",
        "severity": "CRITICAL",
        "status": "OPEN",
        "lat": 12.978000,
        "lng": 77.602000,
        "acknowledged_by_name": null,
        "responder_name": null,
        "created_at": "2026-10-28T10:48:00.000Z"
      }
    ],
    "has_more": false,
    "next_cursor": null
  }
}
```

---

### `POST /alerts/:alertId/acknowledge`
Acknowledges an alert by claiming initial review.
* **Auth**: Bearer token required
* **Allowed Roles**: Linked Caregiver, Family
* **Params**: `:alertId` (UUID)
* **Success Response** (`200 OK`): Returns alert with `status = "ACKNOWLEDGED"`, `acknowledged_by`, and `acknowledged_at`.

---

### `POST /alerts/:alertId/respond`
Marks that the caregiver or family member is actively responding (e.g. en route to patient).
* **Auth**: Bearer token required
* **Allowed Roles**: Linked Caregiver, Family
* **Params**: `:alertId` (UUID)
* **Success Response** (`200 OK`): Returns alert with `status = "RESPONDING"`, `responder_id`, `responder_role`, and `responded_at`.

---

### `POST /alerts/patient/:patientId/resolve`
Resolves all open/responding alerts for a patient, turns off active SOS, and resets patient safety state to `SAFE`.
* **Auth**: Bearer token required
* **Allowed Roles**: `CAREGIVER`, `GUARDIAN`
* **Params**: `:patientId` (UUID)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "success": true
  }
}
```

---

## 9. Notifications & Reminders

### `GET /alerts/settings`
Retrieves notification and alert volume settings.
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "settings": {
      "user_id": "user-uuid",
      "role": "PATIENT",
      "reminder_sounds": true,
      "reminder_vibration": true,
      "reminder_volume": 1.0,
      "reminder_frequency": 5
    }
  }
}
```

---

### `PUT /alerts/settings`
Updates notification settings.
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Request Body** (example for Patient):
```json
{
  "reminder_sounds": true,
  "reminder_vibration": true,
  "reminder_volume": 0.8,
  "reminder_frequency": 10
}
```
* **Success Response** (`200 OK`): Returns updated settings object.

---

### `GET /alerts/reminders/active`
Retrieves active scheduled reminders for patient routines.
* **Auth**: Bearer token required
* **Allowed Roles**: All (`patientId` query param required if non-patient)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "reminders": [
      {
        "id": "reminder-uuid",
        "patient_id": "patient-uuid",
        "reference_id": "task-uuid",
        "reference_type": "ROUTINE",
        "title": "Morning Medication",
        "body": "Take 1 tablet of Donepezil (10mg)",
        "scheduled_at": "2026-10-28T08:30:00.000Z",
        "state": "ACTIVE",
        "snooze_count": 0
      }
    ]
  }
}
```

---

### `POST /alerts/reminders/:id/action`
Executes action on an active reminder (snooze, complete, or skip). Automatically synchronizes the referenced daily routine task status.
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Params**: `:id` (UUID of reminder)
* **Request Body**:
```json
{
  "action": "SNOOZE",
  "snooze_minutes": 10
}
```
*Valid Actions*: `"COMPLETE"`, `"SNOOZE"`, `"SKIP"`.
* **Success Response** (`200 OK`): Returns updated reminder object.

---

### `GET /alerts/history`
Returns paginated in-app notification logs for the authenticated user.
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif-uuid",
        "notification_type": "ALERT_TRIGGERED",
        "priority": "HIGH",
        "title": "Boundary Alert",
        "body": "Ramesh Kumar has left the Home Safe Zone.",
        "is_read": false,
        "created_at": "2026-10-28T10:48:00.000Z"
      }
    ]
  }
}
```

---

### `POST /alerts/:id/read`
Marks a single notification as read.
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Params**: `:id` (UUID of notification log)
* **Success Response** (`200 OK`): Returns updated notification log.

---

### `POST /alerts/read-all`
Marks all unread notifications for the caller as read.
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Success Response** (`200 OK`): `{ "success": true, "data": { "success": true } }`

---

## 10. Care Circle Messaging

### `GET /threads/patient/:patientId`
Fetches chat messages for the patient's care circle thread.
* **Auth**: Bearer token required
* **Allowed Roles**: Linked Caregiver, Family, Patient
* **Params**: `:patientId` (UUID)
* **Query Parameters**: `limit` (default: `20`), `cursor` (ISO timestamp)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg-uuid",
        "thread_id": "thread-uuid",
        "sender_id": "user-uuid",
        "sender_name": "Anita Kumar",
        "sender_photo": null,
        "message_type": "TEXT",
        "content": "I gave dad his morning medication today.",
        "media_url": null,
        "created_at": "2026-10-28T09:00:00.000Z"
      }
    ],
    "has_more": false,
    "next_cursor": null
  }
}
```

---

### `POST /threads/patient/:patientId/messages`
Posts a message to the patient's care circle thread.
* **Auth**: Bearer token required
* **Allowed Roles**: Linked Caregiver, Close Family, Guardian
* **Params**: `:patientId` (UUID)
* **Request Body**:
```json
{
  "content": "Dad walked in the park for 20 minutes this morning.",
  "message_type": "TEXT",
  "media_url": null
}
```
*Valid `message_type` Values*: `"TEXT"`, `"VOICE"`, `"IMAGE"`.
* **Success Response** (`201 Created`):
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "msg-uuid",
      "thread_id": "thread-uuid",
      "sender_id": "user-uuid",
      "message_type": "TEXT",
      "content": "Dad walked in the park for 20 minutes this morning.",
      "created_at": "2026-10-28T10:55:00.000Z"
    }
  }
}
```

---

## 11. Media Upload

### `POST /media/upload/photo`
Uploads an image file (profile picture, attachment) to local server storage (`uploads/`).
* **Auth**: Bearer token required
* **Allowed Roles**: All
* **Content-Type**: `multipart/form-data`
* **Form Field**: `photo` (file, max 10MB, mime type `image/*`)
* **Success Response** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "photoUrl": "http://localhost:3000/uploads/photo-1730121600000-123456789.jpg",
    "url": "http://localhost:3000/uploads/photo-1730121600000-123456789.jpg",
    "filename": "photo-1730121600000-123456789.jpg"
  }
}
```

---

## 12. cURL Testing Guide

Use the following cURL commands to test your backend endpoints directly in a terminal:

### 1. Test Session / Provisioning
```bash
curl -X GET "http://localhost:3000/api/v1/users/me" \
  -H "Authorization: Bearer mock-dev-patient-token" \
  -H "Content-Type: application/json"
```

### 2. Discover Caregivers in Bangalore
```bash
curl -X GET "http://localhost:3000/api/v1/care/discovery/caregivers?city=Bangalore" \
  -H "Authorization: Bearer mock-dev-family-token" \
  -H "Content-Type: application/json"
```

### 3. Fetch Today's Tasks
```bash
curl -X GET "http://localhost:3000/api/v1/tasks/patient/<PATIENT_UUID>/today" \
  -H "Authorization: Bearer mock-dev-patient-token" \
  -H "Content-Type: application/json"
```

### 4. Mark Task Status
```bash
curl -X POST "http://localhost:3000/api/v1/tasks/<TASK_UUID>/status" \
  -H "Authorization: Bearer mock-dev-patient-token" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "DONE",
    "client_action_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

### 5. Send GPS Ping
```bash
curl -X POST "http://localhost:3000/api/v1/location/ping" \
  -H "Authorization: Bearer mock-dev-patient-token" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 12.971598,
    "lng": 77.594562,
    "battery_pct": 85,
    "network_status": "WIFI",
    "recorded_at": "2026-10-28T11:00:00.000Z"
  }'
```

### 6. Trigger Patient SOS
```bash
curl -X POST "http://localhost:3000/api/v1/alerts/sos/patient/<PATIENT_UUID>" \
  -H "Authorization: Bearer mock-dev-patient-token" \
  -H "Content-Type: application/json"
```

