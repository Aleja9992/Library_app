import "server-only";
import { listBooks, listCategories, getBook } from "@/lib/data/books";
import { getLoan, listLoans } from "@/lib/data/loans";
import type { BookFilter } from "@/lib/data/books";
import type { LoanStatus } from "@/lib/types";
import { requireWebUser } from "@/lib/web/access";

export async function getWebBooks(filter: BookFilter = {}) {
  await requireWebUser();
  return listBooks(filter);
}

export async function getWebCategories() {
  await requireWebUser();
  return listCategories();
}

export async function getWebBook(id: string) {
  await requireWebUser();
  return getBook(id);
}

export async function getWebLoans(status?: LoanStatus) {
  const user = await requireWebUser();
  return listLoans(user, status);
}

export async function getWebLoan(id: string) {
  const user = await requireWebUser();
  return getLoan(id, user);
}
