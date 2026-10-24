import { afterEach, describe, expect, it, vi } from "vitest";
import { getFirebaseEnv } from "@/lib/env";

describe("getFirebaseEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("valida la configuración al solicitarla y normaliza los saltos de línea", () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "library-test");
    vi.stubEnv(
      "FIREBASE_CLIENT_EMAIL",
      "library-admin@example.invalid",
    );
    vi.stubEnv(
      "FIREBASE_PRIVATE_KEY",
      "-----BEGIN PRIVATE KEY-----\\nTEST_ONLY\\n-----END PRIVATE KEY-----",
    );
    vi.stubEnv("FIREBASE_WEB_API_KEY", "test-only-key");

    expect(getFirebaseEnv()).toEqual({
      FIREBASE_PROJECT_ID: "library-test",
      FIREBASE_CLIENT_EMAIL: "library-admin@example.invalid",
      FIREBASE_PRIVATE_KEY:
        "-----BEGIN PRIVATE KEY-----\nTEST_ONLY\n-----END PRIVATE KEY-----",
      FIREBASE_WEB_API_KEY: "test-only-key",
    });
  });

  it("informa con claridad qué variables requeridas faltan", () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    vi.stubEnv("FIREBASE_CLIENT_EMAIL", "");
    vi.stubEnv("FIREBASE_PRIVATE_KEY", "");
    vi.stubEnv("FIREBASE_WEB_API_KEY", "");

    expect(() => getFirebaseEnv()).toThrow(
      /CONFIG_ERROR:.*FIREBASE_PROJECT_ID.*FIREBASE_WEB_API_KEY/,
    );
  });
});
