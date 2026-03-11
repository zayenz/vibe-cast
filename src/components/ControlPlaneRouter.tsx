import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ControlPlane } from './ControlPlane';
import { ErrorBoundary } from './ErrorBoundary';
import { commandAction } from '../router';

function createControlRouter(component: React.ReactNode) {
  return createBrowserRouter([
    {
      path: '/',
      element: component,
      action: commandAction,
    },
    {
      path: '*',
      element: component,
      action: commandAction,
    },
  ]);
}

export const ControlPlaneRouter: React.FC = () => {
  return <RouterProvider router={router} />;
};

const router = createControlRouter(
  <ErrorBoundary>
    <ControlPlane />
  </ErrorBoundary>
);
