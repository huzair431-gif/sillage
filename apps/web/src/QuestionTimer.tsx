import { useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { QUESTION_TIME_LIMIT_SECONDS } from '@sillage/shared';

const limitMs = QUESTION_TIME_LIMIT_SECONDS * 1000;

function readRemaining(storageKey: string) {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return limitMs;
    const { remainingMs, deadlineAt } = saved as Record<string, unknown>;
    const value = typeof deadlineAt === 'number' ? deadlineAt - Date.now() : remainingMs;
    if (typeof value === 'number' && Number.isFinite(value))
      return Math.max(0, Math.min(limitMs, value));
  } catch {
    // Le chronomètre fonctionne aussi si le stockage de l’onglet est indisponible.
  }
  return limitMs;
}

function saveTime(storageKey: string, time: { remainingMs: number; deadlineAt?: number }) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(time));
  } catch {
    // Une erreur de stockage ne doit pas empêcher la réponse d’être enregistrée.
  }
}

export function QuestionTimer({
  storageKey,
  running,
  answered,
  onExpire,
}: {
  storageKey: string;
  running: boolean;
  answered: boolean;
  onExpire: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() => readRemaining(storageKey));
  const remaining = useRef(remainingMs);
  const expired = useRef(false);
  const expire = useRef(onExpire);

  useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (answered) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    if (!running) return;
    const deadlineAt = Date.now() + remaining.current;
    saveTime(storageKey, { remainingMs: remaining.current, deadlineAt });
    const tick = () => {
      remaining.current = Math.max(0, Math.min(limitMs, deadlineAt - Date.now()));
      setRemainingMs(remaining.current);
      if (remaining.current === 0 && !expired.current) {
        expired.current = true;
        expire.current();
      }
    };
    const interval = setInterval(tick, 100);
    tick();
    return () => {
      clearInterval(interval);
      remaining.current = Math.max(0, Math.min(limitMs, deadlineAt - Date.now()));
      saveTime(storageKey, { remainingMs: remaining.current });
    };
  }, [storageKey, running, answered]);

  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <span
      className={`question-timer ${seconds <= 3 ? 'is-urgent' : ''}`}
      role="timer"
      aria-label="Temps restant pour cette question"
      aria-live="off"
    >
      <Clock3 size={17} aria-hidden="true" />
      <strong>0:{String(seconds).padStart(2, '0')}</strong>
      <span className="question-timer-label">par question</span>
    </span>
  );
}
