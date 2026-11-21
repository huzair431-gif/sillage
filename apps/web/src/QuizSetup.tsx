import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Brain, ClipboardCheck, Timer } from 'lucide-react';
import {
  modeLabels,
  QUESTION_TIME_LIMIT_SECONDS,
  type Mode,
  type QuizSession,
  type Subject,
} from '@sillage/shared';
import { api } from './api';
import { Button, Dialog, Field } from './ui';
export function QuizSetup({
  open,
  onOpenChange,
  subjectId,
  chapterId,
  initialMode = 'REVISION',
  subjects = [],
  available,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subjectId?: string;
  chapterId?: string;
  initialMode?: Mode;
  subjects?: Subject[];
  available?: number;
}) {
  const [mode, setMode] = useState<Mode>(initialMode),
    [count, setCount] = useState<number | 'all'>(20),
    [timer, setTimer] = useState(false),
    [minutes, setMinutes] = useState(30),
    [scope, setScope] = useState(subjectId ?? subjects[0]?.id ?? '');
  const navigate = useNavigate();
  const start = useMutation({
    mutationFn: () =>
      api<QuizSession>('/quiz/sessions', {
        method: 'POST',
        body: {
          ...(chapterId ? { chapterId } : { subjectId: scope }),
          mode,
          count,
          ...(mode === 'EXAM' && timer ? { timeLimitMinutes: minutes } : {}),
        },
      }),
    onSuccess: (s) => navigate(`/quiz/${s.id}`),
  });
  const modes = [
    {
      id: 'DISCOVERY' as const,
      icon: BookOpen,
      description: 'Rencontrer de nouvelles questions, à votre rythme.',
    },
    {
      id: 'REVISION' as const,
      icon: Brain,
      description: 'Retrouver les connaissances qui ont besoin de vous.',
    },
    {
      id: 'EXAM' as const,
      icon: ClipboardCheck,
      description: 'Vous évaluer, avec les corrections à la fin.',
    },
  ];
  return (
    <Dialog
      {...{ open, onOpenChange }}
      title="Un moment pour apprendre"
      description="Choisissez votre intention. Sillage prépare la suite."
    >
      <div className="quiz-setup">
        {!chapterId && subjects.length > 1 && (
          <Field label="Matière">
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="mode-options">
          {modes.map((m) => (
            <button
              type="button"
              key={m.id}
              aria-pressed={mode === m.id}
              className={mode === m.id ? 'selected' : ''}
              onClick={() => setMode(m.id)}
            >
              <span className="mode-icon">
                <m.icon size={21} />
              </span>
              <span>
                <strong>{modeLabels[m.id]}</strong>
                <small>{m.description}</small>
              </span>
              <span className="radio-mark" />
            </button>
          ))}
        </div>
        <Field label="Nombre de questions">
          <div className="segmented">
            {[10, 20, 'all'].map((n) => (
              <button
                type="button"
                key={n}
                aria-pressed={count === n}
                onClick={() => setCount(n as number | 'all')}
              >
                {n === 'all' ? 'Toutes' : n}
              </button>
            ))}
          </div>
        </Field>
        <div className="question-time-info">
          <Timer size={20} aria-hidden="true" />
          <div>
            <strong>{QUESTION_TIME_LIMIT_SECONDS} secondes par question</strong>
            <p>
              Votre sélection est validée automatiquement à la fin du temps. Sans réponse, la
              question compte comme une erreur.
            </p>
          </div>
        </div>
        {mode === 'EXAM' && (
          <>
            <Field label="Nombre personnalisé">
              <input
                type="number"
                min={1}
                max={5000}
                value={count === 'all' ? '' : count}
                placeholder="Toutes les questions"
                onChange={(e) =>
                  setCount(e.target.value ? Math.max(1, Number(e.target.value)) : 'all')
                }
              />
            </Field>
            <label className="checkbox-label">
              <input type="checkbox" checked={timer} onChange={(e) => setTimer(e.target.checked)} />
              <Timer size={17} />
              Ajouter une durée totale à l’examen
            </label>
            {timer && (
              <Field label="Durée en minutes">
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </Field>
            )}
          </>
        )}
        {available !== undefined && (
          <small className="muted">
            {available} question{available > 1 ? 's' : ''} disponible{available > 1 ? 's' : ''}. La
            session s’adapte à votre bibliothèque.
          </small>
        )}
        <Button
          className="full-width"
          loading={start.isPending}
          disabled={(!scope && !chapterId) || available === 0}
          onClick={() => start.mutate()}
        >
          Commencer la session
        </Button>
      </div>
    </Dialog>
  );
}
