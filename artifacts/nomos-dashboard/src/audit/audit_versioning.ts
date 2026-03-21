export function buildVersionId(): string {
  return `ver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
