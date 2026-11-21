import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, EyeOff } from 'lucide-react';
import { registrationSchema } from '@sillage/shared';
import { api, setCsrf, type User } from './api';
import { Button, Field, Logo } from './ui';
import { MemoryArt } from './BrandArt';

export function AuthPage() {
  const qc = useQueryClient();
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const auth = useMutation({
    mutationFn: () => {
      if (registering) {
        const result = registrationSchema.safeParse({ name, email, password });
        if (!result.success)
          throw new Error(result.error.issues[0]?.message ?? 'Vérifiez les informations saisies.');
        if (password !== confirmation) throw new Error('Les mots de passe ne correspondent pas.');
        return api<Pick<User, 'id' | 'name' | 'email' | 'csrf'>>('/auth/register', {
          method: 'POST',
          body: result.data,
        });
      }
      return api<Pick<User, 'id' | 'name' | 'email' | 'csrf'>>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
    },
    onSuccess: async (user) => {
      await qc.cancelQueries();
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
      setCsrf(user.csrf);
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const switchMode = () => {
    if (auth.isPending) return;
    auth.reset();
    setRegistering((value) => !value);
    setPassword('');
    setConfirmation('');
    setVisible(false);
  };
  return (
    <main className="login-layout">
      <div className="login-story">
        <Logo />
        <div>
          <span className="eyebrow">APPRENDRE POUR LONGTEMPS</span>
          <h1>
            Ce que vous apprenez
            <br />
            mérite de rester.
          </h1>
          <p>
            Un espace calme pour réviser, comprendre vos erreurs et ancrer vos connaissances, un
            jour après l’autre.
          </p>
          <div className="login-pillars">
            Rappel actif <span>·</span> Répétition espacée <span>·</span> Progrès durables
          </div>
        </div>
        <small>Un peu aujourd’hui. Longtemps en mémoire.</small>
        <MemoryArt />
      </div>
      <div className="login-form">
        <div className="login-mobile-brand">
          <Logo />
        </div>
        <span className="eyebrow">VOTRE ESPACE PERSONNEL</span>
        <h2>{registering ? 'Créez votre espace de révision.' : 'Heureux de vous retrouver.'}</h2>
        <p>
          {registering
            ? 'Votre compte est prêt dès l’inscription. Commencez à apprendre.'
            : 'Reconnectez-vous à votre apprentissage.'}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!auth.isPending) auth.mutate();
          }}
        >
          {registering && (
            <Field label="Prénom ou nom">
              <input
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                disabled={auth.isPending}
                required
                autoFocus
              />
            </Field>
          )}
          <Field label="Adresse e-mail">
            <input
              type="email"
              autoComplete={registering ? 'email' : 'username'}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              disabled={auth.isPending}
              required
              placeholder="vous@exemple.fr"
            />
          </Field>
          <Field label="Mot de passe" hint={registering ? '12 caractères minimum.' : undefined}>
            <div className="password-field">
              <input
                type={visible ? 'text' : 'password'}
                autoComplete={registering ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={registering ? 12 : 1}
                maxLength={1024}
                disabled={auth.isPending}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </Button>
            </div>
          </Field>
          {registering && (
            <Field label="Confirmer le mot de passe">
              <input
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                minLength={12}
                maxLength={1024}
                disabled={auth.isPending}
                required
              />
            </Field>
          )}
          {auth.isError && (
            <p role="alert" className="field-error">
              {auth.error.message}
            </p>
          )}
          <Button type="submit" loading={auth.isPending} className="full-width">
            {registering ? 'Créer mon compte' : 'Se connecter'}
          </Button>
        </form>
        <div className="auth-switch">
          <span>{registering ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?'}</span>
          <Button
            type="button"
            variant="ghost"
            size="small"
            disabled={auth.isPending}
            onClick={switchMode}
          >
            {registering ? 'Se connecter' : 'Créer un compte'}
          </Button>
        </div>
        <div className="private-note">
          <span className="private-symbol">
            <Check size={14} />
          </span>
          Un espace privé. Vos connaissances vous appartiennent.
        </div>
      </div>
    </main>
  );
}
