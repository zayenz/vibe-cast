import React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { render, type RenderOptions } from '@testing-library/react';
import { commandAction } from '../../router';

interface RouterTestOptions {
  /** Initial route entries */
  initialEntries?: string[];
  /** Additional routes to include */
  routes?: Array<{
    path: string;
    element: React.ReactNode;
  }>;
}

/**
 * Render a component wrapped in a memory router for testing.
 * This enables useFetcher and other router hooks to work.
 */
export function renderWithRouter(
  ui: React.ReactElement,
  options: RouterTestOptions & Omit<RenderOptions, 'wrapper'> = {}
) {
  const { initialEntries = ['/'], routes = [], ...renderOptions } = options;

  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: ui,
        action: commandAction,
      },
      ...routes,
    ],
    { initialEntries }
  );

  function Wrapper() {
    return <RouterProvider router={router} />;
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    router,
  };
}

/**
 * Create a test router with custom configuration
 */
export function createTestRouter(element: React.ReactNode, options: RouterTestOptions = {}) {
  const { initialEntries = ['/'], routes = [] } = options;

  return createMemoryRouter(
    [
      {
        path: '/',
        element,
        action: commandAction,
      },
      ...routes,
    ],
    { initialEntries }
  );
}

