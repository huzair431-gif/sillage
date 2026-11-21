import { createContext, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from './api';
export const AuthContext = createContext<User | null>(null);
export function useUser() {
  const user = useContext(AuthContext);
  if (!user) throw new Error('Un compte connecté est requis pour cet écran.');
  return user;
}
export function useRefresh() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      predicate: (q) => !['me', 'preferences', 'quiz'].includes(String(q.queryKey[0])),
    });
}
