import type { InputHTMLAttributes, PropsWithChildren, TextareaHTMLAttributes } from "react";
export declare function Field({ label, hint, children }: PropsWithChildren<{
    label: string;
    hint?: string;
}>): import("react/jsx-runtime").JSX.Element;
export declare function TextInput(props: InputHTMLAttributes<HTMLInputElement>): import("react/jsx-runtime").JSX.Element;
export declare function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): import("react/jsx-runtime").JSX.Element;
