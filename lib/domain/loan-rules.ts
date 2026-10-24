import type { Loan, LoanAction, LoanStatus } from "@/lib/types";

export const LOAN_DAYS = 14;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface LoanInventory {
  availableCopies: number;
  totalCopies: number;
}

export interface LoanTransition {
  loan: Loan;
  inventory: LoanInventory;
}

export class LoanRuleError extends Error {
  constructor(
    readonly code: "ALREADY_ACTIVE" | "NO_COPIES" | "INVALID_STATE",
    message: string,
  ) {
    super(message);
    this.name = "LoanRuleError";
  }

  get status(): 409 {
    return 409;
  }
}

export function isActive(status: LoanStatus): boolean {
  return status === "requested" || status === "approved";
}

export function assertCanRequest(
  bookId: string,
  inventory: LoanInventory,
  existingLoans: readonly Pick<Loan, "bookId" | "status">[],
): void {
  if (
    existingLoans.some(
      (loan) => loan.bookId === bookId && isActive(loan.status),
    )
  ) {
    throw new LoanRuleError(
      "ALREADY_ACTIVE",
      "Ya tienes un préstamo activo de este libro.",
    );
  }

  if (inventory.availableCopies <= 0) {
    throw new LoanRuleError("NO_COPIES", "No hay ejemplares disponibles.");
  }
}

export function assertTransitionAllowed(
  loan: Pick<Loan, "status">,
  action: LoanAction,
): void {
  if (
    (action === "approve" || action === "reject") &&
    loan.status !== "requested"
  ) {
    throw invalidTransition();
  }
  if (action === "return" && loan.status !== "approved") {
    throw invalidTransition();
  }
}

export function applyAction(
  loan: Loan,
  action: LoanAction,
  inventory: LoanInventory,
  now = new Date(),
): LoanTransition {
  const timestamp = now.toISOString();
  assertTransitionAllowed(loan, action);

  if (action === "approve") {
    if (inventory.availableCopies <= 0) {
      throw new LoanRuleError("NO_COPIES", "No hay ejemplares disponibles.");
    }

    return {
      loan: {
        ...loan,
        status: "approved",
        resolvedAt: timestamp,
        dueDate: new Date(now.getTime() + LOAN_DAYS * DAY_IN_MS).toISOString(),
        returnedAt: null,
        updatedAt: timestamp,
      },
      inventory: {
        ...inventory,
        availableCopies: inventory.availableCopies - 1,
      },
    };
  }

  if (action === "reject") {
    return {
      loan: {
        ...loan,
        status: "rejected",
        resolvedAt: timestamp,
        updatedAt: timestamp,
      },
      inventory,
    };
  }

  if (inventory.availableCopies >= inventory.totalCopies) {
    throw invalidTransition();
  }

  return {
    loan: {
      ...loan,
      status: "returned",
      returnedAt: timestamp,
      updatedAt: timestamp,
    },
    inventory: {
      ...inventory,
      availableCopies: inventory.availableCopies + 1,
    },
  };
}

function invalidTransition(): LoanRuleError {
  return new LoanRuleError(
    "INVALID_STATE",
    "La transición no está permitida para el estado actual.",
  );
}
