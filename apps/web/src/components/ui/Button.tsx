import clsx from 'clsx';
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ElementType, ForwardedRef, JSX } from 'react';
import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

type ButtonAsButton = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    as?: 'button';
  };

type ButtonAsAnchor = ButtonBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps> & {
    as: 'a';
  };

type ButtonAsCustom<E extends ElementType> = ButtonBaseProps & {
  as: E;
} & Omit<React.ComponentPropsWithoutRef<E>, keyof ButtonBaseProps | 'as'>;

type ButtonProps<E extends ElementType = 'button'> = E extends 'a'
  ? ButtonAsAnchor
  : E extends 'button'
    ? ButtonAsButton
    : ButtonAsCustom<E>;

const baseStyles =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 disabled:pointer-events-none disabled:opacity-50';

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-sm',
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
  secondary: 'border border-white/10 bg-white/5 text-white hover:bg-white/10',
  danger: 'bg-rose-500 text-white hover:bg-rose-400',
  ghost: 'bg-transparent text-slate-300 hover:bg-white/5 hover:text-white',
};

function ButtonInner<E extends ElementType = 'button'>(
  { as, variant = 'primary', size = 'md', className, ...rest }: ButtonProps<E>,
  ref: ForwardedRef<Element>
) {
  const Component = (as ?? 'button') as ElementType;
  const isButton = Component === 'button';
  const props = { ...rest } as Record<string, unknown>;
  if (isButton && props.type === undefined) {
    props.type = 'button';
  }
  return (
    <Component
      ref={ref}
      className={clsx(baseStyles, sizeStyles[size], variantStyles[variant], className)}
      {...props}
    />
  );
}

const Button = forwardRef(ButtonInner) as <E extends ElementType = 'button'>(
  props: ButtonProps<E> & { ref?: ForwardedRef<Element> }
) => JSX.Element;

export default Button;
