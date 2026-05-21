import type { ReactNode } from 'react';

interface AdminFormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function AdminFormField({
  id,
  label,
  required,
  hint,
  error,
  className = '',
  children,
}: AdminFormFieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="admin-form-label">
        {label}
        {required && (
          <span className="text-red-500 dark:text-red-400 ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="admin-form-hint">{hint}</p>}
      {error && <p className="invalid-feedback">{error}</p>}
    </div>
  );
}
