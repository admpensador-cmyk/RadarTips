import * as React from "react";
import { cn } from "@/lib/cn";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50";

  const variants: Record<NonNullable<Props["variant"]>, string> = {
    primary: "bg-white text-black hover:bg-white/90",
    ghost: "bg-transparent text-white/90 hover:bg-white/10 border border-white/10",
  };

  return <button className={cn(base, variants[variant], className)} {...props} />;
}
