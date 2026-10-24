export type Role = "student" | "librarian";

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  year: number;
  description: string;
  totalCopies: number;
  availableCopies: number;
  coverUrl: string | null;
  updatedAt: string;
}

export type LoanStatus = "requested" | "approved" | "rejected" | "returned";

export interface Loan {
  id: string;
  bookId: string;
  bookTitle: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: LoanStatus;
  clientRequestId: string;
  requestedAt: string;
  resolvedAt: string | null;
  dueDate: string | null;
  returnedAt: string | null;
  updatedAt: string;
}

export type LoanAction = "approve" | "reject" | "return";

export interface TokenSet {
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}
