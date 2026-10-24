import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta ${name}. Configura el entorno local.`);
  }
  return value;
}

export const firebaseAdminApp =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: requiredEnvironment("FIREBASE_PROJECT_ID"),
      clientEmail: requiredEnvironment("FIREBASE_CLIENT_EMAIL"),
      privateKey: requiredEnvironment("FIREBASE_PRIVATE_KEY").replace(
        /\\n/g,
        "\n",
      ),
    }),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });

export const auth = getAuth(firebaseAdminApp);
export const firestore = getFirestore(firebaseAdminApp);
