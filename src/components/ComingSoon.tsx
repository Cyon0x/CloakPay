import type { ReactNode } from "react";
import { Card } from "./ui";
import { Icon } from "./Icon";

/**
 * A paused feature, stated plainly.
 *
 * CloakPay used to offer an external transfer and a shielded pool. Both are
 * switched off while payments between CloakPay users are the whole product, and
 * a switch that is off has to look deliberate rather than broken: the control
 * is present, says what it is, says that it is not available yet, and offers
 * nothing to click.
 *
 * The point of a component rather than a one-off is consistency — the same
 * words and the same shape wherever a paused path is mentioned, so two screens
 * cannot tell the user two different stories about the same feature.
 */
export function ComingSoon({
  title,
  icon = "lock",
  body,
  note,
  children,
}: {
  title: string;
  icon?: string;
  /** One or two sentences: what the feature is, and that it is not available. */
  body: string;
  /** What happens to the work behind it, so nothing reads as deleted. */
  note?: string;
  children?: ReactNode;
}) {
  return (
    <Card className="card-quiet">
      <div className="privacy-teaser">
        <span className="feature-icon" aria-hidden="true">
          <Icon name={icon} size={17} />
        </span>
        <div className="grow">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ fontSize: 15 }}>{title}</h3>
            <span className="badge badge-info">
              <span className="dot" aria-hidden="true" />
              Coming soon
            </span>
          </div>
          <p className="tiny muted" style={{ marginTop: 6, maxWidth: "62ch" }}>
            {body}
          </p>
          {note ? (
            <p className="tiny muted" style={{ marginTop: 6, maxWidth: "62ch" }}>
              {note}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </Card>
  );
}
