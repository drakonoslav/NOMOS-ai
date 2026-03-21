import { StructuredDraft, AutoCompileResult } from "../compiler/auto_compiler";

export interface AuditEvaluationResult {
  status?: string;
  payload?: unknown;
}

export interface AuditRecord {
  id: string;
  versionId: string;
  parentVersionId?: string | null;

  timestamp: string;

  intent: string;
  title: string;

  isEvaluable: boolean;
  isConfirmed: boolean;

  canonicalDeclaration: string;

  compileResult: AutoCompileResult | null;
  patchedDraft: StructuredDraft | null;
  evaluationResult: AuditEvaluationResult | null;
}
