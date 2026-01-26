import clsx from 'clsx';
import type { ReactNode } from 'react';

type Props = {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
};

const FormField = ({ label, hint, error, required, htmlFor, className, children }: Props) => {
  return (
    <div className={clsx('space-y-2', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-300">
        {label}
        {required && <span className="ml-1 text-rose-300">*</span>}
      </label>
      <div>{children}</div>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-rose-200">{error}</p>}
    </div>
  );
};

export default FormField;
