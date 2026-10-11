# SureStep API — Postman Testing Guide

This directory contains a complete, automated Postman Collection and Environment for testing the **SureStep Dementia Care Backend**.

---

## 📁 Files Included

1. **[`SureStep_API_Workflows.postman_collection.json`](./SureStep_API_Workflows.postman_collection.json)**
   - Pre-configured requests for all roles (`PATIENT`, `CAREGIVER`, `FAMILY`).
   - Organized into logical multi-step workflow folders.
   - Built-in test scripts that automatically capture IDs (`patientId`, `caregiverId`, `careRequestId`, `relationshipId`, `inviteCode`, `routineId`, `taskId`, `alertId`) and inject them into subsequent requests.

2. **[`SureStep_Local.postman_environment.json`](./SureStep_Local.postman_environment.json)**
   - Variables pre-configured for local server execution (`http://localhost:3000`).
   - Mock dev authentication tokens pre-loaded.

---

## 🚀 Quick Setup Instructions

### 1. Start the SureStep Backend
Ensure the backend server is running:
```bash
npm run dev
# Server runs on http://localhost:3000
```

### 2. Import into Postman
1. Open **Postman**.
2. Click the **Import** button in the top left.
3. Drag & drop or select both:
   - `SureStep_API_Workflows.postman_collection.json`
   - `SureStep_Local.postman_environment.json`
4. In the top right corner of Postman, switch the active environment dropdown to **SureStep Local Development**.

---

## 🔑 Authentication During Manual Testing

The backend includes a built-in **Developer Auth Bypass** in `shared/middleware/authenticate.ts`:

| Role | Mock Dev Bearer Token | Auto-Provisioned User Details |
|---|---|---|
| **Patient** | `mock-dev-patient-token` | `Demo Patient` (`PATIENT`, `+919999999999`, Bangalore) |
| **Caregiver** | `mock-dev-caregiver-token` | `Demo Caregiver` (`CAREGIVER`, `+918888888888`, Bangalore) |
| **Family Member** | `mock-dev-family-token` | `Demo Family` (`FAMILY`, `+917777777777`, Bangalore) |

> **Production / Real Auth Note:** If testing against a live Firebase environment, replace these tokens in the Postman Environment variables with real Firebase ID tokens from client login.

---

## 📋 Role Capabilities Matrix

| Feature / Domain | `PATIENT` | `CAREGIVER` | `FAMILY` |
|---|:---:|:---:|:---:|
| **Own Profile & Preferences** | ✅ | ✅ | ✅ |
| **Emergency SOS Trigger** | ✅ (Self only) | ❌ | ❌ |
| **Location Ping (GPS updates)** | ✅ | ✅ | ✅ |
| **Live Location & Trail Viewing** | ❌ | ✅ | ✅ |
| **Geofence Zone Configuration** | ❌ | ✅ | ❌ |
| **Caregiver Discovery Search** | ✅ (Self-managed) | ❌ | ✅ |
| **Care Request Initiation** | ✅ | ❌ | ✅ |
| **Accept / Decline Care Requests** | ❌ | ✅ | ❌ |
| **Generate Family Invite Codes** | ❌ | ✅ | ❌ |
| **Redeem Invite Codes / Join Circle** | ❌ | ❌ | ✅ |
| **Routine Template Authoring** | ❌ | ✅ | ❌ (Read only) |
| **Today's Tasks & Adherence View** | ✅ | ✅ | ✅ |
| **Task Completion Status Updates** | ✅ | ✅ | ❌ |
| **Clinical Assessments & Care Plans** | ❌ (View only) | ✅ (Author & Save) | ❌ (View only) |
| **Care Notes (Daily observations)** | ❌ | ✅ (Read only) | ✅ (Create & Pin) |
| **Cognitive Games & Memory Sessions** | ✅ | ✅ (Review stats) | ✅ (Review digest) |
| **Emergency Alert Triage & Response** | ❌ | ✅ (Ack & Respond) | ✅ (View) |
| **Resignation Workflow Initiation** | ❌ | ✅ | ❌ |
| **Resignation Review (Accept/Decline)**| ✅ | ❌ | ✅ |
| **End Care Relationship** | ✅ | ✅ | ✅ |

---

## 🔄 End-to-End Workflows Covered

Follow the folders in numerical order in Postman:

1. **`00. Health & Diagnostics`**: Verify database, migrations, and server health.
2. **`01. User Setup & Profile Initializations`**: Auto-provisions and enriches profiles for the 3 demo users.
3. **`02. Workflow 1: Discovery & Care Requests`**: Family finds caregiver in Bangalore -> sends request -> Caregiver accepts -> initial meeting confirmed.
4. **`03. Workflow 2: Care Circle & Family Linking`**: Caregiver generates 6-character code -> Family validates & redeems -> Full care circle established.
5. **`04. Workflow 3: Routines & Task Management`**: Caregiver creates routine templates & daily tasks -> Patient views today's tasks and marks them completed -> Caregiver checks adherence snapshot.
6. **`05. Workflow 4: Location & Geofencing`**: Patient pings GPS -> Caregiver sets safe zone -> Family inspects location trail.
7. **`06. Workflow 5: SOS & Safety Alerts`**: Patient triggers red SOS -> Caregiver receives triage alert -> Caregiver acknowledges and responds with ETA.
8. **`07. Workflow 6: Clinical Assessments & Reports`**: Caregiver submits ADL/IADL assessment -> Family views generated care plan & daily digest.
9. **`08. Workflow 7: Family Care Notes & Memories`**: Family posts care note -> Caregiver reads it -> Patient plays memory game.
10. **`09. Workflow 8: Resignation & Termination`**: Caregiver files resignation -> Family accepts -> Relationship gracefully archived.
