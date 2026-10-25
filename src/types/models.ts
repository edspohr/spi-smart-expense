// Firestore document shapes. Dates are ISO-8601 strings (the app never
// stores Firestore Timestamps). Fields marked optional are absent on older
// documents; code must treat them as nullable.

export type Role = 'superadmin' | 'admin' | 'assistant' | 'professional';

export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

export type Currency = 'COP' | 'USD' | 'EUR' | 'CLP';

export type PaymentMethod = 'Credit Card' | 'Debit Card' | 'Cash' | 'Transfer' | 'Wallet' | 'Other';

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'citi' | 'diners' | 'other';

export interface UserPermissions {
  canApprove?: boolean;
  canDelete?: boolean;
  isColombiaApprover?: boolean;
  canExport?: boolean;
}

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  balance: number;
  photoURL?: string | null;
  permissions?: UserPermissions;
  forcePasswordChange?: boolean;
}

export interface ProjectDoc {
  name: string;
  code: string;
  client: string;
  status: 'active' | 'archived';
  budget: number;
  expenses: number;
  createdAt: string;
}

export type AllocationType = 'allocation' | 'transfer_in' | 'transfer_out';

export interface AllocationDoc {
  userId: string;
  userName: string;
  projectId: string;
  projectName: string;
  amount: number;
  date: string;
  createdAt: string;
  type?: AllocationType;
}

export interface ExpenseDoc {
  userId: string;
  userName: string;
  projectId: string;
  projectName: string;
  eventName: string;
  category: string;
  date: string;
  time: string | null;
  merchant: string;
  taxId: string | null;
  invoiceNumber: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  paymentMethod: PaymentMethod | string | null;
  cardBrand: CardBrand | null;
  cardCompany: string | null;
  cardLast4: string | null;
  description: string;
  amount: number;
  currency: Currency;
  receiptUrl: string | null;
  voucherUrl: string | null;
  status: ExpenseStatus;
  createdAt: string;
  isCompanyExpense: boolean;
  splitGroupId: string | null;
  trm: number | null;
  amountCOP: number | null;
  trmSource: string | null;
  rejectionReason?: string | null;
  reviewedAt?: string;
  reviewedByUid?: string | null;
  reviewedByName?: string | null;
}

export interface MovementDoc {
  field: string;
  from: unknown;
  to: unknown;
  byUid: string;
  byName: string;
  at: string;
}

export interface NotificationDoc {
  toUid: string;
  type: string;
  title: string;
  body: string;
  expenseId: string | null;
  read: boolean;
  createdAt: string;
}

export type WithId<T> = T & { id: string };
