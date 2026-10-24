import { z } from "zod";

const args = process.argv.slice(2).filter((argument) => argument !== "--");
const [emailArgument, roleArgument] = args;
const parsedEmail = z.email().safeParse(emailArgument?.trim().toLowerCase());
const role =
  roleArgument === "student" || roleArgument === "librarian"
    ? roleArgument
    : undefined;

if (args.length !== 2 || !parsedEmail.success || !role) {
  console.error("Uso: pnpm set-role -- <correo> <student|librarian>");
  process.exit(1);
}

const { auth, firestore } = await import("./admin.mts");

try {
  const user = await auth.getUserByEmail(parsedEmail.data);
  await auth.setCustomUserClaims(user.uid, {
    ...user.customClaims,
    role,
  });
  await auth.revokeRefreshTokens(user.uid);
  await firestore.collection("users").doc(user.uid).set(
    {
      email: user.email ?? parsedEmail.data,
      displayName: user.displayName ?? user.email ?? parsedEmail.data,
      role,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  console.log("Rol sincronizado y sesiones de actualización revocadas.");
} catch {
  console.error("No se pudo actualizar el rol en Firebase.");
  process.exit(1);
}
