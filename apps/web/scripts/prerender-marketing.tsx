import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LandingPage from '../src/pages/marketing/LandingPage';
import ProductPage from '../src/pages/marketing/ProductPage';
import PricingPage from '../src/pages/marketing/PricingPage';
import AboutPage from '../src/pages/marketing/AboutPage';
import ContactPage from '../src/pages/marketing/ContactPage';
import ExamplesPage from '../src/pages/marketing/ExamplesPage';
import PrivacyPolicyPage from '../src/pages/marketing/PrivacyPolicyPage';
import TermsPage from '../src/pages/marketing/TermsPage';
import CookiePolicyPage from '../src/pages/marketing/CookiePolicyPage';
import { MarketingLayoutShell } from '../src/layouts/MarketingLayout';

// Create a QueryClient for SSR (queries won't actually fetch, just use fallbacks)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
    },
  },
});

type RouteEntry = {
  path: string;
  component: React.ComponentType;
};

const routes: RouteEntry[] = [
  { path: '/', component: LandingPage },
  { path: '/product', component: ProductPage },
  { path: '/pricing', component: PricingPage },
  { path: '/about', component: AboutPage },
  { path: '/contact', component: ContactPage },
  { path: '/examples', component: ExamplesPage },
  { path: '/privacy', component: PrivacyPolicyPage },
  { path: '/terms', component: TermsPage },
  { path: '/cookie-policy', component: CookiePolicyPage },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

const marker = '<div id="root"></div>';

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const renderRoute = (route: RouteEntry) => {
  (globalThis as any).__UGC_PRERENDER__ = true;
  const element = React.createElement(route.component);
  const markup = renderToString(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route.path]}>
        <MarketingLayoutShell>{element}</MarketingLayoutShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  delete (globalThis as any).__UGC_PRERENDER__;
  return markup;
};

const outputPathForRoute = (routePath: string) => {
  if (routePath === '/') {
    return path.join(distDir, 'index.html');
  }
  const sanitized = routePath.replace(/^\//, '');
  return path.join(distDir, sanitized, 'index.html');
};

const main = async () => {
  try {
    const template = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
    if (!template.includes(marker)) {
      throw new Error('Unable to find root mount marker in dist/index.html');
    }

    for (const route of routes) {
      const markup = renderRoute(route);
      const html = template.replace(marker, `<div id="root">${markup}</div>`);
      const outputPath = outputPathForRoute(route.path);
      await ensureDir(path.dirname(outputPath));
      await fs.writeFile(outputPath, html, 'utf8');
      console.log(`Prerendered ${route.path} -> ${outputPath}`);
    }
  } catch (err) {
    console.error('[prerender] failed', err);
    process.exit(1);
  }
};

main();
