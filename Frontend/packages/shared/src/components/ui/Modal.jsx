"use client";

import { useId } from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "../../lib/useDialogFocus";

/** Bottom sheet on mobile, centred dialog on desktop. */
export default function Modal({
  open,
  title,
  subtitle,
  onClose,
  footer,
  bodyClassName = "min-h-0 overflow-y-auto px-5 py-5 lg:px-8",
  size = "max-w-xl",
  children,
}) {
  const ref = useDialogFocus(open, onClose);
  const id = useId();

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-[1000] flex flex-col justify-end pb-nav lg:fixed lg:items-center lg:justify-center lg:p-8 lg:pb-8"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={subtitle ? `${id}-subtitle` : undefined}
        // Focusable, never a tab stop: opening lands here so the dialog reads
        // its own name, and the cycle then runs over the controls only.
        tabIndex={-1}
        className={`relative flex max-h-[93%] w-full flex-col overflow-hidden rounded-t-sheet bg-surface shadow-lift outline-none lg:max-h-[86vh] lg:rounded-sheet ${size}`}
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-line lg:hidden"
        />

        <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-4 lg:px-8 lg:pt-7">
          <div className="min-w-0">
            <h2
              id={`${id}-title`}
              className="text-[24px] font-extrabold leading-tight text-ink"
            >
              {title}
            </h2>
            {subtitle && (
              <p
                id={`${id}-subtitle`}
                className="mt-1 text-[14px] leading-snug text-muted"
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas text-muted transition-colors hover:bg-line hover:text-ink"
          >
            <X className="size-[18px]" strokeWidth={2.4} />
          </button>
        </header>

        <div className={`flex-1 ${bodyClassName}`}>{children}</div>

        {footer && (
          <div className="border-t border-line px-5 py-4 lg:px-8">{footer}</div>
        )}
      </div>
    </div>
  );
}
