"use client";

import Link from "next/link";

const VARIANTS = {
  primary:
    "brand-gradient text-on-brand shadow-pop hover:brightness-110 active:brightness-95",
  soft: "bg-brand-soft text-brand hover:bg-brand hover:text-on-brand",
  outline: "border border-line bg-surface text-ink hover:border-ink/25",
  ghost: "text-ink hover:bg-canvas",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

const SIZES = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-xl",
  md: "h-11 px-5 text-[15px] gap-2 rounded-2xl",
  lg: "h-[52px] px-6 text-[16px] gap-2 rounded-2xl",
};

/** One button, five looks. Renders as a link when `to` is passed. */
export default function Button({
  variant = "primary",
  size = "md",
  to,
  className = "",
  children,
  ...props
}) {
  const cls = `inline-flex shrink-0 items-center justify-center font-semibold transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
  return to ? (
    <Link href={to} className={cls} {...props}>
      {children}
    </Link>
  ) : (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
