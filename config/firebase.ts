/**
 * Firebase Admin SDK — singleton initializer.
 * Import `adminAuth` wherever you need to verify Firebase ID tokens.
 */
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Newlines in the PEM key are escaped in .env — unescape them here.
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
      }),
    });
  } else {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'surestep-dev',
    });
  }
}

export const adminAuth = admin.auth();
export default admin;
