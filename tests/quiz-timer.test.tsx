import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { answerSchema, type QuizSession } from '@sillage/shared';
import { QuestionTimer } from '../apps/web/src/QuestionTimer';
import QuizPage from '../apps/web/src/QuizPage';
import { api, ApiError, type User } from '../apps/web/src/api';
import { AuthContext } from '../apps/web/src/context';
import { questionImage } from './fixtures/question-image';

vi.mock('../apps/web/src/api', async (original) => ({
  ...(await original<typeof import('../apps/web/src/api')>()),
  api: vi.fn(),
}));
vi.mock('../apps/web/src/Markdown', () => ({
  Markdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
}));

const optionA = '00000000-0000-4000-8000-000000000001';
const optionB = '00000000-0000-4000-8000-000000000002';
const questionId = '00000000-0000-4000-8000-000000000003';
const user: User = {
  id: 'timer-user',
  name: 'Camille',
  email: 'timer@test.invalid',
  csrf: '',
  preferences: {
    theme: 'light',
    activeRecallEnabled: false,
    autoAdvanceEnabled: false,
    reducedMotion: true,
    timezone: 'Europe/Paris',
  },
};
function session(mode: QuizSession['mode'] = 'REVISION'): QuizSession {
  return {
    id: 'timer-session',
    subjectId: 'subject',
    chapterId: 'chapter',
    mode,
    status: 'ACTIVE',
    startedAt: new Date().toISOString(),
    completedAt: null,
    deadlineAt: null,
    durationSeconds: null,
    score: null,
    subjectName: 'Matière',
    chapterTitle: 'Chapitre',
    total: 2,
    correct: 0,
    errors: 0,
    weakNotions: [],
    questions: [0, 1].map((index) => ({
      id: index === 0 ? questionId : '00000000-0000-4000-8000-000000000004',
      questionId: `question-${index}`,
      statement: `Question ${index + 1}`,
      type: 'SINGLE',
      notion: '',
      difficulty: 'MEDIUM',
      options: [
        { id: optionA, text: 'Proposition A' },
        { id: optionB, text: 'Proposition B' },
      ],
      isReinforcement: false,
      answered: false,
      selectedOptionIds: [],
    })),
  };
}
function answeredSession(source: QuizSession, selectedOptionIds: string[]): QuizSession {
  const result = structuredClone(source);
  const item = result.questions[0]!;
  item.answered = true;
  item.selectedOptionIds = selectedOptionIds;
  if (result.mode !== 'EXAM')
    item.feedback = {
      acknowledged: false,
      isCorrect: selectedOptionIds.length === 1 && selectedOptionIds[0] === optionB,
      isGuessed: false,
      selectedOptionIds,
      correctOptionIds: [optionB],
      options: item.options,
      explanation: 'La proposition B est correcte.',
    };
  return result;
}
const clients: QueryClient[] = [];
function renderQuiz(data = session()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(['quiz', data.id], data);
  return render(
    <AuthContext.Provider value={user}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/quiz/${data.id}`]}>
          <Routes>
            <Route path="/quiz/:id" element={<QuizPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
}
async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-21T11:00:00Z'));
  vi.mocked(api).mockReset();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.useRealTimers();
});

describe('chronomètre par question', () => {
  it('expire exactement après vingt secondes et appelle la dernière action une seule fois', async () => {
    const initial = vi.fn();
    const latest = vi.fn();
    const props = { storageKey: 'clock', running: true, answered: false };
    const view = render(<QuestionTimer {...props} onExpire={initial} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:20');
    await advance(10000);
    expect(initial).not.toHaveBeenCalled();
    expect(screen.getByRole('timer')).toHaveTextContent('0:10');
    view.rerender(<QuestionTimer {...props} onExpire={latest} />);
    await advance(9900);
    expect(latest).not.toHaveBeenCalled();
    expect(screen.getByRole('timer')).toHaveTextContent('0:01');
    await advance(100);
    expect(latest).toHaveBeenCalledTimes(1);
    expect(initial).not.toHaveBeenCalled();
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    await advance(15000);
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('conserve le temps restant lors d’une pause et d’une reprise', async () => {
    const expired = vi.fn();
    const view = render(
      <QuestionTimer storageKey="clock" running answered={false} onExpire={expired} />,
    );
    await advance(3000);
    view.unmount();
    await advance(30000);
    render(<QuestionTimer storageKey="clock" running answered={false} onExpire={expired} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:17');
    await advance(16900);
    expect(expired).not.toHaveBeenCalled();
    await advance(100);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('retrouve l’échéance sauvegardée après un rechargement', async () => {
    sessionStorage.setItem(
      'clock',
      JSON.stringify({ remainingMs: 20000, deadlineAt: Date.now() + 4000 }),
    );
    const expired = vi.fn();
    render(<QuestionTimer storageKey="clock" running answered={false} onExpire={expired} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:04');
    await advance(4000);
    expect(expired).toHaveBeenCalledTimes(1);
  });
});

describe('validation chronométrée du quiz', () => {
  it('suspend le chronomètre pendant l’agrandissement d’une image', async () => {
    const data = session();
    data.questions[0]!.image = questionImage;
    vi.mocked(api).mockResolvedValue(answeredSession(data, []));
    renderQuiz(data);
    await advance(3000);
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir l’image de la question' }));
    await advance(20000);
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.getByRole('timer')).toHaveTextContent('0:17');
    await advance(17001);
    expect(api).toHaveBeenCalledTimes(1);
  });
  it.each(['DISCOVERY', 'REVISION', 'EXAM'] as const)(
    'valide la sélection la plus récente à zéro en mode %s',
    async (mode) => {
      const data = session(mode);
      vi.mocked(api).mockResolvedValue(answeredSession(data, [optionB]));
      renderQuiz(data);
      fireEvent.click(screen.getByRole('button', { name: /Proposition A/ }));
      await advance(5000);
      fireEvent.click(screen.getByRole('button', { name: /Proposition B/ }));
      await advance(14900);
      expect(api).not.toHaveBeenCalled();
      await advance(100);
      expect(api).toHaveBeenCalledWith('/quiz/sessions/timer-session/answers', {
        method: 'POST',
        body: expect.objectContaining({
          sessionQuestionId: questionId,
          selectedOptionIds: [optionB],
          timedOut: true,
        }),
      });
      expect(api).toHaveBeenCalledTimes(1);
    },
  );

  it('enregistre une absence de réponse et attend la lecture de la correction', async () => {
    const data = session();
    vi.mocked(api).mockResolvedValue(answeredSession(data, []));
    renderQuiz(data);
    await advance(20001);
    expect(api).toHaveBeenCalledWith('/quiz/sessions/timer-session/answers', {
      method: 'POST',
      body: expect.objectContaining({ selectedOptionIds: [], timedOut: true }),
    });
    expect(screen.getByRole('heading', { name: 'Temps écoulé' })).toBeVisible();
    await advance(30000);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('ne renvoie pas une réponse validée manuellement et redémarre à vingt secondes', async () => {
    const data = session();
    vi.mocked(api).mockResolvedValue(answeredSession(data, [optionB]));
    renderQuiz(data);
    await advance(3000);
    fireEvent.click(screen.getByRole('button', { name: /Proposition B/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider ma réponse' }));
    await advance(20000);
    expect(api).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api).mock.calls[0]?.[1]?.body).toMatchObject({ timedOut: false });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.getByRole('timer')).toHaveTextContent('0:20');
    await advance(19000);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('suspend le compteur pendant la confirmation de fin de session', async () => {
    renderQuiz();
    await advance(3000);
    fireEvent.click(screen.getByRole('button', { name: 'Terminer', exact: true }));
    await advance(30000);
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('timer')).toHaveTextContent('0:17');
    await advance(16900);
    expect(api).not.toHaveBeenCalled();
  });

  it('conserve la réponse expirée hors connexion et réutilise sa clé après rechargement', async () => {
    const data = session();
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiError('Connexion interrompue.', 0, 'NETWORK'))
      .mockResolvedValue(answeredSession(data, []));
    const view = renderQuiz(data);
    await advance(20001);
    const firstPayload = vi.mocked(api).mock.calls[0]?.[1]?.body;
    expect(screen.getByRole('button', { name: 'Réessayer l’enregistrement' })).toBeEnabled();
    view.unmount();
    renderQuiz(data);
    await advance(20000);
    expect(api).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer l’enregistrement' }));
    await advance(100);
    expect(vi.mocked(api).mock.calls[1]?.[1]?.body).toEqual(firstPayload);
    expect(api).toHaveBeenCalledTimes(2);
  });
});

describe('contrat des réponses expirées', () => {
  const payload = {
    sessionQuestionId: questionId,
    selectedOptionIds: [],
    isGuessed: false,
    idempotencyKey: optionA,
  };
  it('n’autorise une réponse vide que si le temps est écoulé', () => {
    expect(answerSchema.safeParse(payload).success).toBe(false);
    expect(answerSchema.safeParse({ ...payload, timedOut: true }).success).toBe(true);
    expect(answerSchema.safeParse({ ...payload, selectedOptionIds: [optionB] }).success).toBe(true);
  });
});
