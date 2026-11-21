import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  FileText,
  GripVertical,
  HelpCircle,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
  AlertCircle,
} from 'lucide-react';
import { difficultyLabels, type QuestionInput, typeLabels } from '@sillage/shared';
import { toMarkdown, type ParseResult } from '@sillage/quiz-parser';
import { toast } from 'sonner';
import { api, type ChapterDetail } from './api';
import { useRefresh, useUser } from './context';
import { Badge, Button, Confirm, Dialog, Empty, ErrorState, Loading, Logo } from './ui';
import { Markdown } from './Markdown';
import { QuestionImage } from './QuestionImage';
import { blankQuestion, QuestionEditor } from './QuestionEditor';
const EXAMPLE =
  '## Qu’est-ce que le rappel actif ?\n\nID: rappel-actif-001\nNotion: Mémorisation\nDifficulté: Facile\n\n- [x] Retrouver une connaissance sans la relire\n- [ ] Relire plusieurs fois le même passage\n- [ ] Surligner les mots importants\n\n> Le rappel actif consiste à retrouver une information de mémoire.\n> Cet effort permet de vérifier ce que l’on sait réellement.\n\n## Les révisions espacées favorisent la mémorisation durable.\n\nType: vrai_faux\nNotion: Répétition espacée\n\n- [x] Vrai\n- [ ] Faux\n\n> Revenir sur une connaissance après un intervalle aide à vérifier\n> qu’elle peut être retrouvée au-delà de la séance d’apprentissage.\n';
