const fs = require('fs');
const path = require('path');

function makeRequest({
  name,
  method,
  urlPath,
  tokenVar = null,
  body = null,
  tests = [],
  description = ''
}) {
  const headers = [];
  if (tokenVar) {
    headers.push({
      key: 'Authorization',
      value: `Bearer {{${tokenVar}}}`,
      type: 'text'
    });
  }
  if (body) {
    headers.push({
      key: 'Content-Type',
      value: 'application/json',
      type: 'text'
    });
  }

  const pathParts = urlPath.replace(/^\//, '').split('/').map(p => {
    // If it has :param or {{param}}, keep it clean
    return p;
  });

  const reqObj = {
    name,
    request: {
      method,
      header: headers,
      url: {
        raw: `{{baseUrl}}${urlPath}`,
        host: ['{{baseUrl}}'],
        path: pathParts
      },
      description
    }
  };

  if (body) {
    reqObj.request.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2),
      options: {
        raw: {
          language: 'json'
        }
      }
    };
  }

  if (tests && tests.length > 0) {
    reqObj.event = [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: tests
        }
      }
    ];
  }

  return reqObj;
}

const collection = {
  info: {
    _postman_id: 'surestep-backend-workflows-v1',
    name: 'SureStep API - Multi-Role Workflows',
    description: 'Comprehensive Postman collection for manual testing of SureStep dementia care platform. Demonstrates user roles (PATIENT, CAREGIVER, FAMILY) and full end-to-end workflows with automated variable chaining.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
    { key: 'patientToken', value: 'mock-dev-patient-token', type: 'string' },
    { key: 'caregiverToken', value: 'mock-dev-caregiver-token', type: 'string' },
    { key: 'familyToken', value: 'mock-dev-family-token', type: 'string' },
    { key: 'patientId', value: '', type: 'string' },
    { key: 'caregiverId', value: '', type: 'string' },
    { key: 'familyId', value: '', type: 'string' },
    { key: 'careRequestId', value: '', type: 'string' },
    { key: 'relationshipId', value: '', type: 'string' },
    { key: 'inviteCode', value: '', type: 'string' },
    { key: 'routineId', value: '', type: 'string' },
    { key: 'taskId', value: '', type: 'string' },
    { key: 'alertId', value: '', type: 'string' }
  ],
  item: [
    // 00. Health & Diagnostics
    {
      name: '00. Health & Diagnostics',
      item: [
        makeRequest({
          name: 'Server Health Check',
          method: 'GET',
          urlPath: '/health',
          description: 'Basic health check returning server status, version, and timestamp.'
        }),
        makeRequest({
          name: 'Database Health Check',
          method: 'GET',
          urlPath: '/health/db',
          description: 'Diagnostic check of database connectivity, DNS, and TCP port 5432.'
        }),
        makeRequest({
          name: 'Run Migrations Check',
          method: 'GET',
          urlPath: '/health/migrations',
          description: 'Applies pending database migrations and returns status.'
        })
      ]
    },

    // 01. User Setup & Profile Initializations
    {
      name: '01. User Setup & Profile Initializations',
      item: [
        makeRequest({
          name: 'Init Patient Profile (Auto-Provision & Fetch)',
          method: 'GET',
          urlPath: '/api/v1/users/me',
          tokenVar: 'patientToken',
          description: 'Uses mock-dev-patient-token to auto-provision patient user. Captures patientId.',
          tests: [
            'pm.test("Status code is 200", function () { pm.response.to.have.status(200); });',
            'const res = pm.response.json();',
            'if (res.data && res.data.user) {',
            '  pm.collectionVariables.set("patientId", res.data.user.id);',
            '  console.log("Saved patientId:", res.data.user.id);',
            '}'
          ]
        }),
        makeRequest({
          name: 'Update Patient Profile Details',
          method: 'PUT',
          urlPath: '/api/v1/users/patient',
          tokenVar: 'patientToken',
          body: {
            emergency_contact_name: 'Martha Wayne',
            emergency_contact_phone: '+919999999900',
            dementia_stage: 'EARLY',
            home_address: '123 Indiranagar, Bangalore'
          },
          description: 'Sets emergency contact and dementia stage for the patient.'
        }),
        makeRequest({
          name: 'Init Caregiver Profile (Auto-Provision & Fetch)',
          method: 'GET',
          urlPath: '/api/v1/users/me',
          tokenVar: 'caregiverToken',
          description: 'Uses mock-dev-caregiver-token to auto-provision caregiver user. Captures caregiverId.',
          tests: [
            'pm.test("Status code is 200", function () { pm.response.to.have.status(200); });',
            'const res = pm.response.json();',
            'if (res.data && res.data.user) {',
            '  pm.collectionVariables.set("caregiverId", res.data.user.id);',
            '  console.log("Saved caregiverId:", res.data.user.id);',
            '}'
          ]
        }),
        makeRequest({
          name: 'Update Caregiver Profile (Make Discoverable)',
          method: 'PUT',
          urlPath: '/api/v1/users/caregiver',
          tokenVar: 'caregiverToken',
          body: {
            years_of_experience: 5,
            hourly_rate_inr: 350,
            specializations: ['Dementia Care', 'Alzheimers', 'Mobility Assistance'],
            bio: 'Certified dementia care specialist with 5 years of home care experience in Bangalore.',
            is_discoverable: true
          },
          description: 'Updates caregiver rates, experience, and enables is_discoverable for search.'
        }),
        makeRequest({
          name: 'Init Family Profile (Auto-Provision & Fetch)',
          method: 'GET',
          urlPath: '/api/v1/users/me',
          tokenVar: 'familyToken',
          description: 'Uses mock-dev-family-token to auto-provision family user. Captures familyId.',
          tests: [
            'pm.test("Status code is 200", function () { pm.response.to.have.status(200); });',
            'const res = pm.response.json();',
            'if (res.data && res.data.user) {',
            '  pm.collectionVariables.set("familyId", res.data.user.id);',
            '  console.log("Saved familyId:", res.data.user.id);',
            '}'
          ]
        }),
        makeRequest({
          name: 'Update Family Profile Preferences',
          method: 'PATCH',
          urlPath: '/api/v1/family/profile',
          tokenVar: 'familyToken',
          body: {
            relation_label: 'Son',
            proximity: 'SAME_CITY',
            notify_on_breach: true,
            notify_on_missed_critical: true,
            notify_on_sos: true,
            notify_on_daily_digest: true,
            digest_frequency: 'DAILY'
          },
          description: 'Configures notification preferences and relationship label for family member.'
        })
      ]
    },

    // 02. Workflow 1: Discovery & Care Requests
    {
      name: '02. Workflow 1: Discovery & Care Requests',
      item: [
        makeRequest({
          name: '1. Discover Caregivers (Patient / Family Search)',
          method: 'GET',
          urlPath: '/api/v1/care/discovery/caregivers?targetPatientId={{patientId}}&city=Bangalore',
          tokenVar: 'familyToken',
          description: 'Family searches for eligible, discoverable caregivers in Bangalore.',
          tests: [
            'pm.test("Status code is 200", function () { pm.response.to.have.status(200); });',
            'const res = pm.response.json();',
            'if (res.data && res.data.caregivers && res.data.caregivers.length > 0) {',
            '  pm.collectionVariables.set("caregiverId", res.data.caregivers[0].id);',
            '  console.log("Selected caregiverId:", res.data.caregivers[0].id);',
            '}'
          ]
        }),
        makeRequest({
          name: '2. View Caregiver Public Profile',
          method: 'GET',
          urlPath: '/api/v1/care/discovery/caregivers/{{caregiverId}}?targetPatientId={{patientId}}',
          tokenVar: 'familyToken',
          description: 'Family views detailed profile without leaking private contact info.'
        }),
        makeRequest({
          name: '3. Create Care Request (Family -> Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/care-requests',
          tokenVar: 'familyToken',
          body: {
            caregiver_id: '{{caregiverId}}',
            patient_id: '{{patientId}}',
            shift_type: 'FULL_TIME',
            note: 'Looking for compassionate daily assistance for morning routines.'
          },
          description: 'Family initiates care request for the patient.',
          tests: [
            'pm.test("Status code is 201 or 200", function () { pm.expect([200, 201]).to.include(pm.response.code); });',
            'const res = pm.response.json();',
            'if (res.data && res.data.request) {',
            '  pm.collectionVariables.set("careRequestId", res.data.request.id);',
            '  console.log("Created careRequestId:", res.data.request.id);',
            '}'
          ]
        }),
        makeRequest({
          name: '4. View Incoming Care Requests (Caregiver)',
          method: 'GET',
          urlPath: '/api/v1/care-requests/incoming',
          tokenVar: 'caregiverToken',
          description: 'Caregiver views pending requests from families/patients.'
        }),
        makeRequest({
          name: '5. Accept Care Request (Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/care-requests/{{careRequestId}}/accept',
          tokenVar: 'caregiverToken',
          description: 'Caregiver accepts request, establishing the patient_relationship.',
          tests: [
            'pm.test("Status code is 200", function () { pm.response.to.have.status(200); });',
            'const res = pm.response.json();',
            'if (res.data && res.data.relationship) {',
            '  pm.collectionVariables.set("relationshipId", res.data.relationship.id);',
            '  console.log("Care Relationship established:", res.data.relationship.id);',
            '}'
          ]
        }),
        makeRequest({
          name: '6. Complete Initial Meeting (Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/relationships/patient/{{patientId}}/meet',
          tokenVar: 'caregiverToken',
          body: {
            meeting_notes: 'Initial in-person meeting completed with family. Patient is responsive.'
          },
          description: 'Caregiver records completion of initial meet and assessment readiness.'
        })
      ]
    },

    // 03. Workflow 2: Care Circle & Family Linking
    {
      name: '03. Workflow 2: Care Circle & Family Linking',
      item: [
        makeRequest({
          name: '1. Generate Family Invite Code (Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/relationships/invite-code/generate',
          tokenVar: 'caregiverToken',
          body: {
            patient_id: '{{patientId}}',
            relationship_type: 'FAMILY_CLOSE'
          },
          description: 'Caregiver creates a secure 6-character code for family members.',
          tests: [
            'pm.test("Status code is 201 or 200", function () { pm.expect([200, 201]).to.include(pm.response.code); });',
            'const res = pm.response.json();',
            'if (res.data && res.data.invite) {',
            '  pm.collectionVariables.set("inviteCode", res.data.invite.code);',
            '  console.log("Generated inviteCode:", res.data.invite.code);',
            '}'
          ]
        }),
        makeRequest({
          name: '2. Validate Invite Code (Family)',
          method: 'POST',
          urlPath: '/api/v1/family/invite-code/validate',
          tokenVar: 'familyToken',
          body: {
            code: '{{inviteCode}}'
          },
          description: 'Family validates code before redeeming.'
        }),
        makeRequest({
          name: '3. Redeem Invite Code (Family)',
          method: 'POST',
          urlPath: '/api/v1/family/invite-code/redeem',
          tokenVar: 'familyToken',
          body: {
            code: '{{inviteCode}}'
          },
          description: 'Family redeems code, joining the care circle instantly.'
        }),
        makeRequest({
          name: '4. View Care Circle Members (Family)',
          method: 'GET',
          urlPath: '/api/v1/family/care-circle',
          tokenVar: 'familyToken',
          description: 'Family inspects all members connected to this patient.'
        }),
        makeRequest({
          name: '5. View Care Circle Members (Caregiver)',
          method: 'GET',
          urlPath: '/api/v1/relationships/patient/{{patientId}}/care-circle',
          tokenVar: 'caregiverToken',
          description: 'Caregiver inspects care circle members.'
        })
      ]
    },

    // 04. Workflow 3: Routines & Task Management
    {
      name: '04. Workflow 3: Routines & Task Management',
      item: [
        makeRequest({
          name: '1. Create Morning Routine Template (Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/routines/patient/{{patientId}}',
          tokenVar: 'caregiverToken',
          body: {
            title: 'Morning Medication & Hydration',
            description: 'Ensure Donepezil 5mg is taken with a tall glass of water.',
            time_of_day: '08:30:00',
            category: 'MEDICATION',
            repetition: 'DAILY',
            days_of_week: [0, 1, 2, 3, 4, 5, 6],
            is_critical: true
          },
          description: 'Caregiver defines recurring routine template.',
          tests: [
            'pm.test("Status code is 201 or 200", function () { pm.expect([200, 201]).to.include(pm.response.code); });',
            'const res = pm.response.json();',
            'if (res.data && res.data.template) {',
            '  pm.collectionVariables.set("routineId", res.data.template.id);',
            '  console.log("Created routineId:", res.data.template.id);',
            '}'
          ]
        }),
        makeRequest({
          name: '2. List Routine Templates (Caregiver)',
          method: 'GET',
          urlPath: '/api/v1/routines/patient/{{patientId}}',
          tokenVar: 'caregiverToken',
          description: 'Lists all active routine templates for patient.'
        }),
        makeRequest({
          name: '3. Create Ad-hoc Task Instance (Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/tasks/patient/{{patientId}}',
          tokenVar: 'caregiverToken',
          body: {
            title: 'Afternoon Garden Walk',
            description: '15-minute gentle outdoor walk for sensory engagement.',
            scheduled_time: '16:00:00',
            scheduled_date: new Date().toISOString().split('T')[0],
            category: 'EXERCISE',
            is_critical: false
          },
          description: 'Caregiver manually adds a task instance for today.',
          tests: [
            'pm.test("Status code is 201 or 200", function () { pm.expect([200, 201]).to.include(pm.response.code); });',
            'const res = pm.response.json();',
            'if (res.data && res.data.task) {',
            '  pm.collectionVariables.set("taskId", res.data.task.id);',
            '  console.log("Created taskId:", res.data.task.id);',
            '}'
          ]
        }),
        makeRequest({
          name: '4. View Today\'s Tasks (Patient)',
          method: 'GET',
          urlPath: '/api/v1/tasks/patient/{{patientId}}/today',
          tokenVar: 'patientToken',
          description: 'Patient fetches their schedule for today.'
        }),
        makeRequest({
          name: '5. Complete Task (Patient)',
          method: 'POST',
          urlPath: '/api/v1/tasks/{{taskId}}/status',
          tokenVar: 'patientToken',
          body: {
            status: 'COMPLETED',
            notes: 'Patient walked happily in the backyard.'
          },
          description: 'Updates task status to COMPLETED.'
        }),
        makeRequest({
          name: '6. Check Adherence Snapshot (Caregiver)',
          method: 'GET',
          urlPath: '/api/v1/tasks/patient/{{patientId}}/adherence',
          tokenVar: 'caregiverToken',
          description: 'Caregiver monitors completion metrics and adherence %.'
        })
      ]
    },

    // 05. Workflow 4: Location & Geofencing
    {
      name: '05. Workflow 4: Location & Geofencing',
      item: [
        makeRequest({
          name: '1. Send Location Ping (Patient Device)',
          method: 'POST',
          urlPath: '/api/v1/location/ping',
          tokenVar: 'patientToken',
          body: {
            lat: 12.9716,
            lng: 77.5946,
            accuracy: 4.5,
            speed: 0.8
          },
          description: 'Patient phone periodically posts GPS coordinate.'
        }),
        makeRequest({
          name: '2. Get Current Location (Caregiver)',
          method: 'GET',
          urlPath: '/api/v1/location/patient/{{patientId}}/current',
          tokenVar: 'caregiverToken',
          description: 'Caregiver views patient\'s latest position and geofence state.'
        }),
        makeRequest({
          name: '3. Create Safe Geofence Zone (Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/location/geofences/patient/{{patientId}}',
          tokenVar: 'caregiverToken',
          body: {
            name: 'Home Sanctuary',
            center_lat: 12.9716,
            center_lng: 77.5946,
            radius_meters: 150,
            zone_type: 'SAFE'
          },
          description: 'Sets boundary circle around patient home.'
        }),
        makeRequest({
          name: '4. View Location Trail (Family)',
          method: 'GET',
          urlPath: '/api/v1/location/patient/{{patientId}}/trail',
          tokenVar: 'familyToken',
          description: 'Family inspects recent movement breadcrumbs.'
        })
      ]
    },

    // 06. Workflow 5: SOS & Safety Alerts
    {
      name: '06. Workflow 5: SOS & Safety Alerts',
      item: [
        makeRequest({
          name: '1. Trigger Emergency SOS (Patient)',
          method: 'POST',
          urlPath: '/api/v1/alerts/sos/patient/{{patientId}}',
          tokenVar: 'patientToken',
          description: 'Patient presses red SOS button, broadcasting CRITICAL alert.',
          tests: [
            'pm.test("Status code is 200", function () { pm.response.to.have.status(200); });',
            'const res = pm.response.json();',
            'if (res.data && res.data.alert) {',
            '  pm.collectionVariables.set("alertId", res.data.alert.id);',
            '  console.log("Triggered alertId:", res.data.alert.id);',
            '}'
          ]
        }),
        makeRequest({
          name: '2. Caregiver Multi-Patient Alert Feed',
          method: 'GET',
          urlPath: '/api/v1/alerts/caregiver/feed',
          tokenVar: 'caregiverToken',
          description: 'Caregiver retrieves consolidated triage feed.'
        }),
        makeRequest({
          name: '3. Acknowledge Alert (Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/alerts/{{alertId}}/acknowledge',
          tokenVar: 'caregiverToken',
          description: 'Caregiver acknowledges alert, letting family know someone is on it.'
        }),
        makeRequest({
          name: '4. Respond to Alert (Caregiver with ETA)',
          method: 'POST',
          urlPath: '/api/v1/alerts/{{alertId}}/respond',
          tokenVar: 'caregiverToken',
          body: {
            eta_minutes: 5,
            responder_notes: 'Approaching residence now.'
          },
          description: 'Caregiver claims active responder status.'
        }),
        makeRequest({
          name: '5. Resolve Alert (Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/alerts/{{alertId}}/resolve',
          tokenVar: 'caregiverToken',
          body: {
            resolution_notes: 'Patient was disoriented in kitchen; safely calmed down and seated.'
          },
          description: 'Marks incident resolved.'
        })
      ]
    },

    // 07. Workflow 6: Clinical Assessments & Reports
    {
      name: '07. Workflow 6: Clinical Assessments & Reports',
      item: [
        makeRequest({
          name: '1. Submit Clinical Care Assessment (Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/assessments/patient/{{patientId}}',
          tokenVar: 'caregiverToken',
          body: {
            adl_score: 18,
            iadl_score: 11,
            cognitive_score: 23,
            notes: 'Patient exhibits mild short-term memory lapses, but physical mobility is strong.',
            status: 'COMPLETED'
          },
          description: 'Caregiver records comprehensive baseline clinical assessment.'
        }),
        makeRequest({
          name: '2. Fetch Latest Assessment (Family)',
          method: 'GET',
          urlPath: '/api/v1/assessments/patient/{{patientId}}',
          tokenVar: 'familyToken',
          description: 'Family reviews assessment scores and clinical notes.'
        }),
        makeRequest({
          name: '3. View Family Daily Digest (Family)',
          method: 'GET',
          urlPath: '/api/v1/reports/family-digest/patient/{{patientId}}',
          tokenVar: 'familyToken',
          description: 'Family reads unified daily snapshot: tasks, alerts, awareness state.'
        }),
        makeRequest({
          name: '4. View Weekly Caregiver Summary (Caregiver)',
          method: 'GET',
          urlPath: '/api/v1/reports/caregiver-summary/patient/{{patientId}}',
          tokenVar: 'caregiverToken',
          description: 'Weekly task adherence and incident distribution report.'
        })
      ]
    },

    // 08. Workflow 7: Family Care Notes & Memories
    {
      name: '08. Workflow 7: Family Care Notes & Memories',
      item: [
        makeRequest({
          name: '1. Post Care Note (Family)',
          method: 'POST',
          urlPath: '/api/v1/family/care-notes',
          tokenVar: 'familyToken',
          body: {
            content: 'Dad loved hearing songs by Kishore Kumar this afternoon. Kept him smiling.',
            is_pinned: true
          },
          description: 'Family shares contextual tip with caregiver circle.'
        }),
        makeRequest({
          name: '2. Read Care Notes (Caregiver)',
          method: 'GET',
          urlPath: '/api/v1/family/care-notes/patient/{{patientId}}',
          tokenVar: 'caregiverToken',
          description: 'Caregiver reads notes pinned by family members.'
        }),
        makeRequest({
          name: '3. Record Cognitive Game Session (Patient)',
          method: 'POST',
          urlPath: '/api/v1/cognition/sessions',
          tokenVar: 'patientToken',
          body: {
            game_type: 'MEMORY_MATCH',
            score: 85,
            duration_seconds: 120,
            metrics: { errors: 2, reaction_time_ms: 1400 }
          },
          description: 'Patient logs brain training session result.'
        })
      ]
    },

    // 09. Workflow 8: Resignation & Relationship Termination
    {
      name: '09. Workflow 8: Resignation & Relationship Termination',
      item: [
        makeRequest({
          name: '1. Caregiver Submits Resignation (Caregiver)',
          method: 'POST',
          urlPath: '/api/v1/care-relationships/{{relationshipId}}/resignation',
          tokenVar: 'caregiverToken',
          body: {
            reason: 'Relocating to another city at the end of next month.',
            effective_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
          },
          description: 'Caregiver formally files resignation notice.'
        }),
        makeRequest({
          name: '2. View Resignation Status (Family)',
          method: 'GET',
          urlPath: '/api/v1/care-relationships/{{relationshipId}}/resignation',
          tokenVar: 'familyToken',
          description: 'Family checks pending resignation details.'
        }),
        makeRequest({
          name: '3. Accept Resignation (Family)',
          method: 'POST',
          urlPath: '/api/v1/care-relationships/{{relationshipId}}/resignation/accept',
          tokenVar: 'familyToken',
          description: 'Family acknowledges and accepts resignation notice.'
        }),
        makeRequest({
          name: '4. View Relationship History (Caregiver)',
          method: 'GET',
          urlPath: '/api/v1/care-relationships/history',
          tokenVar: 'caregiverToken',
          description: 'Caregiver reviews historical care engagements.'
        })
      ]
    }
  ]
};

