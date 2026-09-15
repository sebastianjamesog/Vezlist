"use client";

import Icon from "./Icon";

export default function EmptyState({ icon = "Inbox", title, body, action }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-16 text-center shadow-card">
      <span className="grid size-16 place-items-center rounded-full bg-brand-soft">
        <Icon name={icon} className="size-7 text-brand" strokeWidth={1.8} />
      </span>
      <p className="text-[18px] font-bold text-ink">{title}</p>
      {body && (
        <p className="max-w-xs text-[14px] leading-relaxed text-muted">
          {body}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
