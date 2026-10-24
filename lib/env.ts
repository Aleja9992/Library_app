import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/errors";

const firebaseEnvSchema = z.object({
  FIREBASE_PROJECT_ID: z
    .string()
    .trim()
    .min(1, "FIREBASE_PROJECT_ID es obligatoria."),
  FIREBASE_CLIENT_EMAIL: z
    .string()
    .trim()
    .min(1, "FIREBASE_CLIENT_EMAIL es obligatoria."),
  FIREBASE_PRIVATE_KEY: z
    .string()
    .trim()
    .min(1, "FIREBASE_PRIVATE_KEY es obligatoria.")
    .transform((value) => value.replace(/\\n/g, "\n")),
  FIREBASE_WEB_API_KEY: z
    .string()
    .trim()
    .min(1, "FIREBASE_WEB_API_KEY es obligatoria."),
});

export type FirebaseEnv = z.infer<typeof firebaseEnvSchema>;

export function getFirebaseEnv(): FirebaseEnv {
  const result = firebaseEnvSchema.safeParse({
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => issue.message)
      .join(" ");

    throw new ApiError(500, "CONFIG_ERROR", `CONFIG_ERROR: ${details}`);
  }

  return result.data;
}
