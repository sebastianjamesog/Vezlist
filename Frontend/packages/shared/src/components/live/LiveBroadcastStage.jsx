"use client";

/** Shared viewer/creator composition. Slots own their behavior; the stage only
 * places real controls above the video and keeps the chat inside the viewport. */
export default function LiveBroadcastStage({
  media,
  identity,
  status,
  actions,
  close,
  title,
  subtitle,
  notice,
  footer,
  bottomControls,
  ariaLabel = "Live broadcast",
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 text-white sm:p-4">
      <section
        aria-label={ariaLabel}
        className="relative isolate flex h-dvh w-full flex-col overflow-hidden bg-black sm:h-[calc(100dvh-32px)] sm:max-h-[960px] sm:w-[min(540px,calc(56.25dvh_-_18px))] sm:max-w-[540px] sm:rounded-[28px] sm:shadow-2xl"
      >
        <div className="absolute inset-0">{media}</div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/65 to-transparent"
        />
        <div className="pointer-events-none relative z-30 flex items-start justify-between gap-3 px-4 pb-2 pt-[max(16px,env(safe-area-inset-top))] [&>*]:pointer-events-auto">
          <div className="min-w-0 max-w-[calc(100%-56px)]">{identity}</div>
          <div className="shrink-0">{close}</div>
        </div>
        <div className="pointer-events-none absolute right-4 top-[max(80px,calc(env(safe-area-inset-top)+64px))] z-30 flex flex-col items-end gap-3 [&>*]:pointer-events-auto">
          {status}
          {actions}
        </div>
        {notice && (
          <div className="relative z-30 ml-4 mr-[76px] mt-3">{notice}</div>
        )}
        <div className="pointer-events-none relative z-20 mt-auto flex max-h-[65%] min-h-0 flex-col bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-16 [&>*]:pointer-events-auto">
          {(title || subtitle) && (
            <div className="mb-3 shrink-0 pr-2 [text-shadow:0_1px_5px_rgb(0_0_0/0.7)]">
              {title && (
                <h1 className="line-clamp-2 text-[22px] font-bold leading-tight sm:text-2xl">
                  {title}
                </h1>
              )}
              {subtitle && (
                <div className="mt-1 text-xs text-white/75">{subtitle}</div>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
            {footer}
          </div>
          {bottomControls && (
            <div className="shrink-0 pt-3">{bottomControls}</div>
          )}
        </div>
      </section>
    </main>
  );
}
