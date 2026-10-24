"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import {
  loginAction,
  registerAction,
  requestLoanAction,
  transitionLoanAction,
  uploadCoverAction,
  type ActionState,
} from "@/app/actions";

function SubmitButton({
  children,
  pendingText = "Procesando…",
  className = "button",
  name,
  value,
  confirm,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      disabled={pending}
      name={name}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      type="submit"
      value={value}
    >
      {pending ? pendingText : children}
    </button>
  );
}

function FormFeedback({ state }: { state: ActionState }) {
  return (
    <>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.success ? (
        <p className="form-success" role="status">
          {state.success} {state.resourceUrl ? <a className="text-link" href={state.resourceUrl}>Ver portada</a> : null}
        </p>
      ) : null}
    </>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form className="form-stack" action={action}>
      <FormFeedback state={state} />
      <label className="field">
        <span>Correo electrónico</span>
        <input autoComplete="email" name="email" type="email" required />
        {state.fieldErrors?.email ? <small className="field-error">{state.fieldErrors.email}</small> : null}
      </label>
      <label className="field">
        <span>Contraseña</span>
        <input autoComplete="current-password" name="password" type="password" required />
        {state.fieldErrors?.password ? <small className="field-error">{state.fieldErrors.password}</small> : null}
      </label>
      <SubmitButton pendingText="Iniciando sesión…">Iniciar sesión</SubmitButton>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, {});
  return (
    <form className="form-stack" action={action}>
      <FormFeedback state={state} />
      <label className="field">
        <span>Nombre completo</span>
        <input autoComplete="name" name="displayName" required maxLength={80} />
        {state.fieldErrors?.displayName ? <small className="field-error">{state.fieldErrors.displayName}</small> : null}
      </label>
      <label className="field">
        <span>Correo electrónico</span>
        <input autoComplete="email" name="email" type="email" required />
        {state.fieldErrors?.email ? <small className="field-error">{state.fieldErrors.email}</small> : null}
      </label>
      <label className="field">
        <span>Contraseña <small>(mínimo 6 caracteres)</small></span>
        <input autoComplete="new-password" name="password" type="password" minLength={6} required />
        {state.fieldErrors?.password ? <small className="field-error">{state.fieldErrors.password}</small> : null}
      </label>
      <SubmitButton pendingText="Creando cuenta…">Crear cuenta</SubmitButton>
      <p className="form-footnote">Todas las cuentas nuevas tienen permisos de estudiante.</p>
    </form>
  );
}

export function RequestLoanForm({
  bookId,
  clientRequestId,
}: {
  bookId: string;
  clientRequestId: string;
}) {
  const [state, action] = useActionState(requestLoanAction, {});
  return (
    <form className="loan-request-form" action={action}>
      <input type="hidden" name="bookId" value={bookId} />
      <input type="hidden" name="clientRequestId" value={clientRequestId} />
      <FormFeedback state={state} />
      <SubmitButton pendingText="Enviando solicitud…">Solicitar préstamo</SubmitButton>
    </form>
  );
}

export function LoanTransitionForm({ loanId, actions }: { loanId: string; actions: string[] }) {
  const [state, action] = useActionState(transitionLoanAction, {});
  return (
    <form className="loan-actions" action={action}>
      <input type="hidden" name="loanId" value={loanId} />
      {state.error ? <span className="form-error" role="alert">{state.error}</span> : null}
      {state.success ? <span className="form-success" role="status">{state.success}</span> : null}
      {actions.map((value) => (
        <SubmitButton
          key={value}
          className={value === "reject" ? "button button-danger button-small" : "button button-secondary button-small"}
          confirm={value === "approve" ? "¿Quieres aprobar esta solicitud?" : value === "reject" ? "¿Quieres rechazar esta solicitud?" : "¿Confirmas que el libro fue devuelto?"}
          pendingText="Guardando…"
          name="action"
          value={value}
        >
          {value === "approve" ? "Aprobar" : value === "reject" ? "Rechazar" : "Registrar devolución"}
        </SubmitButton>
      ))}
    </form>
  );
}

export function CoverUploadForm({ bookId }: { bookId: string }) {
  const [state, action] = useActionState(uploadCoverAction, {});
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPreview(null);
      setFileName("");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    if (file.size > 525_000) {
      setPreview(null);
      setFileName("El archivo supera el máximo de 525 KB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPreview(null);
      setFileName("Selecciona una imagen JPEG, PNG o WebP.");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
  }

  return (
    <form className="form-stack cover-form" action={action}>
      <input type="hidden" name="bookId" value={bookId} />
      <FormFeedback state={state} />
      <label className="field">
        <span>Subir portada</span>
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-describedby="cover-help"
          name="cover"
          onChange={selectFile}
          type="file"
        />
        <small id="cover-help">JPEG, PNG o WebP. Máximo 525 KB.</small>
      </label>
      {fileName ? <p className="file-name" role="status">{fileName}</p> : null}
      {preview ? <Image className="cover-preview" src={preview} alt="Vista previa de la portada seleccionada" width={116} height={156} unoptimized /> : null}
      <SubmitButton pendingText="Validando y guardando…">Guardar portada</SubmitButton>
    </form>
  );
}
