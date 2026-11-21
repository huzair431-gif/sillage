import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthPage } from '../apps/web/src/AuthPage';
import { api, ApiError, setCsrf } from '../apps/web/src/api';

vi.mock('../apps/web/src/api', async (original) => ({
  ...(await original<typeof import('../apps/web/src/api')>()),
  api: vi.fn(),
  setCsrf: vi.fn(),
}));
vi.mock('../apps/web/src/BrandArt', () => ({ MemoryArt: () => null }));

const clients: QueryClient[] = [];
const password = 'Un mot de passe personnel';
const account = { id: 'new-user', name: 'Camille', email: 'camille@test.invalid', csrf: 'token' };
function renderAuth() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <AuthPage />
    </QueryClientProvider>,
  );
  return client;
}
function fillRegistration(confirmation = password) {
  fireEvent.click(screen.getByRole('button', { name: 'Créer un compte', exact: true }));
  fireEvent.change(screen.getByLabelText('Prénom ou nom'), { target: { value: ' Camille ' } });
  fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
    target: { value: 'CAMILLE@test.invalid' },
  });
  fireEvent.change(screen.getByLabelText('Mot de passe', { exact: true }), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
    target: { value: confirmation },
  });
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.clearAllMocks();
  vi.mocked(api).mockReset();
});

describe('inscription depuis le site', () => {
  it('propose de créer un compte et permet de revenir à la connexion', () => {
    renderAuth();
    fillRegistration();
    expect(screen.getByRole('heading', { name: 'Créez votre espace de révision.' })).toBeVisible();
    expect(screen.getByLabelText('Prénom ou nom')).toHaveFocus();
    expect(screen.getByLabelText('Mot de passe', { exact: true })).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter', exact: true }));
    expect(screen.getByRole('heading', { name: 'Heureux de vous retrouver.' })).toBeVisible();
    expect(screen.queryByLabelText('Confirmer le mot de passe')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('CAMILLE@test.invalid');
    expect(screen.getByLabelText('Mot de passe', { exact: true })).toHaveValue('');
    expect(api).not.toHaveBeenCalled();
  });

  it('refuse des mots de passe différents sans envoyer de requête', async () => {
    renderAuth();
    fillRegistration('Une confirmation différente');
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Les mots de passe ne correspondent pas.',
    );
    expect(api).not.toHaveBeenCalled();
  });

  it('valide aussi la longueur du mot de passe avant l’envoi', async () => {
    renderAuth();
    fillRegistration();
    fireEvent.change(screen.getByLabelText('Mot de passe', { exact: true }), {
      target: { value: 'court' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Créer mon compte' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('12 caractères');
    expect(api).not.toHaveBeenCalled();
  });

  it('inscrit immédiatement, configure la session et retire les données de l’ancien compte', async () => {
    vi.mocked(api).mockResolvedValue(account);
    const client = renderAuth();
    client.setQueryData(['dashboard'], { subjects: [{ name: 'Données de l’ancien compte' }] });
    const refresh = vi.spyOn(client, 'invalidateQueries');
    fillRegistration();
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    await waitFor(() => expect(setCsrf).toHaveBeenCalledWith(account.csrf));
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      body: { name: 'Camille', email: 'camille@test.invalid', password },
    });
    expect(refresh).toHaveBeenCalledWith({ queryKey: ['me'] });
    expect(client.getQueryData(['dashboard'])).toBeUndefined();
  });

  it('affiche une adresse déjà utilisée et conserve les informations du formulaire', async () => {
    vi.mocked(api).mockRejectedValue(
      new ApiError('Cette adresse e-mail est déjà utilisée.', 409, 'HTTP_409'),
    );
    renderAuth();
    fillRegistration();
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('déjà utilisée');
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('CAMILLE@test.invalid');
    expect(setCsrf).not.toHaveBeenCalled();
  });

  it('conserve la connexion des comptes existants', async () => {
    vi.mocked(api).mockResolvedValue(account);
    renderAuth();
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: account.email } });
    fireEvent.change(screen.getByLabelText('Mot de passe', { exact: true }), {
      target: { value: password },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter', exact: true }));
    await waitFor(() => expect(setCsrf).toHaveBeenCalledWith(account.csrf));
    expect(api).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { email: account.email, password },
    });
  });
});
