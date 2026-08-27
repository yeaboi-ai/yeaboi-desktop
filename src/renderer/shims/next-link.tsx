// Shim for `next/link`, aliased in electron.vite.config.ts.

import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  children?: ReactNode;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, prefetch: _prefetch, replace, scroll: _scroll, shallow: _shallow, children, ...rest },
  ref,
) {
  // External links keep a plain anchor — the shell's window-open handler
  // sends them to the OS browser.
  if (/^[a-z]+:/i.test(href) && !href.startsWith('/')) {
    return (
      <a ref={ref} href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink ref={ref} to={href} replace={replace} {...rest}>
      {children}
    </RouterLink>
  );
});

export default Link;
