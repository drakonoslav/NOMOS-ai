import React from "react";
import { resolveToneMessage } from "../../tone/tone_resolver";
import type { ToneResolverInput } from "../../tone/tone_types";

export interface StatusCardProps {
  input: ToneResolverInput;
  title?: string;
}

export function StatusCard({ input, title = "System Status" }: StatusCardProps) {
  const message = resolveToneMessage(input);

  return (
    <div className="panel status-card">
      <div className="panel-header">{title}</div>

      <div className="status-card__top">
        <div className={`status-card__badge status-card__badge--${message.status.toLowerCase()}`}>
          {message.title}
        </div>
        <div className={`status-card__authority status-card__authority--${message.authority.toLowerCase()}`}>
          {message.authority}
        </div>
      </div>

      <div className="status-card__summary">{message.summary}</div>

      {message.body.length > 0 && (
        <div className="status-card__body">
          {message.body.map((line, idx) => (
            <p key={`${idx}-${line}`} className="status-card__line">
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="status-card__meta">
        <span className="status-card__tone-label">Tone</span>
        <span className="status-card__tone-value">{message.tone}</span>
      </div>
    </div>
  );
}
