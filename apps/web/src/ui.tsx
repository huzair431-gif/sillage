import * as D from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Children,
  cloneElement,
  isValidElement,
  forwardRef,
  useRef,
  useId,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  Check,
  ChevronDown,
  LoaderCircle,
  MoreHorizontal,
  X,
  AlertCircle,
  BookOpen,
  Plus,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export const buttonVariants = cva('button', {
  variants: {
    variant: {
      primary: 'button-primary',
      secondary: 'button-secondary',
      ghost: 'button-ghost',
      danger: 'button-danger',
    },
    size: { default: '', small: 'button-small', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
});
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean }
>(({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
  if (asChild)
    return (
      <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  const Comp = 'button';
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="spin" size={17} /> : null}
      {children}
    </Comp>
  );
});
Button.displayName = 'Button';
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={cn('logo', small && 'logo-small')}>
      <svg width="30" height="32" viewBox="0 0 30 32" fill="none" aria-hidden="true">
        <path
          d="M6 25C22 25 7 6 25 6M4 19C15 19 5 3 20 3M11 29C29 29 15 13 27 13"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {!small && (
        <span>
          sillage<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  mandatory = false,
}: {
  open: boolean;
  onOpenChange?: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  mandatory?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <D.Root
      open={open}
      onOpenChange={(v) => {
        if (!mandatory) onOpenChange?.(v);
      }}
    >
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content
          ref={content}
          onOpenAutoFocus={(e) => {
            previousFocus.current = document.activeElement as HTMLElement | null;
            if (mandatory) {
              e.preventDefault();
              content.current?.focus();
              return;
            }
            const field = content.current?.querySelector<HTMLElement>(
              'input:not([type=hidden]),textarea,select',
            );
            if (field) {
              e.preventDefault();
              field.focus();
            }
          }}
          onCloseAutoFocus={(e) => {
            const previous = previousFocus.current;
            const disabled = previous instanceof HTMLButtonElement && previous.disabled;
            const target =
              previous?.isConnected && !disabled
                ? previous
                : document.querySelector<HTMLElement>('[data-dialog-return-focus]');
            if (target) {
              e.preventDefault();
              target.focus();
            }
          }}
          className={cn('dialog', wide && 'dialog-wide')}
          onEscapeKeyDown={(e) => {
            if (mandatory) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (mandatory) e.preventDefault();
          }}
        >
          <div className="dialog-heading">
            <D.Title>{title}</D.Title>
            {!mandatory && (
              <D.Close className="button button-ghost button-icon" aria-label="Fermer">
                <X size={19} />
              </D.Close>
            )}
          </div>
          <D.Description className={description ? 'dialog-description' : 'sr-only'}>
            {description ?? title}
          </D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
export function Dropdown({ children, label = 'Actions' }: { children: ReactNode; label?: string }) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal size={19} />
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="dropdown" align="end" sideOffset={6}>
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
export function MenuItem({
  children,
  onSelect,
  danger = false,
}: {
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <Menu.Item className={cn('dropdown-item', danger && 'text-danger')} onSelect={onSelect}>
      {children}
    </Menu.Item>
  );
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={cn('badge', `badge-${tone}`)}>{children}</span>;
}
export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label ?? 'Progression'}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        initial={false}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.2 }}
      />
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      <span>Chargement de votre espace…</span>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error | null; retry: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={25} />
      <h2>Une interruption passagère</h2>
      <p>{error?.message ?? 'Impossible de charger les données.'}</p>
      <Button variant="secondary" onClick={retry}>
        Réessayer
      </Button>
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon ?? <BookOpen size={26} />}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  const fieldId = useId();
  let bound = false;
  let controlId = fieldId;
  const described =
    [hint ? fieldId + '-hint' : '', error ? fieldId + '-error' : ''].filter(Boolean).join(' ') ||
    undefined;
  const bind = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (node) => {
      if (
        !isValidElement<{
          children?: ReactNode;
          id?: string;
          'aria-describedby'?: string;
          'aria-invalid'?: boolean;
        }>(node)
      )
        return node;
      if (
        !bound &&
        typeof node.type === 'string' &&
        ['input', 'textarea', 'select'].includes(node.type)
      ) {
        bound = true;
        controlId = node.props.id ?? fieldId;
        return cloneElement(node, {
          id: controlId,
          'aria-describedby': described,
          'aria-invalid': Boolean(error),
        });
      }
      return node.props.children
        ? cloneElement(node, { children: bind(node.props.children) })
        : node;
    });
  const controls = bind(children);
  return (
    <div
      className="field"
      role={bound ? undefined : 'group'}
      aria-labelledby={bound ? undefined : fieldId + '-label'}
    >
      {bound ? (
        <label htmlFor={controlId}>{label}</label>
      ) : (
        <span id={fieldId + '-label'}>{label}</span>
      )}
      {controls}
      {hint && <small id={fieldId + '-hint'}>{hint}</small>}
      {error && (
        <small id={fieldId + '-error'} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-action">{action}</div>}
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function SubjectIcon({ color = 'indigo', size = 22 }: { color?: string; size?: number }) {
  return (
    <span className={cn('subject-icon', `color-${color}`)}>
      <BookOpen size={size} strokeWidth={1.6} />
    </span>
  );
}
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  loading = false,
  label = 'Confirmer',
  danger = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  loading?: boolean;
  label?: string;
  danger?: boolean;
}) {
  return (
    <Dialog {...{ open, onOpenChange, title, description }}>
      <div className="dialog-actions">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
          {label}
        </Button>
      </div>
    </Dialog>
  );
}
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <Plus size={17} />
      {children}
    </Button>
  );
}
