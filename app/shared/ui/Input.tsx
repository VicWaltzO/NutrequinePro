"use client";
import React from "react";
import { Field } from "@/shared/ui/Field";
type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  label: string;
  onChange: (value: string) => void;
};

export function Input({
  label: caption,
  value,
  onChange,
  type = "text",
  required = false,
  ...rest
}: InputProps) {
  return (
    <Field label={caption}>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        {...rest}
      />
    </Field>
  );
}
