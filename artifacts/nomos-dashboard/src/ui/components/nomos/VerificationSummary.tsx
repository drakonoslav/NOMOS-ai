import React from "react";
import { resolveToneMessage } from "../../tone/tone_resolver";
import type { ToneResolverInput } from "../../tone/tone_types";

export interface VerificationSummaryProps {
  input: ToneResolverInput;
  heading?: string;
  showAdjustments?: boolean;
}

export function VerificationSummary({
  input,
  heading = "Verification Summary",
  showAdjustments = true,
}: VerificationSummaryProps) {
  const message = resolveToneMessage(input);

  return (
    <div className="panel verification-summary">
      <div className="panel-header">{heading}</div>

      <div className="verification-summary__headline">
        <div className={`verification-summary__status verification-summary__status--${message.status.toLowerCase()}`}>
          {message.title}
        </div>
        <div className="verification-summary__summary">{message.summary}</div>
      </div>

      {message.findings.length > 0 && (
        <section className="verification-summary__section">
          <div className="verification-summary__section-title">Findings</div>
          <ol className="verification-summary__list">
            {message.findings.map((finding, idx) => (
              <li key={`${idx}-${finding}`} className="verification-summary__item">
                {finding}
              </li>
            ))}
          </ol>
        </section>
      )}

      {showAdjustments && message.adjustments.length > 0 && (
        <section className="verification-summary__section">
          <div className="verification-summary__section-title">Adjustments</div>
          <ul className="verification-summary__list verification-summary__list--unordered">
            {message.adjustments.map((adjustment, idx) => (
              <li key={`${idx}-${adjustment}`} className="verification-summary__item">
                {adjustment}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
