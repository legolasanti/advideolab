import clsx from 'clsx';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';

type Props = {
  children: string;
  className?: string;
};

const isExternalHref = (href: string) => /^https?:\/\//i.test(href);

const MarkdownRenderer = ({ children, className }: Props) => {
  return (
    <div className={clsx('space-y-5 text-sm leading-relaxed text-slate-300', className)}>
      <Markdown
        components={{
          h1: ({ children: nodeChildren }) => (
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{nodeChildren}</h1>
          ),
          h2: ({ children: nodeChildren }) => (
            <h2 className="mt-10 text-2xl font-semibold tracking-tight text-white md:text-3xl">{nodeChildren}</h2>
          ),
          h3: ({ children: nodeChildren }) => (
            <h3 className="mt-8 text-xl font-semibold tracking-tight text-white">{nodeChildren}</h3>
          ),
          p: ({ children: nodeChildren }) => <p className="text-sm leading-relaxed text-slate-300">{nodeChildren}</p>,
          ul: ({ children: nodeChildren }) => <ul className="list-disc space-y-2 pl-6">{nodeChildren}</ul>,
          ol: ({ children: nodeChildren }) => <ol className="list-decimal space-y-2 pl-6">{nodeChildren}</ol>,
          li: ({ children: nodeChildren }) => <li className="leading-relaxed">{nodeChildren}</li>,
          strong: ({ children: nodeChildren }) => <strong className="font-semibold text-white">{nodeChildren}</strong>,
          em: ({ children: nodeChildren }) => <em className="text-slate-200">{nodeChildren}</em>,
          a: ({ href, children: nodeChildren }) => {
            const safeHref = href ?? '';
            const external = safeHref && isExternalHref(safeHref);
            return (
              <a
                href={safeHref}
                className="text-emerald-300 underline decoration-emerald-400/40 underline-offset-4 hover:text-emerald-200 hover:decoration-emerald-300"
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer noopener' : undefined}
              >
                {nodeChildren}
              </a>
            );
          },
          blockquote: ({ children: nodeChildren }) => (
            <blockquote className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 px-5 py-4 text-slate-200">
              {nodeChildren}
            </blockquote>
          ),
          hr: () => <hr className="my-10 border-white/10" />,
          pre: ({ children: nodeChildren }) => (
            <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-slate-100">
              {nodeChildren as ReactNode}
            </pre>
          ),
          code: (props) => {
            const inline = Boolean((props as any).inline);
            const nodeChildren = props.children;
            return inline ? (
              <code className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-0.5 text-[0.92em] text-slate-100">
                {nodeChildren}
              </code>
            ) : (
              <code className="text-slate-100">{nodeChildren}</code>
            );
          },
        }}
      >
        {children}
      </Markdown>
    </div>
  );
};

export default MarkdownRenderer;
