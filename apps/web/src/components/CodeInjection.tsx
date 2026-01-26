import { useEffect } from 'react';
import { usePublicSystemConfig } from '../hooks/usePublicSystemConfig';

const applyHtmlInjection = (target: HTMLElement, marker: string, html: string | null, position?: 'start' | 'end') => {
  const trimmed = html?.trim() ?? '';
  const attr = `data-code-injection-${marker}`;
  const existing = target.querySelector<HTMLElement>(`[${attr}]`);

  if (!trimmed) {
    if (existing) existing.remove();
    return;
  }

  const container = existing ?? document.createElement('div');
  container.setAttribute(attr, 'true');
  if (!existing) {
    if (position === 'start' && target.firstChild) {
      target.insertBefore(container, target.firstChild);
    } else {
      target.appendChild(container);
    }
  }

  if (container.getAttribute('data-html') === trimmed) return;
  container.setAttribute('data-html', trimmed);
  container.innerHTML = trimmed;

  container.querySelectorAll('script').forEach((script) => {
    const replacement = document.createElement('script');
    Array.from(script.attributes).forEach((attrItem) => {
      replacement.setAttribute(attrItem.name, attrItem.value);
    });
    replacement.text = script.textContent ?? '';
    script.replaceWith(replacement);
  });
};

const CodeInjection = () => {
  const { data } = usePublicSystemConfig();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    applyHtmlInjection(document.head, 'head', data?.customHeadCode ?? null);
    applyHtmlInjection(document.body, 'body-start', data?.customBodyStart ?? null, 'start');
    applyHtmlInjection(document.body, 'body-end', data?.customBodyEnd ?? null, 'end');
  }, [data?.customHeadCode, data?.customBodyStart, data?.customBodyEnd]);

  return null;
};

export default CodeInjection;
