const assignableRoles = new Set(['admin', 'manager', 'supervisor', 'service-crew']);
const legacyRoles = new Set(['staff', 'cashier']);

const normalizeUserRole = (role) =>
    typeof role === 'string' ? role.trim().toLowerCase() : '';

const isAssignableUserRole = (role) => assignableRoles.has(normalizeUserRole(role));
const isLegacyUserRole = (role) => legacyRoles.has(normalizeUserRole(role));

module.exports = {
    normalizeUserRole,
    isAssignableUserRole,
    isLegacyUserRole,
};
