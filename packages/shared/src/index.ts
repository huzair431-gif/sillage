import { z } from 'zod';

export const registrationSchema = z
  .object({
    name: z.string().trim().min(1, 'Indiquez votre prénom ou votre nom.').max(100),
    email: z.string().trim().toLowerCase().pipe(z.email('Adresse e-mail invalide.').max(254)),
    password: z.string().min(12, 'Le mot de passe doit contenir au moins 12 caractères.').max(1024),
  })
  .strict();

export const questionTypes = ['SINGLE', 'MULTIPLE', 'TRUE_FALSE'] as const;
export const difficultyValues = ['EASY', 'MEDIUM', 'HARD'] as const;
export const MAX_QUESTION_IMAGE_BYTES = 512 * 1024;
export const QUESTION_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
function validImageSource(source: string) {
  const match = source.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const data = match[2]!;
  const bytes = (data.length * 3) / 4 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (data.length % 4 !== 0 || bytes > MAX_QUESTION_IMAGE_BYTES) return false;
  try {
    const header = atob(data.slice(0, 16));
    return match[1] === 'png'
      ? header.startsWith('\x89PNG\r\n\x1a\n')
      : match[1] === 'jpeg'
        ? header.startsWith('\xff\xd8\xff')
        : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
  } catch {
    return false;
  }
}
export const questionImageSchema = z
  .object({
    src: z
      .string()
      .max(Math.ceil(MAX_QUESTION_IMAGE_BYTES / 3) * 4 + 40)
      .refine(validImageSource, 'Image PNG, JPEG ou WebP invalide, ou supérieure à 512 Ko.'),
    alt: z
      .string()
      .trim()
      .max(300)
      .regex(/^[^\r\n]*$/, 'La description doit tenir sur une ligne.')
      .default(''),
  })
  .strict();
export type QuestionImageData = z.infer<typeof questionImageSchema>;
export const questionSchema = z
  .object({
    externalId: z.string().trim().min(1).max(150).optional(),
    statement: z.string().trim().min(1, 'L’énoncé est obligatoire.').max(30000),
    image: questionImageSchema.nullish(),
    type: z.enum(questionTypes),
    notion: z.string().trim().max(200).default(''),
    difficulty: z.enum(difficultyValues).default('MEDIUM'),
    explanation: z.string().trim().min(1, 'Une explication est obligatoire.').max(50000),
    options: z
      .array(
        z.object({ text: z.string().trim().min(1).max(15000), isCorrect: z.boolean() }).strict(),
      )
      .min(2)
      .max(12),
  })
  .strict()
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (q.type === 'MULTIPLE' ? correct < 2 : correct !== 1)
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message:
          q.type === 'MULTIPLE'
            ? 'Un QCM multiple nécessite au moins deux bonnes réponses.'
            : 'Sélectionnez exactement une bonne réponse.',
      });
    if (
      q.type === 'TRUE_FALSE' &&
      (q.options.length !== 2 ||
        !q.options.some((o) => o.text.toLowerCase() === 'vrai') ||
        !q.options.some((o) => o.text.toLowerCase() === 'faux'))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Un Vrai/Faux doit contenir les propositions Vrai et Faux.',
      });
    if (new Set(q.options.map((o) => o.text.trim().toLowerCase())).size !== q.options.length)
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Deux propositions sont identiques.',
      });
  });
export type QuestionInput = z.infer<typeof questionSchema>;
export const subjectSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).default(''),
    examDate: z.iso.date().nullable().default(null),
    color: z.enum(['indigo', 'sage', 'rose', 'amber', 'blue', 'violet']).default('indigo'),
  })
  .strict();
export const chapterSchema = z.object({ title: z.string().trim().min(1).max(200) }).strict();
export const importSchema = z
  .object({
    text: z.string().max(5000000).optional(),
    questions: z.array(questionSchema).min(1).max(5000).optional(),
    mode: z.enum(['append', 'replace']).default('append'),
    expectedRevision: z.number().int().min(0).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.text?.trim()) !== Boolean(v.questions),
    'Fournissez du Markdown ou un lot de questions.',
  );
