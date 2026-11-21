import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Check,
  Download,
  KeyRound,
  Moon,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
  Upload,
} from 'lucide-react';
import type { Preferences, SessionSummary } from '@sillage/shared';
import { toast } from 'sonner';
import { api, type Overview } from './api';
import { useRefresh, useUser } from './context';
import {
  Badge,
  Button,
  Dialog,
  Empty,
  ErrorState,
  Field,
  Loading,
  Metric,
  PageHeader,
  Progress,
  SubjectIcon,
} from './ui';
import { SessionList, StateDistribution } from './LibraryPages';
export function Statistics() {
  const q = useQuery({
    queryKey: ['statistics'],
    queryFn: () =>
      api<Overview & { activity: { day: string; answers: number; correct: number }[] }>(
        '/statistics',
      ),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const totalAnswers = d.activity.reduce((n, a) => n + a.answers, 0);
  const good = d.activity.reduce((n, a) => n + a.correct, 0);
  const days = Array.from({ length: 28 }, (_, i) => {
    const date = new Date(`${d.today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 27 + i);
    const day = date.toISOString().slice(0, 10);
    const a = d.activity.find((a) => a.day === day);
    return { day, answers: a?.answers ?? 0, correct: a?.correct ?? 0 };
  });
  const max = Math.max(1, ...days.map((a) => a.answers));
  return (
    <>
      <PageHeader
        eyebrow="CE QUI S’ANCRE DANS LE TEMPS"
        title="Ma progression"
        description="Des repères honnêtes pour voir ce qui se construit."
      />
      <div className="metrics-row">
        <Metric
          label="Maîtrise durable"
          value={d.stats.seen ? `${d.stats.mastery} %` : '—'}
          detail={`${d.stats.mastered} questions consolidées sur plusieurs jours`}
        />
        <Metric
          label="Couverture"
          value={d.stats.total ? `${d.stats.coverage} %` : '—'}
          detail={`${d.stats.seen} questions rencontrées sur ${d.stats.total}`}
        />
        <Metric
          label="À revoir aujourd’hui"
          value={d.stats.due}
          detail="Les retards restent prioritaires"
        />
        <Metric
          label="Réussite sur 28 jours"
          value={totalAnswers ? `${Math.round((good / totalAnswers) * 100)} %` : '—'}
          detail={`${totalAnswers} premières réponses évaluées`}
        />
      </div>
      <div className="statistics-grid">
        <StateDistribution stats={d.stats} />
        <section className="activity-panel">
          <div className="section-heading">
            <div>
              <h3>La régularité, au fil des jours</h3>
              <p>28 derniers jours · séances terminées</p>
            </div>
          </div>
          <div
            className="activity-chart"
            role="img"
            aria-label={`${totalAnswers} réponses évaluées sur les 28 derniers jours.`}
          >
            {days.map((a) => (
              <div
                key={a.day}
                className="activity-column"
                title={`${a.day} : ${a.answers} réponses, ${a.correct} correctes`}
              >
                <div
                  style={{ height: `${a.answers ? Math.max(3, (a.answers / max) * 100) : 2}%` }}
                  className={a.answers ? 'active' : ''}
                />
              </div>
            ))}
          </div>
          <div className="chart-labels">
            <span>
              {new Date(`${days[0]!.day}T12:00Z`).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
            <span>Aujourd’hui</span>
          </div>
          <details className="chart-data">
            <summary>Consulter les données</summary>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Réponses</th>
                  <th>Réussites</th>
                </tr>
              </thead>
              <tbody>
                {days.map((a) => (
                  <tr key={a.day}>
                    <td>{a.day}</td>
                    <td>{a.answers}</td>
                    <td>{a.correct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </div>
      <section>
        <div className="section-heading">
          <div>
            <h2>Matière après matière</h2>
            <p>Une progression pondérée par le nombre réel de questions.</p>
          </div>
        </div>
        {d.subjects.length ? (
          <div className="subject-progress-list">
            {d.subjects.map((s) => (
              <Link key={s.id} to={`/subjects/${s.id}`}>
                <SubjectIcon color={s.color} />
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {s.stats.seen} / {s.stats.total} questions rencontrées
                  </small>
                </div>
                <div className="progress-column">
                  <span>
                    {s.stats.seen ? `${s.stats.mastery} % de maîtrise` : 'Pas encore évaluée'}
                  </span>
                  <Progress value={s.stats.mastery} />
                </div>
                <Badge tone={s.stats.due ? 'amber' : 'neutral'}>{s.stats.due} à revoir</Badge>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="Vos repères apparaîtront ici"
            description="Vos premières sessions donneront forme à votre progression."
          />
        )}
      </section>
      {d.notions.length > 0 && (
        <section className="notions-section">
          <div className="section-heading">
            <div>
              <h2>Les notions à consolider</h2>
              <p>Les fragilités récentes vous aident à choisir votre prochaine révision.</p>
            </div>
          </div>
          <div className="notion-grid">
            {d.notions.slice(0, 30).map((n) => (
              <div key={n.name}>
                <strong>{n.name}</strong>
                <span>
                  {n.stats.total} question{n.stats.total > 1 ? 's' : ''}
                </span>
                <Badge
                  tone={
                    n.stats.fragile
                      ? 'amber'
                      : n.stats.mastered === n.stats.total
                        ? 'sage'
                        : 'neutral'
                  }
                >
                  {n.stats.fragile
                    ? `${n.stats.fragile} fragile${n.stats.fragile > 1 ? 's' : ''}`
                    : n.stats.mastered === n.stats.total
                      ? 'Maîtrisée'
                      : n.stats.seen
                        ? 'En consolidation'
                        : 'À découvrir'}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
export function HistoryPage() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['history', page],
    queryFn: () =>
      api<{ items: SessionSummary[]; total: number }>(`/sessions?page=${page}&limit=20`),
  });
  return (
    <>
      <PageHeader
        eyebrow="CHAQUE SESSION LAISSE UNE TRACE"
        title="Mes sessions"
        description="Retrouvez vos bilans, vos corrections et vos sessions en pause."
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <SessionList items={q.data.items} />
          {q.data.total > 20 && (
            <div className="pagination">
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </Button>
              <span>
                Page {page} sur {Math.ceil(q.data.total / 20)}
              </span>
              <Button
                variant="secondary"
                disabled={page * 20 >= q.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
export function SettingsPage() {
  const user = useUser();
  const [p, setP] = useState<Preferences>({ ...user.preferences }),
    [currentPassword, setCurrentPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [confirmPassword, setConfirmPassword] = useState(''),
    [restore, setRestore] = useState<{
      data: unknown;
      token: string;
      subjects: number;
      chapters: number;
      questions: number;
      sessions: number;
    } | null>(null),
    [phrase, setPhrase] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const refresh = useRefresh();
  const save = useMutation({
    mutationFn: () => api('/preferences', { method: 'PATCH', body: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      refresh();
      toast.success('Vos préférences sont enregistrées.');
    },
  });
  const password = useMutation({
    mutationFn: () =>
      api('/auth/password', { method: 'PATCH', body: { currentPassword, newPassword } }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Mot de passe mis à jour. Les autres connexions ont été fermées.');
    },
  });
  const exportData = useMutation({
    mutationFn: () => api<unknown>('/backups/export'),
    onSuccess: (data) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `sillage-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Votre export est prêt.');
    },
  });
  const validateRestore = useMutation({
    mutationFn: async (f: File) => {
      if (f.size > 30000000) throw new Error('Le fichier doit faire moins de 30 Mo.');
      let data: unknown;
      try {
        data = JSON.parse(await f.text());
      } catch {
        throw new Error('Ce fichier n’est pas une sauvegarde JSON valide.');
      }
      const summary = await api<{
        token: string;
        subjects: number;
        chapters: number;
        questions: number;
        sessions: number;
      }>('/backups/validate', { method: 'POST', body: data });
      return { ...summary, data };
    },
    onSuccess: (d) => {
      setRestore(d);
      setPhrase('');
    },
  });
  const doRestore = useMutation({
    mutationFn: () =>
      api('/backups/restore', {
        method: 'POST',
        body: { data: restore!.data, token: restore!.token, confirmation: phrase },
      }),
    onSuccess: () => {
      setRestore(null);
      qc.invalidateQueries();
      toast.success('Votre sauvegarde a été restaurée.');
    },
  });
  return (
    <>
      <PageHeader
        eyebrow="UN ESPACE QUI VOUS RESSEMBLE"
        title="Paramètres"
        description="Ajustez le confort de vos prochaines révisions."
      />
      <div className="settings-layout">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="settings-section"
        >
          <div className="settings-section-heading">
            <Settings size={20} />
            <div>
              <h2>Votre confort de révision</h2>
              <p>Des préférences conservées dans votre compte.</p>
            </div>
          </div>
          <Field label="Apparence">
            <div className="theme-picker">
              {[
                { key: 'light', label: 'Clair', icon: Sun },
                { key: 'dark', label: 'Sombre', icon: Moon },
                { key: 'system', label: 'Système', icon: Settings },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={p.theme === t.key}
                  onClick={() => setP({ ...p, theme: t.key as Preferences['theme'] })}
                >
                  <t.icon size={20} />
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
          <SettingToggle
            label="Rappel actif"
            detail="Retrouvez mentalement la réponse avant d’afficher les propositions, hors examen."
            checked={p.activeRecallEnabled}
            onChange={(v) => setP({ ...p, activeRecallEnabled: v })}
          />
          <SettingToggle
            label="Passage automatique"
            detail="Après une bonne réponse, passez doucement à la question suivante."
            checked={p.autoAdvanceEnabled}
            onChange={(v) => setP({ ...p, autoAdvanceEnabled: v })}
          />
          <SettingToggle
            label="Réduire les animations"
            detail="Limitez les mouvements. La préférence de votre appareil est aussi respectée."
            checked={p.reducedMotion}
            onChange={(v) => setP({ ...p, reducedMotion: v })}
          />
          <Field
            label="Fuseau horaire"
            hint="Les révisions suivent vos jours calendaires, y compris lors des changements d’heure."
          >
            <select value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })}>
              {[...new Set([p.timezone, ...Intl.supportedValuesOf('timeZone')])].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <div className="settings-save">
            <Button loading={save.isPending}>
              <Check size={17} />
              Enregistrer mes préférences
            </Button>
          </div>
        </form>
        <section className="settings-section">
          <div className="settings-section-heading">
            <ShieldCheck size={21} />
            <div>
              <h2>Vos données, entre vos mains</h2>
              <p>Les questions, les historiques et les états de mémorisation sont inclus.</p>
            </div>
          </div>
          <div className="data-action">
            <div>
              <h3>Exporter mon espace</h3>
              <p>Téléchargez une sauvegarde versionnée, sans votre mot de passe.</p>
            </div>
            <Button
              variant="secondary"
              loading={exportData.isPending}
              onClick={() => exportData.mutate()}
            >
              <Download size={17} />
              Exporter mes données
            </Button>
          </div>
          <div className="data-action">
            <div>
              <h3>Restaurer une sauvegarde</h3>
              <p>
                Le fichier sera vérifié avant toute modification. La restauration remplace votre
                espace actuel.
              </p>
            </div>
            <input
              ref={file}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) validateRestore.mutate(f);
                e.target.value = '';
              }}
            />
            <Button
              variant="secondary"
              loading={validateRestore.isPending}
              onClick={() => file.current?.click()}
            >
              <Upload size={17} />
              Choisir une sauvegarde
            </Button>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-heading">
            <KeyRound size={21} />
            <div>
              <h2>Votre compte</h2>
              <p>
                {user.name} · {user.email}
              </p>
            </div>
          </div>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (newPassword !== confirmPassword) {
                toast.error('Les deux nouveaux mots de passe ne correspondent pas.');
                return;
              }
              password.mutate();
            }}
          >
            <Field label="Mot de passe actuel">
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                required
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <div className="form-row">
              <Field label="Nouveau mot de passe" hint="Au moins 12 caractères.">
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </Field>
              <Field label="Confirmer le nouveau mot de passe">
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </Field>
            </div>
            <div>
              <Button variant="secondary" loading={password.isPending}>
                Modifier le mot de passe
              </Button>
            </div>
          </form>
        </section>
      </div>
      <Dialog
        open={Boolean(restore)}
        onOpenChange={(v) => {
          if (!v && !doRestore.isPending) setRestore(null);
        }}
        title="Remplacer votre espace par cette sauvegarde ?"
        description="La restauration est transactionnelle. Votre compte et votre mot de passe sont conservés ; vos matières, questions, sessions et préférences seront remplacées."
      >
        {restore && (
          <>
            <div className="restore-summary">
              <span>{restore.subjects} matières</span>
              <span>{restore.chapters} chapitres</span>
              <span>{restore.questions} questions</span>
              <span>{restore.sessions} sessions</span>
            </div>
            <Field label="Saisissez REMPLACER MES DONNÉES pour confirmer">
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <div className="dialog-actions">
              <Button
                variant="secondary"
                disabled={doRestore.isPending}
                onClick={() => setRestore(null)}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                disabled={phrase !== 'REMPLACER MES DONNÉES'}
                loading={doRestore.isPending}
                onClick={() => doRestore.mutate()}
              >
                Restaurer et remplacer
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
function SettingToggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="setting-toggle">
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
