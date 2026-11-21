import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  Flag,
  Pause,
  RotateCcw,
  Sparkles,
  X,
  AlertCircle,
} from 'lucide-react';
import { modeLabels, type Feedback, type QuizItem, type QuizSession } from '@sillage/shared';
import { ApiError, api, duration } from './api';
import { useRefresh, useUser } from './context';
import {
  Badge,
  Button,
  Confirm,
  Dialog,
  Empty,
  ErrorState,
  Loading,
  Logo,
  Metric,
  Progress,
} from './ui';
import { Markdown } from './Markdown';
import { QuizSetup } from './QuizSetup';
import { QuestionTimer } from './QuestionTimer';
import { QuestionImage } from './QuestionImage';
interface AnswerPayload {
  sessionQuestionId: string;
  selectedOptionIds: string[];
  isGuessed: boolean;
  timedOut?: boolean;
  idempotencyKey: string;
}
export default function QuizPage() {
  const { id } = useParams();
  const user = useUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const refresh = useRefresh();
  const storageKey = `sillage-pending:${user.id}:${id}`;
  const [activeId, setActiveId] = useState<string | undefined>(),
    [selected, setSelected] = useState<string[]>([]),
    [guessed, setGuessed] = useState(false),
    [revealed, setRevealed] = useState(!user.preferences.activeRecallEnabled),
    [stop, setStop] = useState(false),
    [imageOpen, setImageOpen] = useState(false),
    [now, setNow] = useState(Date.now());
  const pending = useRef<AnswerPayload | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryStarted = useRef(false);
  const q = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => api<QuizSession>(`/quiz/sessions/${id}`),
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const put = (s: QuizSession) => {
    qc.setQueryData(['quiz', id], s);
    refresh();
  };
  const next = (s = q.data) => {
    if (!s) return;
    setActiveId(s.questions.find((x) => !x.answered)?.id ?? 'end');
    setSelected([]);
    setGuessed(false);
    setImageOpen(false);
    setRevealed(!user.preferences.activeRecallEnabled || s.mode === 'EXAM');
  };
  const answer = useMutation({
    mutationFn: (body: AnswerPayload) =>
      api<QuizSession>(`/quiz/sessions/${id}/answers`, { method: 'POST', body }),
    onSuccess: (s) => {
      pending.current = null;
      sessionStorage.removeItem(storageKey);
      put(s);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'EXAM_EXPIRED') {
        pending.current = null;
        sessionStorage.removeItem(storageKey);
        q.refetch();
      } else if (!(e instanceof ApiError && (e.status === 0 || e.status >= 500))) {
        pending.current = null;
        sessionStorage.removeItem(storageKey);
      }
    },
  });
  const finish = useMutation({
    mutationFn: () => api<QuizSession>(`/quiz/sessions/${id}/finish`, { method: 'POST' }),
    onSuccess: (s) => {
      put(s);
      setStop(false);
      pending.current = null;
      sessionStorage.removeItem(storageKey);
    },
    onError: () => {
      expiryStarted.current = false;
    },
  });
  const ack = useMutation({
    mutationFn: (itemId: string) =>
      api<QuizSession>(`/quiz/sessions/${id}/corrections/${itemId}/ack`, { method: 'POST' }),
    onSuccess: (s) => {
      put(s);
      next(s);
    },
  });
  const data = q.data;
  const item = data?.questions.find((x) => x.id === activeId);
  const correction =
    data?.mode !== 'EXAM'
      ? data?.questions.find((x) => x.feedback && !x.feedback.isCorrect && !x.feedback.acknowledged)
      : undefined;
  useEffect(() => {
    if (!data || activeId !== undefined) return;
    let restored: AnswerPayload | null = null;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) restored = JSON.parse(raw) as AnswerPayload;
    } catch {
      sessionStorage.removeItem(storageKey);
    }
    const savedItem = restored
      ? data.questions.find((x) => x.id === restored!.sessionQuestionId)
      : undefined;
    if (savedItem && restored && !savedItem.answered) {
      pending.current = restored;
      setSelected(restored.selectedOptionIds);
      setGuessed(restored.isGuessed);
      setActiveId(correction?.id ?? savedItem.id);
    } else {
      pending.current = null;
      sessionStorage.removeItem(storageKey);
      setActiveId(
        correction?.id ??
          (savedItem?.answered
            ? savedItem.id
            : (data.questions.find((x) => !x.answered)?.id ?? 'end')),
      );
    }
    setRevealed(!user.preferences.activeRecallEnabled || data.mode === 'EXAM' || Boolean(restored));
  }, [data, activeId, correction, storageKey, user.preferences.activeRecallEnabled]);
  useEffect(() => {
    if (
      item?.answered &&
      !correction &&
      !imageOpen &&
      data?.status === 'ACTIVE' &&
      (data.mode === 'EXAM' || user.preferences.autoAdvanceEnabled)
    ) {
      autoTimer.current = setTimeout(() => next(), data.mode === 'EXAM' ? 280 : 800);
      return () => {
        if (autoTimer.current) clearTimeout(autoTimer.current);
      };
    }
  }, [
    item?.id,
    item?.answered,
    correction?.id,
    data?.status,
    user.preferences.autoAdvanceEnabled,
    imageOpen,
  ]);
  useEffect(() => {
    if (!data?.deadlineAt || data.status !== 'ACTIVE') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data?.deadlineAt, data?.status]);
  const seconds = data?.deadlineAt
    ? Math.max(0, Math.ceil((new Date(data.deadlineAt).getTime() - now) / 1000))
    : null;
  useEffect(() => {
    if (seconds === 0 && data?.status === 'ACTIVE' && !finish.isPending && !expiryStarted.current) {
      expiryStarted.current = true;
      finish.mutate();
    }
  }, [seconds, data?.status, finish.isPending]);
  const choose = (optionId: string) => {
    if (!item || item.answered || answer.isPending || pending.current) return;
    setSelected((old) =>
      item.type === 'MULTIPLE'
        ? old.includes(optionId)
          ? old.filter((x) => x !== optionId)
          : [...old, optionId]
        : [optionId],
    );
  };
  const submit = (timedOut = false) => {
    if (
      !item ||
      item.answered ||
      answer.isPending ||
      pending.current ||
      (!selected.length && !timedOut) ||
      correction ||
      finish.isPending ||
      imageOpen ||
      stop
    )
      return;
    const payload: AnswerPayload = {
      sessionQuestionId: item.id,
      selectedOptionIds: selected,
      isGuessed: guessed,
      timedOut,
      idempotencyKey: crypto.randomUUID(),
    };
    pending.current = payload;
    sessionStorage.setItem(storageKey, JSON.stringify(payload));
    answer.mutate(payload);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        document.querySelector('[role="dialog"]') ||
        (e.target instanceof HTMLElement &&
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) ||
        !revealed
      )
        return;
      if (/^[1-9]$/.test(e.key)) {
        const option = item?.options[Number(e.key) - 1];
        if (option) {
          e.preventDefault();
          choose(option.id);
        }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (item?.answered) next();
        else submit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    item,
    selected,
    guessed,
    revealed,
    answer.isPending,
    correction,
    finish.isPending,
    stop,
    imageOpen,
  ]);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!data) return null;
  if (data.status === 'COMPLETED') return <Results session={data} />;
  const answered = data.questions.filter((q) => q.answered && !q.isReinforcement).length;
  const initialPosition =
    item && !item.isReinforcement
      ? data.questions.filter((q) => !q.isReinforcement).findIndex((q) => q.id === item.id) + 1
      : answered;
  const exit = data.chapterId ? `/chapters/${data.chapterId}` : `/subjects/${data.subjectId}`;
  return (
    <div className="quiz-layout">
      <header className="focus-header">
        <Link to="/" aria-label="Accueil Sillage">
          <Logo />
        </Link>
        <div className="quiz-header-context">
          <strong>{data.subjectName}</strong>
          <span>{data.chapterTitle ?? modeLabels[data.mode]}</span>
        </div>
        <div className="quiz-header-right">
          {item && (
            <QuestionTimer
              key={item.id}
              storageKey={`sillage-question-time:${user.id}:${id}:${item.id}`}
              running={
                data.status === 'ACTIVE' &&
                !item.answered &&
                !correction &&
                !stop &&
                !imageOpen &&
                !answer.isPending &&
                !pending.current &&
                !finish.isPending
              }
              answered={item.answered}
              onExpire={() => submit(true)}
            />
          )}
          {seconds !== null && (
            <span
              className={`exam-timer ${seconds < 60 ? 'text-danger' : ''}`}
              aria-live={seconds < 10 ? 'polite' : 'off'}
            >
              <Clock3 size={16} />
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </span>
          )}
          <Button
            variant="ghost"
            size="small"
            aria-label="Mettre en pause"
            onClick={() => navigate(exit)}
          >
            <Pause size={16} />
            <span>Mettre en pause</span>
          </Button>
        </div>
      </header>
      <div className="quiz-progress">
        <Progress value={(answered / data.total) * 100} label="Questions initiales enregistrées" />
      </div>
      <main className="quiz-main">
        {item ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
            >
              <div className="quiz-question-top" tabIndex={-1} data-dialog-return-focus>
                <span className="eyebrow">
                  {item.isReinforcement
                    ? 'RENFORCEMENT'
                    : `QUESTION ${initialPosition} SUR ${data.total}`}
                </span>
                <Badge tone={item.isReinforcement ? 'amber' : 'neutral'}>
                  {item.isReinforcement ? 'Un nouveau rappel' : modeLabels[data.mode]}
                </Badge>
              </div>
              {item.notion && <div className="quiz-notion">{item.notion}</div>}
              <Markdown className="quiz-statement">{item.statement}</Markdown>
              <QuestionImage image={item.image} onOpenChange={setImageOpen} />
              {item.type === 'MULTIPLE' && revealed && (
                <p className="question-hint">Plusieurs réponses sont attendues.</p>
              )}
              {!revealed && data.mode !== 'EXAM' ? (
                <div className="active-recall">
                  <Brain size={24} />
                  <h3>Prenez un instant pour retrouver la réponse.</h3>
                  <p>Formulez-la mentalement avant de voir les propositions.</p>
                  <Button variant="secondary" onClick={() => setRevealed(true)}>
                    <Eye size={17} />
                    Voir les réponses
                  </Button>
                </div>
              ) : (
                <div className="quiz-options">
                  {item.options.map((o, index) => {
                    const checked = item.answered
                      ? item.selectedOptionIds.includes(o.id)
                      : selected.includes(o.id);
                    const feedback = item.feedback;
                    const correct = feedback?.correctOptionIds.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={checked}
                        className={`quiz-option ${checked ? 'selected' : ''} ${item.answered && feedback ? (correct ? 'answer-correct' : checked ? 'answer-wrong' : '') : ''}`}
                        disabled={item.answered || answer.isPending || Boolean(pending.current)}
                        onClick={() => choose(o.id)}
                      >
                        <span className="option-letter">
                          {item.answered && feedback && correct ? (
                            <Check size={17} />
                          ) : (
                            String.fromCharCode(65 + index)
                          )}
                        </span>
                        <Markdown>{o.text}</Markdown>
                        <span
                          className={`option-indicator ${item.type === 'MULTIPLE' ? 'square' : ''}`}
                        >
                          {checked && <Check size={13} />}
                        </span>
                        <kbd>{index + 1}</kbd>
                      </button>
                    );
                  })}
                </div>
              )}
              {item.answered && !correction && (
                <div
                  className={`answer-notice ${item.feedback ? 'notice-success' : ''}`}
                  role="status"
                >
                  {item.feedback ? <CheckCircle2 size={18} /> : <Check size={18} />}
                  <span>
                    {item.feedback
                      ? item.feedback.isGuessed
                        ? 'Réponse correcte, à consolider.'
                        : 'Réponse correcte.'
                      : 'Réponse enregistrée. La correction sera disponible à la fin.'}
                  </span>
                </div>
              )}
              {pending.current && !item.answered && !answer.isPending && (
                <div className="save-error" role="alert">
                  <AlertCircle size={19} />
                  <div>
                    <strong>Votre réponse n’est pas encore confirmée.</strong>
                    <p>
                      {answer.error?.message ?? 'Une réponse attend la confirmation du serveur.'}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => answer.mutate(pending.current!)}
                    loading={answer.isPending}
                  >
                    Réessayer l’enregistrement
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="quiz-end">
            <span className="empty-icon">
              <CheckCircle2 size={28} />
            </span>
            <h1>Un pas de plus.</h1>
            <p>
              {data.mode === 'EXAM'
                ? 'Vos réponses sont prêtes. Terminez l’examen pour découvrir votre bilan.'
                : 'Votre session est prête à être clôturée. Retrouvez ce qui se consolide et ce qui mérite un prochain rappel.'}
            </p>
            <Button loading={finish.isPending} onClick={() => finish.mutate()}>
              Voir mon bilan
            </Button>
          </div>
        )}
      </main>
      {item && (
        <footer className="quiz-footer">
          <div>
            <div className="quiz-footer-left">
              {!item.answered && revealed && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={guessed}
                    disabled={answer.isPending || Boolean(pending.current)}
                    onChange={(e) => setGuessed(e.target.checked)}
                  />
                  J’ai deviné
                </label>
              )}
              <span className="keyboard-hint">
                1–9 pour choisir <span>·</span> Entrée pour valider
              </span>
            </div>
            <div className="quiz-footer-actions">
              <Button
                variant="ghost"
                size="small"
                aria-label="Terminer"
                onClick={() => setStop(true)}
              >
                <Flag size={16} />
                <span>Terminer</span>
              </Button>
              {item.answered ? (
                <Button disabled={Boolean(correction)} onClick={() => next()}>
                  {data.questions.some((q) => !q.answered) ? 'Continuer' : 'Terminer la session'}
                </Button>
              ) : (
                <Button
                  loading={answer.isPending}
                  disabled={!selected.length || !revealed || Boolean(correction)}
                  onClick={() => submit()}
                >
                  Valider ma réponse
                </Button>
              )}
            </div>
          </div>
        </footer>
      )}
      <Dialog
        open={Boolean(correction)}
        title={correction?.selectedOptionIds.length === 0 ? 'Temps écoulé' : 'Réponse incorrecte'}
        description="Prenez le temps de comprendre ce qui fera la différence au prochain rappel."
        mandatory
        wide
      >
        {correction?.feedback && (
          <>
            <Correction item={correction} feedback={correction.feedback} />
            <div className="dialog-actions">
              <Button loading={ack.isPending} onClick={() => ack.mutate(correction.id)}>
                J’ai compris, continuer
              </Button>
            </div>
          </>
        )}
      </Dialog>
      <Confirm
        open={stop}
        onOpenChange={setStop}
        title={data.mode === 'EXAM' ? 'Terminer cet examen ?' : 'Terminer cette session ?'}
        description={
          data.mode === 'EXAM'
            ? 'Les questions sans réponse seront comptées comme incorrectes. Les corrections seront ensuite accessibles.'
            : 'Les réponses déjà confirmées seront conservées. Le score portera sur les premières réponses évaluées.'
        }
        label="Terminer et voir le bilan"
        danger={false}
        onConfirm={() => finish.mutate()}
        loading={finish.isPending}
      />
    </div>
  );
}
function Correction({ item, feedback }: { item: QuizItem; feedback: Feedback }) {
  return (
    <div className="correction-content">
      <Markdown className="correction-statement">{item.statement}</Markdown>
      <QuestionImage image={item.image} />
      <div className="correction-options">
        {feedback.options
          .filter(
            (o) =>
              feedback.selectedOptionIds.includes(o.id) || feedback.correctOptionIds.includes(o.id),
          )
          .map((o) => {
            const correct = feedback.correctOptionIds.includes(o.id),
              selected = feedback.selectedOptionIds.includes(o.id);
            return (
              <div className={correct ? 'correction-correct' : 'correction-wrong'} key={o.id}>
                <span>{correct ? <Check size={17} /> : <X size={17} />}</span>
                <div>
                  <small>
                    {correct
                      ? selected
                        ? 'Bonne réponse sélectionnée'
                        : 'Bonne réponse à retrouver'
                      : 'Votre choix incorrect'}
                  </small>
                  <Markdown>{o.text}</Markdown>
                </div>
              </div>
            );
          })}
      </div>
      <div className="explanation-box">
        <span className="eyebrow">POUR COMPRENDRE ET RETENIR</span>
        <Markdown>{feedback.explanation}</Markdown>
      </div>
      <p className="correction-footnote">
        Cette connaissance reste prioritaire pour une prochaine révision.
      </p>
    </div>
  );
}
function Results({ session: s }: { session: QuizSession }) {
  const [setup, setSetup] = useState(false);
  const navigate = useNavigate();
  const repeat = useMutation({
    mutationFn: () =>
      api<QuizSession>('/quiz/sessions', {
        method: 'POST',
        body: {
          ...(s.chapterId ? { chapterId: s.chapterId } : { subjectId: s.subjectId }),
          mode: 'REVISION',
          count: 'all',
          onlyErrorsFrom: s.id,
        },
      }),
    onSuccess: (n) => navigate(`/quiz/${n.id}`),
  });
  return (
    <div className="results-layout">
      <header className="focus-header">
        <Link to="/" aria-label="Accueil Sillage">
          <Logo />
        </Link>
        <Button variant="ghost" asChild>
          <Link to={s.chapterId ? `/chapters/${s.chapterId}` : `/subjects/${s.subjectId}`}>
            Retour au {s.chapterId ? 'chapitre' : 'cours'}
          </Link>
        </Button>
      </header>
      <main className="results-main">
        <span className="eyebrow">DANS VOTRE SILLAGE</span>
        <h1>Ce que vous emportez.</h1>
        <p>
          {s.chapterTitle ?? s.subjectName} · {modeLabels[s.mode]}
        </p>
        <div className="result-score">
          <div
            className="score-ring"
            style={{ '--score': `${s.score ?? 0}%` } as React.CSSProperties}
          >
            <span>
              {s.score === null ? '—' : Math.round(s.score)}
              <small>{s.score === null ? '' : '%'}</small>
            </span>
          </div>
          <div>
            <h2>
              {s.score === null
                ? 'Une prochaine fois pour commencer.'
                : s.score === 100
                  ? 'Les idées sont au rendez-vous.'
                  : s.score >= 70
                    ? 'Les connaissances prennent forme.'
                    : 'Des repères pour la prochaine fois.'}
            </h2>
            <p>
              {s.correct + s.errors} premières réponses évaluées.
              <br />
              Les renforcements restent en dehors de ce score.
            </p>
          </div>
        </div>
        <div className="metrics-row compact">
          <Metric label="Réussites" value={s.correct} />
          <Metric label="À retravailler" value={s.errors} />
          <Metric label="Temps de session" value={duration(s.durationSeconds)} />
        </div>
        {s.weakNotions.length > 0 && (
          <div className="weak-notions">
            <h3>À retrouver prochainement</h3>
            <div>
              {s.weakNotions.map((n) => (
                <Badge key={n} tone="amber">
                  {n}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="result-actions">
          {s.errors > 0 && (
            <Button loading={repeat.isPending} onClick={() => repeat.mutate()}>
              <RotateCcw size={17} />
              Revoir mes erreurs
            </Button>
          )}
          <Button variant="secondary" onClick={() => setSetup(true)}>
            Nouvelle session
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/statistics">Consulter ma progression</Link>
          </Button>
        </div>
        <section className="result-corrections">
          <h2>Revenir sur les réponses</h2>
          <p className="muted">
            Le contenu et les explications correspondent à la version de cette session.
          </p>
          {s.questions
            .filter((q) => !q.isReinforcement && q.feedback)
            .map((q, i) => (
              <details key={q.id}>
                <summary>
                  <span
                    className={`result-indicator ${q.feedback?.isCorrect ? 'is-correct' : 'is-wrong'}`}
                  >
                    {q.feedback?.isCorrect ? <Check size={16} /> : <X size={16} />}
                  </span>
                  <span>
                    {i + 1}. {q.statement.replace(/[#*`]/g, '')}
                  </span>
                  {q.feedback?.isGuessed && <Badge>Devinée</Badge>}
                </summary>
                <Correction item={q} feedback={q.feedback!} />
              </details>
            ))}
        </section>
        <p className="result-memory-note">
          <Brain size={18} />
          Une bonne session est une étape. La maîtrise se confirme dans le temps.
        </p>
      </main>
      {setup && (
        <QuizSetup
          open={setup}
          onOpenChange={setSetup}
          subjectId={s.subjectId}
          chapterId={s.chapterId ?? undefined}
        />
      )}
    </div>
  );
}
