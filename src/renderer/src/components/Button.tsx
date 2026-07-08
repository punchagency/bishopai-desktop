import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      style={{ margin: "0, 12px" }}
      className={`il-btn il-btn--${variant} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
