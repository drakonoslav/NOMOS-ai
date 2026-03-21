import React, { useState } from "react";
import { AuditRecord } from "../../../audit/audit_types";
import { TraceDiffPanel } from "./TraceDiffPanel";

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
  const [compareMode, setCompareMode] = useState(false);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  if (!records.length) return null;

  function handleToggleCompare() {
    setCompareMode((v) => !v);
    setBeforeId(null);
    setAfterId(null);
  }

  function handleSelectSlot(id: string) {
    if (!compareMode) return;
    if (beforeId === null) {
      setBeforeId(id);
    } else if (beforeId === id) {
      setBeforeId(null);
    } else if (afterId === null) {
      setAfterId(id);
    } else if (afterId === id) {
      setAfterId(null);
    } else {
      setAfterId(id);
    }
  }

  const beforeRecord = records.find((r) => r.id === beforeId) ?? null;
  const afterRecord = records.find((r) => r.id === afterId) ?? null;
  const canCompare = beforeRecord !== null && afterRecord !== null;

  return (
    <div className="nm-audit-history">
      <div className="nm-audit-history__header">
        <div className="nm-audit-history__title">AUDIT HISTORY</div>
        <div className="nm-audit-history__header-actions">
          {records.length >= 2 && (
            <button
              type="button"
              className={`nm-fix-link nm-audit-history__compare-btn${compareMode ? " nm-audit-history__compare-btn--active" : ""}`}
              onClick={handleToggleCompare}
            >
              {compareMode ? "Cancel compare" : "Compare"}
            </button>
          )}
          <button
            type="button"
            className="nm-fix-link"
            onClick={onClear}
          >
            Clear all
          </button>
        </div>
      </div>

      {compareMode && (
        <div className="nm-audit-history__compare-hint">
          {beforeId === null
            ? "Select first run (Before)."
            : afterId === null
            ? "Select second run (After)."
            : "Compare ready — view diff below."}
        </div>
      )}

      <div className="nm-audit-history__list">
        {records.map((record) => {
          const isActive = record.id === activeAuditId;
          const isBefore = compareMode && record.id === beforeId;
          const isAfter = compareMode && record.id === afterId;

          let itemClass = "nm-audit-history__item";
          if (isActive) itemClass += " nm-audit-history__item--active";
          if (isBefore) itemClass += " nm-audit-history__item--before";
          if (isAfter) itemClass += " nm-audit-history__item--after";

          return (
            <div key={record.versionId} className={itemClass}>
              <button
                type="button"
                className="nm-audit-history__item-body"
                onClick={() => {
                  if (compareMode) {
                    handleSelectSlot(record.id);
                  } else {
                    onLoad(record);
                  }
                }}
              >
                <div className="nm-audit-history__item-title-row">
                  <div className="nm-audit-history__item-title">{record.title}</div>
                  {compareMode && (isBefore || isAfter) && (
                    <span className={`nm-audit-history__slot-badge nm-audit-history__slot-badge--${isBefore ? "before" : "after"}`}>
                      {isBefore ? "A" : "B"}
                    </span>
                  )}
                </div>
                <div className="nm-audit-history__item-meta">
                  <span className="nm-audit-history__intent">{record.intent}</span>
                  <span>{formatTimestamp(record.timestamp)}</span>
                  <span className={record.isEvaluable ? "nm-audit-history__evaluable" : "nm-audit-history__incomplete"}>
                    {record.isEvaluable ? "EVALUABLE" : "INCOMPLETE"}
                  </span>
                </div>
                <div className="nm-audit-history__version">{record.versionId}</div>
              </button>

              {!compareMode && (
                <button
                  type="button"
                  className="nm-fix-link nm-audit-history__delete"
                  onClick={() => onDelete(record.id)}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canCompare && compareMode && (
        <TraceDiffPanel before={beforeRecord!} after={afterRecord!} />
      )}
    </div>
  );
}
