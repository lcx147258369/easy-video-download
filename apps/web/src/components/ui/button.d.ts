import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export interface ButtonProps extends PropsWithChildren, ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
}
export declare function Button({ children, className, variant, ...props }: ButtonProps): import("react/jsx-runtime").JSX.Element;
export {};
