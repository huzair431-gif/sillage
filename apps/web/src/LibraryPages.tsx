import { MemoryArt } from './BrandArt';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Calendar,
  Check,
  Clock3,
  Copy,
  FileText,
  History,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Brain,
  ClipboardCheck,
} from 'lucide-react';
import {
  type Chapter,
  type Mode,
  type QuestionInput,
  type Stats,
  type StoredQuestion,
  type Subject,
  type SessionSummary,
  modeLabels,
  typeLabels,
} from '@sillage/shared';
import {
  api,
  shortDate,
  duration,
  type ChapterDetail,
  type Overview,
  type SubjectDetail,
} from './api';
import { useRefresh, useUser } from './context';
import {
  AddButton,
  Badge,
  Button,
  Confirm,
  Dialog,
  Dropdown,
  Empty,
  ErrorState,
  Field,
  Loading,
  MenuItem,
  Metric,
  PageHeader,
  Progress,
  SubjectIcon,
} from './ui';
import { Markdown } from './Markdown';
import { QuestionImage } from './QuestionImage';
import { QuestionEditor } from './QuestionEditor';
import { QuizSetup } from './QuizSetup';
export function Dashboard() {
  const user = useUser();
  const [create, setCreate] = useState(false),
    [quiz, setQuiz] = useState(false);
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Overview>('/dashboard') });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const scope = [...d.subjects]
    .filter((s) => s.stats.total > 0)
    .sort((a, b) => b.stats.due - a.stats.due);
  return (
    <>
      <PageHeader
        eyebrow="VOTRE APPRENTISSAGE, À VOTRE RYTHME"
        title={`Bonjour ${user.name.split(' ')[0]}.`}
        description="Chaque jour, un peu plus loin."
        action={
          <span className="quiet-tag">
            <span className="live-dot" />
            Votre espace de concentration
          </span>
        }
      />
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            {d.stats.due ? 'LE BON MOMENT POUR REVENIR' : 'DES CONNAISSANCES QUI RESTENT'}
          </span>
          <h2>
            Un peu aujourd’hui.
            <br />
            <span>Longtemps en mémoire.</span>
          </h2>
          <p>
            {d.stats.due
              ? `${d.stats.due} question${d.stats.due > 1 ? 's vous attendent' : ' vous attend'}. Retrouvez vos connaissances au moment où cela compte.`
              : d.stats.total
                ? 'Votre prochaine révision commence ici. Faites une place à ce que vous voulez retenir.'
                : 'Créez votre première matière, ajoutez vos questions et laissez la régularité faire son chemin.'}
          </p>
          <Button onClick={() => (scope.length ? setQuiz(true) : setCreate(true))}>
            <Sparkles size={17} />
            {scope.length ? 'Commencer ma révision' : 'Créer ma première matière'}
          </Button>
          <span className="hero-footnote">
            {d.stats.total
              ? 'À votre rythme. Sans pression.'
              : 'Votre espace. Vos questions. Votre progression.'}
          </span>
        </div>
        <MemoryArt />
        <span className="hero-art-caption">Les petits rappels font les grandes mémoires.</span>
      </section>
      <div className="metrics-row">
        <Metric
          label="À revoir aujourd’hui"
          value={d.stats.due}
          detail={d.stats.due ? 'Au bon moment' : 'Vous êtes à jour'}
        />
        <Metric
          label="Questions dans votre bibliothèque"
          value={d.stats.total}
          detail={`${d.subjects.length} matière${d.subjects.length > 1 ? 's' : ''}`}
        />
        <Metric
          label="Couverture"
          value={d.stats.total ? `${d.stats.coverage} %` : '—'}
          detail="Questions déjà rencontrées"
        />
        <Metric
          label="Maîtrise durable"
          value={d.stats.seen ? `${d.stats.mastery} %` : '—'}
          detail="Confirmée sur plusieurs jours"
        />
      </div>
      <section>
        <div className="section-heading">
          <div>
            <h2>
              Mes matières <span className="count">{d.subjects.length}</span>
            </h2>
            <p>Votre savoir prend forme, matière après matière.</p>
          </div>
          <AddButton onClick={() => setCreate(true)}>Nouvelle matière</AddButton>
        </div>
        {d.subjects.length ? (
          <div className="subject-grid">
            {d.subjects.map((s) => (
              <SubjectCard key={s.id} subject={s} />
            ))}
          </div>
        ) : (
          <div className="first-subject">
            <div className="first-subject-art">
              <span />
              <span />
              <BookOpen size={27} />
            </div>
            <div>
              <h3>Votre première matière commence ici.</h3>
              <p>
                Un cours, une langue, une idée à retenir.
                <br />
                Donnez un nom à ce que vous voulez apprendre.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Ajouter une matière
            </Button>
          </div>
        )}
      </section>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <h2>Dans votre sillage</h2>
            <p>Les derniers pas de votre apprentissage.</p>
          </div>
          {d.recent.length > 0 && (
            <Button asChild variant="ghost" size="small">
              <Link to="/history">Toutes les sessions</Link>
            </Button>
          )}
        </div>
        {d.recent.length ? (
          <SessionList items={d.recent} />
        ) : (
          <div className="quiet-empty">
            <History size={19} />
            <p>Vos sessions apparaîtront ici après votre première révision.</p>
          </div>
        )}
      </section>
      <SubjectForm open={create} onOpenChange={setCreate} />
      {quiz && (
        <QuizSetup open={quiz} onOpenChange={setQuiz} subjects={scope} subjectId={scope[0]?.id} />
      )}
    </>
  );
}
export function SubjectCard({ subject: s }: { subject: Subject }) {
  const [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false);
  const refresh = useRefresh();
  const del = useMutation({
    mutationFn: () => api(`/subjects/${s.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      setRemove(false);
    },
  });
  return (
    <article className="subject-card">
      <div className="subject-card-top">
        <SubjectIcon color={s.color} />
        <Dropdown label={`Actions pour ${s.name}`}>
          <MenuItem onSelect={() => setEdit(true)}>
            <Pencil size={15} />
            Modifier
          </MenuItem>
          <MenuItem danger onSelect={() => setRemove(true)}>
            <Trash2 size={15} />
            Supprimer
          </MenuItem>
        </Dropdown>
      </div>
      <Link className="subject-card-link" to={`/subjects/${s.id}`}>
        <h3>{s.name}</h3>
        <p>{s.description || 'Un nouveau territoire à explorer.'}</p>
        <div className="subject-card-counts">
          <span>
            {s.chaptersCount} chapitre{s.chaptersCount > 1 ? 's' : ''}
          </span>
          <span>·</span>
          <span>
            {s.stats.total} question{s.stats.total > 1 ? 's' : ''}
          </span>
        </div>
        <div className="card-mastery">
          <span>{s.stats.seen ? 'Maîtrise durable' : 'Pas encore évaluée'}</span>
          <strong>{s.stats.seen ? `${s.stats.mastery} %` : '—'}</strong>
        </div>
        <Progress value={s.stats.mastery} label={`Maîtrise de ${s.name}`} />
        <div className="card-bottom">
          {s.stats.due ? (
            <Badge tone="amber">
              <Clock3 size={12} />
              {s.stats.due} à revoir
            </Badge>
          ) : (
            <span className="muted">
              <Check size={13} />
              {s.stats.total ? 'À votre rythme' : 'Prête à accueillir vos questions'}
            </span>
          )}
          {s.examDate && (
            <span className="exam-date">
              <Calendar size={13} />
              {shortDate(s.examDate)}
            </span>
          )}
        </div>
      </Link>
      {edit && <SubjectForm open={edit} onOpenChange={setEdit} initial={s} />}
      <Confirm
        open={remove}
        onOpenChange={setRemove}
        title={`Supprimer « ${s.name} » ?`}
        description="La matière et ses chapitres seront retirés de votre bibliothèque. Vos anciennes sessions resteront consultables dans l’historique et l’export."
        onConfirm={() => del.mutate()}
        loading={del.isPending}
        label="Supprimer la matière"
      />
    </article>
  );
}
export function SubjectsPage() {
  const [create, setCreate] = useState(false);
  const q = useQuery({ queryKey: ['subjects'], queryFn: () => api<SubjectDetail[]>('/subjects') });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <>
      <PageHeader
        eyebrow="VOTRE BIBLIOTHÈQUE"
        title="Mes matières"
        description="Organisez ce que vous souhaitez garder en mémoire."
        action={<AddButton onClick={() => setCreate(true)}>Nouvelle matière</AddButton>}
      />
      {q.data.length ? (
        <div className="subject-grid">
          {q.data.map((s) => (
            <SubjectCard key={s.id} subject={s} />
          ))}
        </div>
      ) : (
        <Empty
          title="Le début de votre bibliothèque"
          description="Créez une matière, puis organisez vos questions en chapitres."
          action={<AddButton onClick={() => setCreate(true)}>Créer une matière</AddButton>}
        />
      )}
      <SubjectForm open={create} onOpenChange={setCreate} />
    </>
  );
}
function SubjectForm({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Subject;
}) {
  const [name, setName] = useState(initial?.name ?? ''),
    [description, setDescription] = useState(initial?.description ?? ''),
    [examDate, setExamDate] = useState(initial?.examDate?.slice(0, 10) ?? ''),
    [color, setColor] = useState(initial?.color ?? 'indigo');
  const refresh = useRefresh();
  const save = useMutation({
    mutationFn: () =>
      api(initial ? `/subjects/${initial.id}` : '/subjects', {
        method: initial ? 'PATCH' : 'POST',
        body: { name, description, examDate: examDate || null, color },
      }),
    onSuccess: () => {
      refresh();
      onOpenChange(false);
      if (!initial) {
        setName('');
        setDescription('');
        setExamDate('');
      }
    },
  });
  return (
    <Dialog
      {...{ open, onOpenChange }}
      title={initial ? 'Modifier la matière' : 'Une nouvelle matière'}
      description="Donnez un espace à vos prochaines connaissances."
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Nom de la matière">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            placeholder="Comment s’appelle votre matière ?"
            required
          />
        </Field>
        <Field label="Description (facultative)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Quelques mots pour vous y retrouver…"
          />
        </Field>
        <Field label="Date d’examen (facultative)">
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </Field>
        <div className="field">
          <span>Couleur</span>
          <div className="color-options">
            {['indigo', 'sage', 'rose', 'amber', 'blue', 'violet'].map((c) => (
              <button
                className={`color-swatch color-${c}`}
                type="button"
                key={c}
                aria-label={`Couleur ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              >
                {color === c && <Check size={17} />}
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={save.isPending}>{initial ? 'Enregistrer' : 'Créer la matière'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
export function SubjectPage() {
  const { id } = useParams();
  const [create, setCreate] = useState(false),
    [quiz, setQuiz] = useState(false);
  const refresh = useRefresh();
  const q = useQuery({
    queryKey: ['subject', id],
    queryFn: () => api<SubjectDetail>(`/subjects/${id}`),
  });
  const order = useMutation({
    mutationFn: (ids: string[]) =>
      api(`/subjects/${id}/chapters/order`, { method: 'PATCH', body: { ids } }),
    onSuccess: refresh,
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const s = q.data;
  return (
    <>
      <Link to="/subjects" className="back-link">
        Mes matières /
      </Link>
      <PageHeader
        eyebrow={
          <>
            <SubjectIcon color={s.color} size={17} />
            {s.examDate && `Examen le ${shortDate(s.examDate)}`}
          </>
        }
        title={s.name}
        description={s.description || 'Un chapitre après l’autre, les connaissances s’ancrent.'}
        action={
          <Button disabled={!s.stats.total} onClick={() => setQuiz(true)}>
            <Sparkles size={17} />
            Réviser cette matière
          </Button>
        }
      />
      <div className="metrics-row compact">
        <Metric label="Questions" value={s.stats.total} />
        <Metric label="Couverture" value={`${s.stats.coverage} %`} />
        <Metric label="Maîtrise durable" value={s.stats.seen ? `${s.stats.mastery} %` : '—'} />
        <Metric label="À revoir" value={s.stats.due} />
      </div>
      <div className="section-heading">
        <div>
          <h2>
            Chapitres <span className="count">{s.chapters.length}</span>
          </h2>
          <p>Des étapes claires pour avancer.</p>
        </div>
        <AddButton onClick={() => setCreate(true)}>Ajouter un chapitre</AddButton>
      </div>
      {s.chapters.length ? (
        <div className="chapter-list">
          {s.chapters.map((c, i) => (
            <ChapterRow
              key={c.id}
              chapter={c}
              index={i}
              count={s.chapters.length}
              onMove={(dir) => {
                const ids = s.chapters.map((c) => c.id);
                [ids[i], ids[i + dir]] = [ids[i + dir]!, ids[i]!];
                order.mutate(ids);
              }}
              disabled={order.isPending}
            />
          ))}
        </div>
      ) : (
        <Empty
          title="Votre premier chapitre"
          description="Découpez votre matière en chapitres pour réviser avec plus de clarté."
          action={<AddButton onClick={() => setCreate(true)}>Ajouter un chapitre</AddButton>}
        />
      )}
      <ChapterForm open={create} onOpenChange={setCreate} subjectId={s.id} />
      {quiz && (
        <QuizSetup open={quiz} onOpenChange={setQuiz} subjectId={s.id} available={s.stats.total} />
      )}
    </>
  );
}
function ChapterRow({
  chapter: c,
  index,
  count,
  onMove,
  disabled,
}: {
  chapter: Chapter;
  index: number;
  count: number;
  onMove: (dir: number) => void;
  disabled: boolean;
}) {
  const [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false);
  const refresh = useRefresh();
  const del = useMutation({
    mutationFn: () => api(`/chapters/${c.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  return (
    <div className="chapter-row">
      <span className="chapter-number">{String(index + 1).padStart(2, '0')}</span>
      <Link className="chapter-row-main" to={`/chapters/${c.id}`}>
        <h3>{c.title}</h3>
        <p>
          {c.stats.total} questions <span>·</span>{' '}
          {c.stats.seen ? `${c.stats.coverage} % rencontrées` : 'Pas encore évalué'}
        </p>
      </Link>
      <div className="chapter-row-progress">
        <span>{c.stats.seen ? `${c.stats.mastery} % de maîtrise` : 'À découvrir'}</span>
        <Progress value={c.stats.mastery} />
      </div>
      {c.stats.due > 0 && <Badge tone="amber">{c.stats.due} à revoir</Badge>}
      <Dropdown label={`Actions pour ${c.title}`}>
        <MenuItem onSelect={() => setEdit(true)}>
          <Pencil size={15} />
          Renommer
        </MenuItem>
        {index > 0 && !disabled && (
          <MenuItem onSelect={() => onMove(-1)}>
            <ArrowUp size={15} />
            Monter
          </MenuItem>
        )}
        {index < count - 1 && !disabled && (
          <MenuItem onSelect={() => onMove(1)}>
            <ArrowDown size={15} />
            Descendre
          </MenuItem>
        )}
        <MenuItem danger onSelect={() => setRemove(true)}>
          <Trash2 size={15} />
          Supprimer
        </MenuItem>
      </Dropdown>
      <ChapterForm open={edit} onOpenChange={setEdit} subjectId={c.subjectId} initial={c} />
      <Confirm
        open={remove}
        onOpenChange={setRemove}
        title="Supprimer ce chapitre ?"
        description="Il sera retiré de la bibliothèque. Les anciennes sessions seront conservées."
        onConfirm={() => del.mutate(undefined, { onSuccess: () => setRemove(false) })}
        loading={del.isPending}
        label="Supprimer"
      />
    </div>
  );
}
function ChapterForm({
  open,
  onOpenChange,
  subjectId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subjectId: string;
  initial?: Chapter;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const refresh = useRefresh();
  const save = useMutation({
    mutationFn: () =>
      api(initial ? `/chapters/${initial.id}` : `/subjects/${subjectId}/chapters`, {
        method: initial ? 'PATCH' : 'POST',
        body: { title },
      }),
    onSuccess: () => {
      refresh();
      onOpenChange(false);
      if (!initial) setTitle('');
    },
  });
  return (
    <Dialog
      {...{ open, onOpenChange }}
      title={initial ? 'Renommer le chapitre' : 'Un nouveau chapitre'}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Titre du chapitre">
          <input
            required
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Le sujet à explorer"
          />
        </Field>
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={save.isPending}>{initial ? 'Enregistrer' : 'Créer le chapitre'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
export function ChapterPage() {
  const { id } = useParams();
  const [quiz, setQuiz] = useState<Mode | null>(null),
    [tab, setTab] = useState('questions'),
    [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['chapter', id],
    queryFn: () => api<ChapterDetail>(`/chapters/${id}`),
  });
  const questions = useQuery({
    queryKey: ['questions', id, page],
    queryFn: () =>
      api<{ items: StoredQuestion[]; total: number }>(
        `/chapters/${id}/questions?page=${page}&limit=50`,
      ),
  });
  const history = useQuery({
    queryKey: ['chapterHistory', id],
    queryFn: () => api<{ items: SessionSummary[] }>(`/sessions?limit=100&chapterId=${id}`),
    enabled: tab === 'history',
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const c = q.data;
  return (
    <>
      <Link to={`/subjects/${c.subject.id}`} className="back-link">
        {c.subject.name} /
      </Link>
      <PageHeader
        eyebrow="VOTRE CHAPITRE"
        title={c.title}
        description={`${c.stats.total} questions pour faire le tour du sujet.`}
        action={
          <Button asChild>
            <Link to={`/chapters/${id}/import`}>
              <Plus size={17} />
              Ajouter des questions
            </Link>
          </Button>
        }
      />
      <div className="study-modes">
        {[
          {
            mode: 'DISCOVERY' as const,
            icon: BookOpen,
            title: 'Découvrir',
            text: 'Faire connaissance avec le cours.',
          },
          {
            mode: 'REVISION' as const,
            icon: Brain,
            title: 'Réviser',
            text: 'Ancrer les notions qui comptent.',
          },
          {
            mode: 'EXAM' as const,
            icon: ClipboardCheck,
            title: 'Examen',
            text: 'Vous évaluer, en conditions.',
          },
        ].map((m) => (
          <button key={m.mode} disabled={!c.stats.total} onClick={() => setQuiz(m.mode)}>
            <m.icon size={23} strokeWidth={1.6} />
            <strong>{m.title}</strong>
            <span>{m.text}</span>
          </button>
        ))}
      </div>
      <div className="metrics-row compact">
        <Metric label="Couverture" value={`${c.stats.coverage} %`} />
        <Metric label="Maîtrise durable" value={c.stats.seen ? `${c.stats.mastery} %` : '—'} />
        <Metric label="Questions fragiles" value={c.stats.fragile} />
        <Metric label="À revoir aujourd’hui" value={c.stats.due} />
      </div>
      <div className="tabs-line">
        <div role="tablist" aria-label="Contenu du chapitre">
          {[
            ['questions', 'Questions'],
            ['progress', 'Progression'],
            ['history', 'Historique'],
          ].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key!)}>
              {label}
            </button>
          ))}
        </div>
        <Dropdown label="Actions du lot">
          <MenuItem onSelect={() => location.assign(`/chapters/${id}/import?mode=replace`)}>
            <RefreshCw size={15} />
            Remplacer le lot
          </MenuItem>
        </Dropdown>
      </div>
      {tab === 'questions' &&
        (questions.isPending ? (
          <Loading />
        ) : questions.isError ? (
          <ErrorState error={questions.error} retry={() => questions.refetch()} />
        ) : questions.data.items.length ? (
          <>
            <div className="question-list">
              {questions.data.items.map((item, i) => (
                <QuestionRow
                  key={item.id}
                  question={item}
                  index={(page - 1) * 50 + i + 1}
                  chapter={c}
                />
              ))}
            </div>
            {questions.data.total > 50 && (
              <div className="pagination">
                <Button
                  variant="secondary"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Précédent
                </Button>
                <span>
                  Page {page} sur {Math.ceil(questions.data.total / 50)}
                </span>
                <Button
                  variant="secondary"
                  disabled={page * 50 >= questions.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Suivant
                </Button>
              </div>
            )}
          </>
        ) : (
          <Empty
            title="Des questions pour commencer"
            description="Collez un lot Markdown, importez un fichier ou créez votre première question visuellement."
            action={
              <Button asChild>
                <Link to={`/chapters/${id}/import`}>
                  <Upload size={17} />
                  Ajouter des questions
                </Link>
              </Button>
            }
          />
        ))}
      {tab === 'progress' && (
        <>
          <div className="metrics-row compact">
            <Metric
              label="Dernier score"
              value={c.stats.lastScore === null ? 'Pas encore évalué' : `${c.stats.lastScore} %`}
            />
            <Metric
              label="Meilleur score"
              value={c.stats.bestScore === null ? '—' : `${c.stats.bestScore} %`}
            />
            <Metric label="Questions rencontrées" value={`${c.stats.seen} / ${c.stats.total}`} />
          </div>
          <StateDistribution stats={c.stats} />
          <p className="muted explanatory-note">
            La maîtrise exige au moins trois réussites fiables sur des jours distincts, aux
            échéances prévues. Le score mesure une session ; la couverture mesure les questions
            rencontrées.
          </p>
        </>
      )}
      {tab === 'history' &&
        (history.isPending ? (
          <Loading />
        ) : history.isError ? (
          <ErrorState error={history.error} retry={() => history.refetch()} />
        ) : (
          <SessionList items={history.data?.items ?? []} chapterId={id} />
        ))}
      {quiz && (
        <QuizSetup
          key={quiz}
          open={Boolean(quiz)}
          onOpenChange={(open) => {
            if (!open) setQuiz(null);
          }}
          subjectId={c.subject.id}
          chapterId={id}
          initialMode={quiz}
          available={c.stats.total}
        />
      )}
    </>
  );
}
function QuestionRow({
  question: q,
  index,
  chapter,
}: {
  question: StoredQuestion;
  index: number;
  chapter: ChapterDetail;
}) {
  const [view, setView] = useState(false),
    [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false),
    [history, setHistory] = useState(false);
  const refresh = useRefresh();
  const patch = useMutation({
    mutationFn: (question: QuestionInput) =>
      api(`/questions/${q.id}`, {
        method: 'PATCH',
        body: { question, expectedVersion: q.currentVersion },
      }),
    onSuccess: () => {
      refresh();
      setEdit(false);
    },
  });
  const del = useMutation({
    mutationFn: () => api(`/questions/${q.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const duplicate = useMutation({
    mutationFn: () => {
      const { id, currentVersion, memoryStatus, nextReviewAt, externalId, ...question } = q;
      return api(`/chapters/${chapter.id}/questions`, {
        method: 'POST',
        body: {
          question: {
            statement: q.statement + ' (copie)',
            image: q.image,
            type: q.type,
            notion: q.notion,
            difficulty: q.difficulty,
            options: q.options,
            explanation: q.explanation,
          },
          expectedRevision: chapter.revision,
        },
      });
    },
    onSuccess: refresh,
  });
  const status = {
    NEW: 'Nouvelle',
    FRAGILE: 'Fragile',
    CONSOLIDATING: 'En consolidation',
    MASTERED: 'Maîtrisée',
  }[q.memoryStatus];
  return (
    <div className="question-row">
      <span className="question-index">{index}</span>
      <button className="question-row-main" onClick={() => setView(true)}>
        <span>{q.statement.replace(/[#*`]/g, '')}</span>
        <small>
          {typeLabels[q.type]}
          {q.notion && ` · ${q.notion}`}
        </small>
      </button>
      <Badge
        tone={
          q.memoryStatus === 'FRAGILE'
            ? 'amber'
            : q.memoryStatus === 'MASTERED'
              ? 'sage'
              : 'neutral'
        }
      >
        {status}
      </Badge>
      <Dropdown label={`Actions pour la question ${index}`}>
        <MenuItem onSelect={() => setEdit(true)}>
          <Pencil size={15} />
          Modifier
        </MenuItem>
        <MenuItem onSelect={() => duplicate.mutate()}>
          <Copy size={15} />
          Dupliquer
        </MenuItem>
        <MenuItem onSelect={() => setHistory(true)}>
          <History size={15} />
          Anciennes tentatives
        </MenuItem>
        <MenuItem danger onSelect={() => setRemove(true)}>
          <Trash2 size={15} />
          Supprimer
        </MenuItem>
      </Dropdown>
      <Dialog open={view} onOpenChange={setView} title="Question">
        <Markdown>{q.statement}</Markdown>
        <QuestionImage image={q.image} />
        <div className="preview-options">
          {q.options.map((o, i) => (
            <div className={o.isCorrect ? 'is-correct' : ''} key={i}>
              <span>{o.isCorrect ? <Check size={15} /> : String.fromCharCode(65 + i)}</span>
              <Markdown>{o.text}</Markdown>
            </div>
          ))}
        </div>
        <div className="explanation-box">
          <span className="eyebrow">POUR COMPRENDRE</span>
          <Markdown>{q.explanation}</Markdown>
        </div>
      </Dialog>
      {edit && (
        <Dialog
          open={edit}
          onOpenChange={setEdit}
          title="Modifier la question"
          description="Une modification pédagogique réinitialise sa maîtrise. Les anciennes tentatives sont conservées."
          wide
        >
          <QuestionEditor
            initial={{
              statement: q.statement,
              image: q.image,
              externalId: q.externalId ?? undefined,
              type: q.type,
              notion: q.notion,
              difficulty: q.difficulty,
              options: q.options,
              explanation: q.explanation,
            }}
            onSave={(v) => patch.mutate(v)}
            onCancel={() => setEdit(false)}
            loading={patch.isPending}
          />
        </Dialog>
      )}
      <Confirm
        open={remove}
        onOpenChange={setRemove}
        title="Supprimer cette question ?"
        description="Ses anciennes tentatives resteront consultables dans les sessions et les exports."
        onConfirm={() => del.mutate(undefined, { onSuccess: () => setRemove(false) })}
        loading={del.isPending}
        label="Supprimer"
      />
      {history && <QuestionHistory id={q.id} onClose={() => setHistory(false)} />}
    </div>
  );
}
function QuestionHistory({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['questionHistory', id],
    queryFn: () =>
      api<{
        versions: { id: string; version: number; createdAt: string }[];
        attempts: {
          id: string;
          isCorrect: boolean;
          isGuessed: boolean;
          isReinforcement: boolean;
          answeredAt: string;
        }[];
      }>(`/questions/${id}/history`),
  });
  return (
    <Dialog open onOpenChange={() => onClose()} title="L’histoire de cette question">
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <p className="muted">
            {q.data.versions.length} version(s) conservée(s). Jusqu’aux 100 dernières tentatives.
          </p>
          {q.data.attempts.length ? (
            q.data.attempts.map((a) => (
              <div className="history-attempt" key={a.id}>
                <Badge tone={a.isCorrect ? 'sage' : 'amber'}>
                  {a.isCorrect ? 'Réussite' : 'Erreur'}
                </Badge>
                <span>
                  {a.isGuessed
                    ? 'Devinée'
                    : a.isReinforcement
                      ? 'Renforcement'
                      : 'Première présentation'}
                </span>
                <small>{shortDate(a.answeredAt)}</small>
              </div>
            ))
          ) : (
            <p className="muted">Pas encore de tentative dans une session terminée.</p>
          )}
        </>
      )}
    </Dialog>
  );
}
export function StateDistribution({ stats: s }: { stats: Stats }) {
  return (
    <div className="distribution">
      <h3>Ce qui se construit</h3>
      <div className="state-bar" aria-label="Répartition des états de mémorisation">
        {[
          { n: s.fresh, c: 'new' },
          { n: s.fragile, c: 'fragile' },
          { n: s.consolidating, c: 'consolidating' },
          { n: s.mastered, c: 'mastered' },
        ].map((x) => (
          <span
            key={x.c}
            className={`state-${x.c}`}
            style={{ width: `${s.total ? (x.n / s.total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <div className="state-legend">
        {[
          ['Nouvelles', s.fresh, 'new'],
          ['Fragiles', s.fragile, 'fragile'],
          ['En consolidation', s.consolidating, 'consolidating'],
          ['Maîtrisées', s.mastered, 'mastered'],
        ].map(([label, count, color]) => (
          <span key={label}>
            <i className={`state-${color}`} />
            {label}
            <strong>{count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
export function SessionList({ items, chapterId }: { items: SessionSummary[]; chapterId?: string }) {
  if (!items.length)
    return (
      <div className="quiet-empty">
        <History size={18} />
        <p>Aucune session pour le moment.</p>
      </div>
    );
  return (
    <div className="session-list">
      {items.map((s) => (
        <Link key={s.id} to={`/quiz/${s.id}`} className="session-row">
          <span className="session-symbol">
            {s.mode === 'EXAM' ? (
              <ClipboardCheck size={19} />
            ) : s.mode === 'REVISION' ? (
              <Brain size={19} />
            ) : (
              <BookOpen size={19} />
            )}
          </span>
          <div className="session-info">
            <strong>{s.chapterTitle ?? s.subjectName}</strong>
            <span>
              {modeLabels[s.mode]} · {s.total} questions
            </span>
          </div>
          <div className="session-date">
            {shortDate(s.startedAt)}
            <small>{duration(s.durationSeconds)}</small>
          </div>
          {s.status === 'ACTIVE' ? (
            <Badge tone="indigo">Reprendre</Badge>
          ) : (
            <strong className="session-score">
              {s.score === null ? '—' : `${Math.round(s.score)} %`}
            </strong>
          )}
        </Link>
      ))}
    </div>
  );
}
