// Shim for `next/dynamic`, aliased in electron.vite.config.ts.

import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';

interface DynamicOptions {
  ssr?: boolean;
  loading?: ComponentType;
}

type Loader<P> = () => Promise<{ default: ComponentType<P> } | ComponentType<P>>;

export default function dynamic<P extends object>(
  loader: Loader<P>,
  options?: DynamicOptions,
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const mod = await loader();
    return 'default' in mod ? mod : { default: mod };
  });
  const Loading = options?.loading;
  return function Dynamic(props: P): ReactNode {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
