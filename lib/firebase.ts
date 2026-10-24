import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseEnv } from "@/lib/env";

const globalForFirebase = globalThis as typeof globalThis & {
  firebaseAdminApp?: App;
};

function getFirebaseApp(): App {
  if (globalForFirebase.firebaseAdminApp) {
    return globalForFirebase.firebaseAdminApp;
  }

  const existingApp = getApps().find((app) => app.name === "[DEFAULT]");

  if (existingApp) {
    globalForFirebase.firebaseAdminApp = existingApp;
    return existingApp;
  }

  const { FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_PROJECT_ID } =
    getFirebaseEnv();

  // La instancia global se conserva durante hot reload para evitar inicializaciones duplicadas.
  const app = initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY,
    }),
    projectId: FIREBASE_PROJECT_ID,
  });

  globalForFirebase.firebaseAdminApp = app;
  return app;
}

export function adminAuth() {
  return getAuth(getFirebaseApp());
}

export function db() {
  return getFirestore(getFirebaseApp());
}
