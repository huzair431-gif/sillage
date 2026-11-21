import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import App from './App';
import { ErrorState } from './ui';
import './styles.css';
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
  mutationCache: new MutationCache({ onError: (e) => toast.error(e.message) }),
});
const router = createBrowserRouter([
  {
    path: '*',
    element: <App />,
    errorElement: (
      <ErrorState
        error={
          new Error(
            'L’affichage a été interrompu. Rechargez votre espace ; vos données confirmées sont conservées.',
          )
        }
        retry={() => window.location.reload()}
      />
    ),
  },
]);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  </React.StrictMode>,
);