interface Preview {
  previewText?: string;
  revision: number;
  questions: QuestionInput[];
  summary: { added: number; kept: number; changed: number; removed: number };
  changes: { statement: string; action: string }[];
}
export default function ImportPage() {
  const { id } = useParams();
  const user = useUser();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'replace' ? 'replace' : 'append';
  const navigate = useNavigate();
  const refresh = useRefresh();
  const draftKey = `sillage-draft:${user.id}:${id}:${mode}`;
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? '');
  const [tab, setTab] = useState('paste'),
    [result, setResult] = useState<ParseResult>({ questions: [], entries: [], issues: [] }),
    [parsing, setParsing] = useState(false),
    [saved, setSaved] = useState(true),
    [selected, setSelected] = useState(0),
    [edit, setEdit] = useState<number | null>(null),
    [help, setHelp] = useState(false),
    [discard, setDiscard] = useState(false),
    [serverPreview, setServerPreview] = useState<Preview | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const textRef = useRef(text);
  textRef.current = text;
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const file = useRef<HTMLInputElement>(null);
  const chapter = useQuery({
    queryKey: ['chapter', id],
    queryFn: () => api<ChapterDetail>(`/chapters/${id}`),
  });
  useEffect(() => {
    const w = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<{ id: number; result: ParseResult; error?: string }>) => {
      if (e.data.id !== generation.current) return;
      setParsing(false);
      if (e.data.error) {
        toast.error(e.data.error);
        return;
      }
      setResult(e.data.result);
      setSelected((old) => Math.min(old, Math.max(0, e.data.result.entries.length - 1)));
    };
    w.onerror = () => {
      setParsing(false);
      toast.error('L’analyse est interrompue. Rechargez la page ; votre brouillon est conservé.');
    };
    return () => {
      worker.current = null;
      w.terminate();
    };
  }, []);
  useEffect(() => {
    setServerPreview(null);
    setConfirmed(false);
    setParsing(Boolean(text));
    const seq = ++generation.current;
    const timer = setTimeout(() => {
      try {
        if (text) localStorage.setItem(draftKey, text);
        else localStorage.removeItem(draftKey);
        setSaved(true);
      } catch {
        setSaved(false);
      }
      if (!text) {
        setResult({ questions: [], entries: [], issues: [] });
        setParsing(false);
      } else worker.current?.postMessage({ text, id: seq });
    }, 300);
    return () => clearTimeout(timer);
  }, [text, draftKey]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (text && !saved) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [text, saved]);
  const preview = useMutation({
    mutationFn: async () => {
      const previewText = text;
      const p = await api<Preview>(`/chapters/${id}/imports/preview`, {
        method: 'POST',
        body: { text: previewText, mode },
      });
      return { ...p, previewText };
    },
    onSuccess: (p) => {
      if (p.previewText === textRef.current) setServerPreview(p);
    },
  });
  const commit = useMutation({
    mutationFn: () =>
      api(`/chapters/${id}/imports/commit`, {
        method: 'POST',
        body: { text: serverPreview!.previewText, mode, expectedRevision: serverPreview!.revision },
      }),
    onSuccess: () => {
      localStorage.removeItem(draftKey);
      refresh();
      toast.success(
        mode === 'replace'
          ? 'Le chapitre a été mis à jour.'
          : `${result.questions.length} questions importées.`,
      );
      navigate(`/chapters/${id}`);
    },
  });
  const blocks = () => {
    const lines = text.split('\n');
    return result.entries.map((entry, i) =>
      lines
        .slice(entry.line - 1, result.entries[i + 1] ? result.entries[i + 1]!.line - 1 : undefined)
        .join('\n')
        .trim(),
    );
  };
  const updateBlock = (index: number, question: QuestionInput) => {
    const list = blocks();
    if (index < 0) {
      list.push(toMarkdown(question));
      if (!list.length) setText(toMarkdown(question));
    } else list[index] = toMarkdown(question);
    setText(list.join('\n\n\n'));
    setEdit(null);
    setTab('paste');
    setSelected(index < 0 ? list.length - 1 : index);
  };
  const move = (index: number, dir: number) => {
    const list = blocks();
    [list[index], list[index + dir]] = [list[index + dir]!, list[index]!];
    setText(list.join('\n\n\n'));
    setSelected(index + dir);
  };
  const remove = (index: number) => {
    const list = blocks();
    list.splice(index, 1);
    setText(list.join('\n\n\n'));
  };
  const duplicate = (index: number) => {
    const entry = result.entries[index];
    if (!entry) return;
    const q = {
      ...blankQuestion,
      ...entry.draft,
      externalId: undefined,
      statement: `${entry.draft.statement} (copie)`,
    };
    const list = blocks();
    list.splice(index + 1, 0, toMarkdown(q));
    setText(list.join('\n\n\n'));
    setSelected(index + 1);
  };
  const loadFile = async (f: File) => {
    if (f.size > 5000000) {
      toast.error('Le fichier doit faire moins de 5 Mo.');
      return;
    }
    if (!/\.(md|txt)$/i.test(f.name)) {
      toast.error('Choisissez un fichier .md ou .txt.');
      return;
    }
    setText(await f.text());
    setTab('paste');
    toast.success(`${f.name} chargé dans le brouillon.`);
  };
  if (chapter.isPending) return <Loading />;
  if (chapter.isError) return <ErrorState error={chapter.error} retry={() => chapter.refetch()} />;
  const entry = result.entries[selected];
  const q = entry?.draft;
  const valid = result.questions.length > 0 && !result.issues.length && !parsing;
  return (
    <div className="import-layout">
      <header className="focus-header">
        <Link to="/" aria-label="Accueil Sillage">
          <Logo />
        </Link>
        <span className="focus-breadcrumb">
          {chapter.data.subject.name}
          <span>/</span>
          {chapter.data.title}
        </span>
        <Button variant="ghost" onClick={() => navigate(`/chapters/${id}`)}>
          <X size={17} />
          Quitter l’importation
        </Button>
      </header>
      <main className="import-main">
        <div className="import-heading">
          <div>
            <span className="eyebrow">VOTRE BIBLIOTHÈQUE S’AGRANDIT</span>
            <h1>
              {mode === 'replace'
                ? 'Faire évoluer vos questions.'
                : 'De nouvelles questions, simplement.'}
            </h1>
            <p>
              {mode === 'replace'
                ? 'Comparez le nouveau lot avant de remplacer le contenu du chapitre.'
                : 'Collez votre cours de questions. Sillage s’occupe de la structure.'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setHelp(true)}>
            <HelpCircle size={17} />
            Guide du format
          </Button>
        </div>
        <div className="import-tabs" role="tablist" aria-label="Méthode d’importation">
          {[
            { key: 'paste', label: 'Coller du texte', icon: Code2 },
            { key: 'file', label: 'Importer un fichier', icon: Upload },
            { key: 'manual', label: 'Créer manuellement', icon: Pencil },
          ].map((t) => (
            <button
              role="tab"
              aria-selected={tab === t.key}
              key={t.key}
              onClick={() => setTab(t.key)}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
          <span className={`draft-status ${!saved ? 'text-danger' : ''}`}>
            <Save size={13} />
            {!saved
              ? 'Brouillon non sauvegardé'
              : text
                ? 'Brouillon sur cet appareil'
                : 'Espace de brouillon'}
          </span>
        </div>
        {tab === 'paste' && (
          <div className="import-workbench">
            <section className="source-panel">
              <div className="panel-toolbar">
                <span>
                  <Code2 size={15} />
                  Votre Markdown
                </span>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => {
                    if (text) setHelp(true);
                    else setText(EXAMPLE);
                  }}
                >
                  Insérer un exemple
                </Button>
              </div>
              <textarea
                aria-label="Questions en Markdown"
                className="markdown-editor"
                spellCheck={false}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  '## Votre première question\n\nNotion: Un concept à retenir\n\n- [x] La bonne réponse\n- [ ] Une autre proposition\n\n> Une explication pour comprendre,\n> et mieux retenir.'
                }
              />
              <div className="editor-status">
                <span>
                  <span className="syntax-token">##</span> Question{' '}
                  <span className="syntax-token">[x]</span> Réponse{' '}
                  <span className="syntax-token">&gt;</span> Explication
                </span>
                <span>{text.length.toLocaleString('fr-FR')} caractères</span>
              </div>
            </section>
            <section className="import-preview">
              <div className="panel-toolbar">
                <span>
                  <ListChecks size={16} />
                  Aperçu du lot
                </span>
                <Badge tone={result.issues.length ? 'amber' : 'sage'}>
                  {parsing
                    ? 'Analyse…'
                    : `${result.entries.length} question${result.entries.length > 1 ? 's' : ''}`}
                </Badge>
              </div>
              {!result.entries.length ? (
                <Empty
                  title="Votre texte prend forme ici"
                  description="Chaque question devient une carte claire, prête à être révisée."
                  icon={<FileText size={25} />}
                />
              ) : (
                <>
                  <div className="import-question-picker">
                    {result.entries.map((e, i) => (
                      <button
                        key={i}
                        aria-pressed={selected === i}
                        className={e.issues.length ? 'has-issue' : ''}
                        onClick={() => setSelected(i)}
                      >
                        <span>{i + 1}</span>
                        <span>{e.draft.statement}</span>
                        {e.issues.length ? <AlertCircle size={14} /> : <Check size={14} />}
                      </button>
                    ))}
                  </div>
                  {q && (
                    <div className="question-preview-content">
                      <div className="preview-metadata">
                        <Badge>{typeLabels[q.type ?? 'SINGLE']}</Badge>
                        <span>{difficultyLabels[q.difficulty ?? 'MEDIUM']}</span>
                      </div>
                      <Markdown className="preview-statement">{q.statement ?? ''}</Markdown>
                      <QuestionImage image={q.image} />
                      {entry.issues.length > 0 && (
                        <div className="import-errors" role="alert">
                          <strong>À corriger · ligne {entry.line}</strong>
                          {entry.issues.map((e, i) => (
                            <p key={i}>{e.message}</p>
                          ))}
                        </div>
                      )}
                      <div className="preview-options">
                        {q.options?.map((o, i) => (
                          <div className={o.isCorrect ? 'is-correct' : ''} key={i}>
                            <span>
                              {o.isCorrect ? <Check size={15} /> : String.fromCharCode(65 + i)}
                            </span>
                            <Markdown>{o.text}</Markdown>
                          </div>
                        ))}
                      </div>
                      <div className="explanation-box">
                        <span className="eyebrow">L’EXPLICATION</span>
                        <Markdown>{q.explanation || '*Une explication est nécessaire.*'}</Markdown>
                      </div>
                      {q.notion && (
                        <div className="notion-label">
                          Notion <strong>{q.notion}</strong>
                        </div>
                      )}
                      <div className="preview-actions">
                        <Button size="small" variant="secondary" onClick={() => setEdit(selected)}>
                          <Pencil size={14} />
                          Modifier
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Dupliquer la question"
                          onClick={() => duplicate(selected)}
                        >
                          <Copy size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Monter la question"
                          disabled={selected === 0}
                          onClick={() => move(selected, -1)}
                        >
                          <ArrowUp size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Descendre la question"
                          disabled={selected === result.entries.length - 1}
                          onClick={() => move(selected, 1)}
                        >
                          <ArrowDown size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Retirer la question du lot"
                          onClick={() => remove(selected)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
        {tab === 'file' && (
          <div
            className="upload-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void loadFile(f);
            }}
          >
            <span className="empty-icon">
              <Upload size={27} />
            </span>
            <h2>Un fichier, des centaines de questions.</h2>
            <p>
              Glissez votre fichier Markdown ou texte ici.
              <br />
              Vous pourrez tout vérifier avant l’importation.
            </p>
            <input
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              ref={file}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
                e.target.value = '';
              }}
            />
            <Button variant="secondary" onClick={() => file.current?.click()}>
              Choisir un fichier
            </Button>
            <small>.md ou .txt · 5 Mo maximum</small>
          </div>
        )}
        {tab === 'manual' && (
          <div className="manual-container">
            <QuestionEditor
              initial={blankQuestion}
              onSave={(q) => updateBlock(-1, q)}
              onCancel={() => setTab('paste')}
            />
          </div>
        )}
        <div className="import-bottom">
          <div>
            {result.entries.length ? (
              <>
                <strong>
                  {result.entries.length} question{result.entries.length > 1 ? 's' : ''} détectée
                  {result.entries.length > 1 ? 's' : ''}
                </strong>
                <span>
                  {result.questions.filter((q) => q.type === 'SINGLE').length} simples ·{' '}
                  {result.questions.filter((q) => q.type === 'MULTIPLE').length} multiples ·{' '}
                  {result.questions.filter((q) => q.type === 'TRUE_FALSE').length} Vrai/Faux
                  {result.issues.length ? ` · ${result.issues.length} erreur(s) à corriger` : ''}
                </span>
              </>
            ) : (
              <span>Vos questions restent dans le brouillon jusqu’à votre confirmation.</span>
            )}
          </div>
          <div className="import-bottom-actions">
            {text && (
              <Button variant="ghost" onClick={() => setDiscard(true)}>
                Vider le brouillon
              </Button>
            )}
            <Button disabled={!valid} loading={preview.isPending} onClick={() => preview.mutate()}>
              <CheckCircle2 size={17} />
              Prévisualiser l’importation
            </Button>
          </div>
        </div>
      </main>
      <Dialog
        open={help}
        onOpenChange={setHelp}
        title="Un format simple, des questions claires"
        description="Chaque question commence par ##. Les explications sont obligatoires."
        wide
      >
        <div className="syntax-guide">
          <div>
            <p>
              <code>##</code> démarre une question.
            </p>
            <p>
              <code>- [x]</code> indique une bonne réponse.
            </p>
            <p>
              <code>- [ ]</code> indique une autre proposition.
            </p>
            <p>
              <code>&gt;</code> introduit l’explication, sur une ou plusieurs lignes.
            </p>
            <p>
              <code>ID:</code> conserve le lien entre deux versions d’une question.
            </p>
            <p>Notion, difficulté, formules LaTeX et blocs de code sont pris en charge.</p>
          </div>
          <pre>{EXAMPLE}</pre>
        </div>
        <div className="dialog-actions">
          <Button
            variant="secondary"
            onClick={() => {
              navigator.clipboard
                .writeText(EXAMPLE)
                .then(() => toast.success('Exemple copié.'))
                .catch(() =>
                  toast.error('La copie est indisponible. Sélectionnez le texte de l’exemple.'),
                );
            }}
          >
            <Copy size={15} />
            Copier l’exemple
          </Button>
          {!text && (
            <Button
              onClick={() => {
                setText(EXAMPLE);
                setHelp(false);
              }}
            >
              Utiliser cet exemple
            </Button>
          )}
        </div>
      </Dialog>
      {edit !== null && (
        <Dialog open onOpenChange={() => setEdit(null)} title="Affiner cette question" wide>
          <QuestionEditor
            initial={result.entries[edit]?.draft ?? blankQuestion}
            onSave={(q) => updateBlock(edit, q)}
            onCancel={() => setEdit(null)}
          />
        </Dialog>
      )}
      <Dialog
        open={Boolean(serverPreview)}
        onOpenChange={(open) => {
          if (!open && !commit.isPending) setServerPreview(null);
        }}
        title={mode === 'replace' ? 'Vérifier le remplacement' : 'Tout est prêt pour l’importation'}
        description={
          mode === 'replace'
            ? 'Les questions inchangées gardent leur progression. Une question modifiée repart comme nouvelle, avec son ancien historique conservé.'
            : 'Le serveur a validé votre lot. Confirmez pour l’enregistrer dans votre chapitre.'
        }
        wide
      >
        {serverPreview && (
          <>
            <div className="diff-summary">
              {[
                ['Conservées', serverPreview.summary.kept],
                ['Ajoutées', serverPreview.summary.added],
                ['Modifiées', serverPreview.summary.changed],
                ['Supprimées', serverPreview.summary.removed],
              ].map(([label, n]) => (
                <div key={label}>
                  <strong>{n}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="diff-list">
              {serverPreview.changes.map((change, i) => (
                <div key={i}>
                  <Badge
                    tone={
                      change.action === 'removed'
                        ? 'amber'
                        : change.action === 'added'
                          ? 'sage'
                          : 'neutral'
                    }
                  >
                    {
                      {
                        added: 'Ajout',
                        changed: 'Modification',
                        kept: 'Conservée',
                        removed: 'Suppression',
                      }[change.action]
                    }
                  </Badge>
                  <span>{change.statement}</span>
                </div>
              ))}
            </div>
            {mode === 'replace' && (
              <label className="checkbox-label replacement-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Je confirme le remplacement de ce chapitre et les changements ci-dessus.
              </label>
            )}
            <div className="dialog-actions">
              <Button
                variant="secondary"
                disabled={commit.isPending}
                onClick={() => setServerPreview(null)}
              >
                Revenir au brouillon
              </Button>
              <Button
                disabled={mode === 'replace' && !confirmed}
                loading={commit.isPending}
                onClick={() => commit.mutate()}
              >
                {mode === 'replace'
                  ? 'Confirmer le remplacement'
                  : `Importer les ${serverPreview.questions.length} questions`}
              </Button>
            </div>
          </>
        )}
      </Dialog>
      <Confirm
        open={discard}
        onOpenChange={setDiscard}
        title="Vider ce brouillon ?"
        description="Le texte et les modifications de ce lot seront effacés de cet appareil. Les questions déjà enregistrées dans le chapitre ne sont pas concernées."
        label="Vider le brouillon"
        onConfirm={() => {
          setText('');
          setDiscard(false);
        }}
      />
    </div>
  );
}
