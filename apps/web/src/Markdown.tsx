import { lazy, Suspense } from 'react';
const Renderer = lazy(() => import('./MarkdownRenderer'));
export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <Suspense fallback={<span className="muted">Chargement du contenu…</span>}>
      <Renderer className={className}>{children}</Renderer>
    </Suspense>
  );
}