export const quizSchema = z
  .object({
    subjectId: z.string().uuid().optional(),
    chapterId: z.string().uuid().optional(),
    mode: z.enum(['DISCOVERY', 'REVISION', 'EXAM']),
    count: z.union([z.number().int().min(1).max(5000), z.literal('all')]).default(20),
    timeLimitMinutes: z.number().int().min(1).max(240).optional(),
    onlyErrorsFrom: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.subjectId || v.chapterId), 'Choisissez une matière ou un chapitre.');
export const answerSchema = z
  .object({
    sessionQuestionId: z.string().uuid(),
    selectedOptionIds: z
      .array(z.string().uuid())
      .max(12)
      .refine((v) => new Set(v).size === v.length),
    isGuessed: z.boolean().default(false),
    timedOut: z.boolean().default(false),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine((v) => v.timedOut || v.selectedOptionIds.length > 0, {
    path: ['selectedOptionIds'],
    message: 'Sélectionnez une réponse avant de valider.',
  });
export const preferencesSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']),
    activeRecallEnabled: z.boolean(),
    autoAdvanceEnabled: z.boolean(),
    reducedMotion: z.boolean(),
    timezone: z
      .string()
      .max(100)
      .refine((t) => {
        try {
          new Intl.DateTimeFormat('fr', { timeZone: t });
          return true;
        } catch {
          return false;
        }
      }, 'Fuseau horaire invalide.'),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export type Mode = z.infer<typeof quizSchema>['mode'];
export const QUESTION_TIME_LIMIT_SECONDS = 20;
export type MemoryStatus = 'NEW' | 'FRAGILE' | 'CONSOLIDATING' | 'MASTERED';
export interface Stats {
  total: number;
  seen: number;
  mastered: number;
  fragile: number;
  consolidating: number;
  fresh: number;
  due: number;
  coverage: number;
  mastery: number;
  lastScore: number | null;
  bestScore: number | null;
}
export interface Subject {
  id: string;
  name: string;
  description: string;
  color: string;
  examDate: string | null;
  stats: Stats;
  chaptersCount: number;
  createdAt: string;
}
export interface Chapter {
  id: string;
  title: string;
  subjectId: string;
  position: number;
  revision: number;
  stats: Stats;
}
export interface StoredQuestion extends QuestionInput {
  id: string;
  currentVersion: number;
  memoryStatus: MemoryStatus;
  nextReviewAt: string | null;
}
export interface QuizOption {
  id: string;
  text: string;
}
export interface Feedback {
  acknowledged: boolean;
  isCorrect: boolean;
  selectedOptionIds: string[];
  correctOptionIds: string[];
  explanation: string;
  options: QuizOption[];
  isGuessed: boolean;
}
export interface QuizItem {
  id: string;
  questionId: string;
  statement: string;
  image?: QuestionImageData | null;
  type: QuestionInput['type'];
  notion: string;
  difficulty: QuestionInput['difficulty'];
  options: QuizOption[];
  isReinforcement: boolean;
  answered: boolean;
  selectedOptionIds: string[];
  feedback?: Feedback;
}
export interface SessionSummary {
  id: string;
  mode: Mode;
  status: 'ACTIVE' | 'COMPLETED';
  startedAt: string;
  completedAt: string | null;
  score: number | null;
  subjectName: string;
  chapterTitle: string | null;
  total: number;
  correct: number;
  errors: number;
  durationSeconds: number | null;
}
export interface QuizSession extends SessionSummary {
  subjectId: string;
  chapterId: string | null;
  deadlineAt: string | null;
  questions: QuizItem[];
  weakNotions: string[];
}
export const modeLabels: Record<Mode, string> = {
  DISCOVERY: 'Découverte',
  REVISION: 'Révision intelligente',
  EXAM: 'Examen',
};
export const typeLabels = {
  SINGLE: 'QCM simple',
  MULTIPLE: 'QCM multiple',
  TRUE_FALSE: 'Vrai / Faux',
};
export const difficultyLabels = { EASY: 'Facile', MEDIUM: 'Moyen', HARD: 'Difficile' };
