import { z } from "zod";

const args = process.argv.slice(2).filter((argument) => argument !== "--");
const [emailArgument, displayNameArgument, roleArgument] = args;
const parsedEmail = z.email().safeParse(emailArgument?.trim().toLowerCase());
const displayName = displayNameArgument?.trim();
const role =
  roleArgument === "student" || roleArgument === "librarian"
    ? roleArgument
    : undefined;
const password = process.env.LIBRARY_ADMIN_PASSWORD;

if (
  args.length !== 3 ||
  !parsedEmail.success ||
  !displayName ||
  displayName.length < 2 ||
  displayName.length > 80 ||
  !role ||
  !password ||
  password.length < 6
) {
  console.error(
    "Uso: pnpm create-user -- <correo> \"<nombre>\" <student|librarian>; define LIBRARY_ADMIN_PASSWORD temporalmente (mínimo 6 caracteres).",
  );
  process.exit(1);
}

const { auth, firestore } = await import("./admin.mts");
const email = parsedEmail.data;
let created = false;
let user;

try {
  user = await auth.getUserByEmail(email);
  user = await auth.updateUser(user.uid, { email, password, displayName });
} catch (error) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;

  if (code !== "auth/user-not-found") {
    console.error("No se pudo buscar o actualizar la cuenta de Firebase Auth.");
    process.exit(1);
  }

  try {
    user = await auth.createUser({ email, password, displayName });
    created = true;
  } catch {
    console.error("No se pudo crear la cuenta de Firebase Auth.");
    process.exit(1);
  }
}

try {
  await auth.setCustomUserClaims(user.uid, {
    ...user.customClaims,
    role,
  });
  await auth.revokeRefreshTokens(user.uid);
  await firestore.collection("users").doc(user.uid).set(
    {
      email,
      displayName,
      role,
      ...(created ? { createdAt: new Date().toISOString() } : {}),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
} catch {
  console.error("La cuenta existe, pero no se pudo sincronizar su rol.");
  process.exit(1);
}

console.log(`Usuario ${created ? "creado" : "actualizado"} y rol sincronizado.`);