const postmanDir = path.join(__dirname, '..', 'postman');
if (!fs.existsSync(postmanDir)) {
  fs.mkdirSync(postmanDir, { recursive: true });
}

const collectionPath = path.join(postmanDir, 'SureStep_API_Workflows.postman_collection.json');
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
console.log('Successfully generated Postman Collection at:', collectionPath);

// Generate Postman Environment File
const environment = {
  id: 'surestep-local-environment',
  name: 'SureStep Local Development',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3000', enabled: true },
    { key: 'patientToken', value: 'mock-dev-patient-token', enabled: true },
    { key: 'caregiverToken', value: 'mock-dev-caregiver-token', enabled: true },
    { key: 'familyToken', value: 'mock-dev-family-token', enabled: true },
    { key: 'patientId', value: '', enabled: true },
    { key: 'caregiverId', value: '', enabled: true },
    { key: 'familyId', value: '', enabled: true },
    { key: 'careRequestId', value: '', enabled: true },
    { key: 'relationshipId', value: '', enabled: true },
    { key: 'inviteCode', value: '', enabled: true },
    { key: 'routineId', value: '', enabled: true },
    { key: 'taskId', value: '', enabled: true },
    { key: 'alertId', value: '', enabled: true }
  ],
  _postman_variable_scope: 'environment'
};

const envPath = path.join(postmanDir, 'SureStep_Local.postman_environment.json');
fs.writeFileSync(envPath, JSON.stringify(environment, null, 2));
console.log('Successfully generated Postman Environment at:', envPath);
