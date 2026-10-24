import "server-only";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/errors";
import { BOOKS } from "@/lib/data/books";
import {
  applyAction,
  assertCanRequest,
  assertTransitionAllowed,
  LoanRuleError,
} from "@/lib/domain/loan-rules";
import { db } from "@/lib/firebase";
import type {
  AuthUser,
  Loan,
  LoanAction,
  LoanStatus,
} from "@/lib/types";

export const LOANS = "loans";
const LOAN_LOCKS = "loanLocks";

type LoanDocument = Omit<Loan, "id">;
type BookInventoryDocument = {
  title: string;
  totalCopies: number;
  availableCopies: number;
  updatedAt: string;
};

export interface RequestLoanResult {
  loan: Loan;
  created: boolean;
}

function loanReferenceId(uid: string, clientRequestId: string): string {
  return createHash("sha256")
    .update(`${uid}:${clientRequestId}`)
    .digest("hex");
}

function lockReferenceId(uid: string, bookId: string): string {
  return createHash("sha256")
    .update(`${uid}:${bookId}`)
    .digest("hex");
}

function toLoan(id: string, data: LoanDocument): Loan {
  return { id, ...data };
}

function enforceDomainRules<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof LoanRuleError) {
      throw new ApiError(error.status, error.code, error.message);
    }
    throw error;
  }
}

export async function requestLoan(
  user: AuthUser,
  bookId: string,
  clientRequestId: string,
): Promise<RequestLoanResult> {
  const firestore = db();
  const loans = firestore.collection(LOANS);
  const loanId = loanReferenceId(user.uid, clientRequestId);
  const loanReference = loans.doc(loanId);
  const bookReference = firestore.collection(BOOKS).doc(bookId);
  const lockReference = firestore
    .collection(LOAN_LOCKS)
    .doc(lockReferenceId(user.uid, bookId));

  return firestore.runTransaction(async (transaction) => {
    const existingRequest = await transaction.get(loanReference);
    if (existingRequest.exists) {
      return { loan: toLoan(existingRequest.id, existingRequest.data() as LoanDocument), created: false };
    }

    const userLoansQuery = loans.where("userId", "==", user.uid);
    const [userLoans, , bookSnapshot] = await Promise.all([
      transaction.get(userLoansQuery),
      transaction.get(lockReference),
      transaction.get(bookReference),
    ]);

    if (!bookSnapshot.exists) {
      throw new ApiError(404, "NOT_FOUND", "Libro no encontrado.");
    }

    const book = bookSnapshot.data() as BookInventoryDocument;
    const existingLoans = userLoans.docs.map((document) => {
      const data = document.data() as LoanDocument;
      return { bookId: data.bookId, status: data.status };
    });
    enforceDomainRules(() =>
      assertCanRequest(bookId, book, existingLoans),
    );

    const requestedAt = new Date().toISOString();
    const newLoan: LoanDocument = {
      bookId,
      bookTitle: book.title,
      userId: user.uid,
      userEmail: user.email,
      userName: user.name,
      status: "requested",
      clientRequestId,
      requestedAt,
      resolvedAt: null,
      dueDate: null,
      returnedAt: null,
      updatedAt: requestedAt,
    };
    transaction.create(loanReference, newLoan);
    transaction.set(lockReference, { loanId });

    return { loan: toLoan(loanId, newLoan), created: true };
  });
}

export async function listLoans(
  user: AuthUser,
  status?: LoanStatus,
): Promise<Loan[]> {
  const collection = db().collection(LOANS);
  let query = collection as FirebaseFirestore.Query;
  if (user.role === "student") {
    query = query.where("userId", "==", user.uid);
  }
  if (status) {
    query = query.where("status", "==", status);
  }

  const snapshot = await query.get();
  return snapshot.docs
    .map((document) => toLoan(document.id, document.data() as LoanDocument))
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
}

export async function getLoan(id: string, user: AuthUser): Promise<Loan> {
  const snapshot = await db().collection(LOANS).doc(id).get();
  if (!snapshot.exists) {
    throw new ApiError(404, "NOT_FOUND", "Préstamo no encontrado.");
  }

  const loan = toLoan(snapshot.id, snapshot.data() as LoanDocument);
  if (user.role === "student" && loan.userId !== user.uid) {
    throw new ApiError(404, "NOT_FOUND", "Préstamo no encontrado.");
  }
  return loan;
}

export async function transitionLoan(
  id: string,
  action: LoanAction,
): Promise<Loan> {
  const firestore = db();
  const loanReference = firestore.collection(LOANS).doc(id);

  return firestore.runTransaction(async (transaction) => {
    const loanSnapshot = await transaction.get(loanReference);
    if (!loanSnapshot.exists) {
      throw new ApiError(404, "NOT_FOUND", "Préstamo no encontrado.");
    }

    const loan = toLoan(loanSnapshot.id, loanSnapshot.data() as LoanDocument);
    enforceDomainRules(() => assertTransitionAllowed(loan, action));
    const bookReference = firestore.collection(BOOKS).doc(loan.bookId);
    const lockReference = firestore
      .collection(LOAN_LOCKS)
      .doc(lockReferenceId(loan.userId, loan.bookId));
    const needsInventory = action !== "reject";
    const [bookSnapshot, lockSnapshot] = await Promise.all([
      needsInventory ? transaction.get(bookReference) : Promise.resolve(undefined),
      transaction.get(lockReference),
    ]);

    if (needsInventory && !bookSnapshot?.exists) {
      throw new ApiError(404, "NOT_FOUND", "Libro no encontrado.");
    }

    const book = bookSnapshot?.data() as BookInventoryDocument | undefined;
    const inventory = book
      ? { totalCopies: book.totalCopies, availableCopies: book.availableCopies }
      : { totalCopies: 0, availableCopies: 0 };
    const result = enforceDomainRules(() =>
      applyAction(loan, action, inventory),
    );
    const updatedLoan = { ...result.loan };

    transaction.update(loanReference, {
      status: updatedLoan.status,
      resolvedAt: updatedLoan.resolvedAt,
      dueDate: updatedLoan.dueDate,
      returnedAt: updatedLoan.returnedAt,
      updatedAt: updatedLoan.updatedAt,
    });

    if (book) {
      transaction.update(bookReference, {
        availableCopies: result.inventory.availableCopies,
        updatedAt: updatedLoan.updatedAt,
      });
    }

    const lockLoanId = lockSnapshot?.data()?.loanId;
    if (
      (action === "reject" || action === "return") &&
      lockLoanId === loan.id
    ) {
      transaction.delete(lockReference);
    }

    return updatedLoan;
  });
}
