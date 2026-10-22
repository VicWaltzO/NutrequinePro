import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** A task group inside an operational form, using the same hierarchy as a sale. */
export function FormSection({
  title,
  label = title,
  icon: Icon,
  meta,
  accent = false,
  children,
}: {
  title: string;
  label?: string;
  icon: LucideIcon;
  meta?: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={"form-section" + (accent ? " form-section-accent" : "")} aria-label={label}>
      <div className="form-section-header">
        <h3>
          <Icon size={20} aria-hidden="true" />
          {title}
        </h3>
        {meta && <span className="form-section-meta">{meta}</span>}
      </div>
      <div className="form-section-body">{children}</div>
    </section>
  );
}
