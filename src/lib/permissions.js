/**
 * Granular RBAC helpers.
 * Permission flags are stored on the user Firestore doc under `permissions`.
 * When a flag is absent, the role-based default applies so existing behaviour
 * is fully preserved for current admin/professional/assistant users.
 */

/**
 * Derive effective permissions from a Firestore user document.
 * @param {object|null|undefined} userData - data from the users/{uid} doc
 * @returns {{ canApprove: boolean, canDelete: boolean, isColombiaApprover: boolean, canExport: boolean }}
 */
export function resolvePermissions(userData) {
  const role = userData?.role || 'professional';
  const isAdmin = role === 'admin';
  const flags = userData?.permissions || {};

  return {
    canApprove:         flags.canApprove         !== undefined ? !!flags.canApprove         : isAdmin,
    canDelete:          flags.canDelete           !== undefined ? !!flags.canDelete           : isAdmin,
    isColombiaApprover: flags.isColombiaApprover  !== undefined ? !!flags.isColombiaApprover  : false,
    canExport:          flags.canExport           !== undefined ? !!flags.canExport           : isAdmin,
  };
}

/**
 * An expense is considered a "Colombia expense" when its currency is COP
 * (the documented assumption; can be refined to a country field later).
 */
export function isColombiaExpense(expense) {
  return (expense?.currency || 'COP') === 'COP';
}

/**
 * Check whether the current user may approve a specific expense.
 * Colombia/COP expenses require a dedicated Colombia approver.
 * Non-COP expenses only require canApprove.
 */
export function canUserApprove(perms, expense) {
  if (isColombiaExpense(expense)) {
    return perms.isColombiaApprover === true;
  }
  return perms.canApprove === true;
}
