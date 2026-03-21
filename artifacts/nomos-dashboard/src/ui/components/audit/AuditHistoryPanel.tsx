import React from "react";
import { AuditRecord } from "../../../audit/audit_types";

export interface AuditHistoryPanelProps {
  records: AuditRecord[];
  activeAuditId: string | null;
  onLoad: (record: AuditRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export function AuditHistoryPanel({
  records,
  activeAuditId,
  onLoad,
  onDelete,
  onClear,
}: AuditHistoryPanelProps) {
  if (!records.length) return null;

  return (
    <div className="nm-audit-history">
      <div className="nm-audit-history__header">
        <div className="nm-audit-history__title">AUDIT HISTORY</div>
        <button
          type="button"
          className="nm-fix-link"
          onClick={onClear}
        >
          Clear all
        </button>
      </div>

      <div className="nm-audit-history__list">
        {records.map((record) => (
          <div
            key={record.versionId}
            className={`nm-audit-history__item${record.id === activeAuditId ? " nm-audit-history__item--active" : ""}`}
          >
            <button
              type="button"
              className="nm-audit-history__item-body"
              onClick={() => onLoad(record)}
            >
              <div className="nm-audit-history__item-title">{record.title}</div>
              <div className="nm-audit-history__item-meta">
                <span className="nm-audit-history__intent">{record.intent}</span>
                <span>{formatTimestamp(record.timestamp)}</span>
                <span className={record.isEvaluable ? "nm-audit-history__evaluable" : "nm-audit-history__incomplete"}>
                  {record.isEvaluable ? "EVALUABLE" : "INCOMPLETE"}
                </span>
              </div>
              <div className="nm-audit-history__version">{record.versionId}</div>
            </button>

            <button
              type="button"
              className="nm-fix-link nm-audit-history__delete"
              onClick={() => onDelete(record.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
