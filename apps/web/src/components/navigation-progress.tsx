'use client';

import NextTopLoader from 'nextjs-toploader';

export function NavigationProgress() {
  return (
    <NextTopLoader
      color="rgba(0, 0, 0, 0.96)"
      height={3}
      showSpinner={false}
      crawl
      crawlSpeed={200}
      speed={200}
      shadow="0 0 10px rgba(0, 0, 0, 0.96),0 0 5px rgba(0, 0, 0, 0.96)"
    />
  );
}
