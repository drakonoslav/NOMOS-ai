import { StructuredDraft, AutoCompileResult } from "../compiler/auto_compiler";
import type { PersistedRoutingRecord } from "./policy_routing_types";

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

  /**
   * The domain routing decision that was resolved before this evaluation ran.
   * Records the domain, active policy version used, routing reason, and whether
   * the default fallback policy was applied. Null on records created before
   * routing was introduced.
   */
  routingRecord?: PersistedRoutingRecord | null;
}
