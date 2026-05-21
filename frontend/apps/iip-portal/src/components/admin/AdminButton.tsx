import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type AdminButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'active';
export type AdminButtonSize = 'md' | 'sm' | 'xs' | 'icon';

const variantClass: Record<AdminButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
  active: 'btn-secondary btn-active',
};

const sizeClass: Record<AdminButtonSize, string> = {
  md: '',
  sm: 'btn-sm',
  xs: 'btn-xs',
  icon: 'btn-icon',
};

export interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  children: ReactNode;
}

export function AdminButton({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: AdminButtonProps) {
  const classes = [variantClass[variant], sizeClass[size], className].filter(Boolean).join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
