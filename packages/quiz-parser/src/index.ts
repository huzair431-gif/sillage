import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { RootContent, Heading, List, Blockquote } from 'mdast';
import { questionSchema, type QuestionInput } from '@sillage/shared';

export interface ParseIssue {
  question: number;
  line: number;
  message: string;
}
export interface ParsedQuestion {
  question: QuestionInput | null;
  draft: Partial<QuestionInput>;
  line: number;
  issues: ParseIssue[];
}
export interface ParseResult {
  questions: QuestionInput[];
  entries: ParsedQuestion[];
  issues: ParseIssue[];
}
const parser = unified().use(remarkParse).use(remarkGfm);
function source(node: Pick<RootContent, 'position'>, text: string) {
  return text.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0);
}
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
const typeMap: Record<string, QuestionInput['type']> = {
  simple: 'SINGLE',
  qcm_simple: 'SINGLE',
  single: 'SINGLE',
  multiple: 'MULTIPLE',
  qcm_multiple: 'MULTIPLE',
  vrai_faux: 'TRUE_FALSE',
  'vrai/faux': 'TRUE_FALSE',
  true_false: 'TRUE_FALSE',
};
const difficultyMap: Record<string, QuestionInput['difficulty']> = {
  facile: 'EASY',
  easy: 'EASY',
  moyen: 'MEDIUM',
  moyenne: 'MEDIUM',
  medium: 'MEDIUM',
  difficile: 'HARD',
  hard: 'HARD',
};

/** AST Markdown : seuls les titres de niveau 2 hors code délimitent les questions. */
export function parseQuestions(raw: string): ParseResult {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const tree = parser.parse(text);
  const blocks: { heading: Heading; nodes: RootContent[] }[] = [];
  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth === 2) blocks.push({ heading: node, nodes: [] });
    else blocks.at(-1)?.nodes.push(node);
  }
  if (!blocks.length)
    return {
      questions: [],
      entries: [],
      issues: [
        {
          question: 0,
          line: 1,
          message: 'Aucune question détectée. Commencez chaque question par « ## Énoncé ».',
        },
      ],
    };
  const ids = new Set<string>();
  const fingerprints = new Set<string>();
  const entries = blocks.map(({ heading, nodes }, index): ParsedQuestion => {
    const line = heading.position?.start.line ?? 1;
    const issues: ParseIssue[] = [];
    const problem = (message: string, at = line) =>
      issues.push({ question: index + 1, line: at, message });
    const statement: string[] = [
      source(heading, text)
        .replace(/^ {0,3}##\s+/, '')
        .replace(/\s+#+\s*$/, ''),
    ];
    const explanations: string[] = [];
    const options: QuestionInput['options'] = [];
    let externalId: string | undefined;
    let notion = '';
    let difficulty: QuestionInput['difficulty'] = 'MEDIUM';
    let explicit: QuestionInput['type'] | undefined;
    let foundOptions = false;
    let image: QuestionInput['image'];
    for (const node of nodes) {
      if (node.type === 'list') {
        const list = node as List;
        if (list.children.some((c) => typeof c.checked === 'boolean')) {
          foundOptions = true;
          for (const item of list.children) {
            if (typeof item.checked !== 'boolean') {
              problem(
                'Chaque proposition doit commencer par - [ ] ou - [x].',
                item.position?.start.line,
              );
              continue;
            }
            const body = text.slice(
              item.position?.start.offset ?? 0,
              item.position?.end.offset ?? 0,
            );
            const firstIndent = body.split('\n')[1]?.match(/^\s*/)?.[0].length ?? 0;
            const value = body
              .replace(/^\s*[-+*]\s+\[[xX ]\]\s*/, '')
              .split('\n')
              .map((s, i) =>
                i ? s.slice(Math.min(firstIndent, s.match(/^\s*/)?.[0].length ?? 0)) : s,
              )
              .join('\n')
              .trim();
            options.push({ text: value, isCorrect: item.checked });
          }
          continue;
        }
      }
      if (node.type === 'blockquote') {
        explanations.push(
          source(node as Blockquote, text)
            .split('\n')
            .map((s) => s.replace(/^ {0,3}> ?/, ''))
            .join('\n'),
        );
        continue;
      }
      if (node.type === 'paragraph' && !foundOptions) {
        let paragraph = source(node, text);
        for (const illustration of node.children) {
          if (illustration.type !== 'image') continue;
          if (image)
            problem(
              'Une seule image est acceptée par question.',
              illustration.position?.start.line,
            );
          else image = { src: illustration.url, alt: illustration.alt ?? '' };
          paragraph = paragraph.replace(source(illustration, text), '');
        }
        const remaining: string[] = [];
        for (const value of paragraph.split('\n')) {
          const match = value.match(/^\s*(ID|Notion|Difficult[eé]|Type)\s*:\s*(.*?)\s*$/i);
          if (!match) {
            remaining.push(value);
            continue;
          }
          const key = fold(match[1]!);
          const val = match[2]!;
          if (key === 'id') externalId = val;
          if (key === 'notion') notion = val;
          if (key === 'difficulte') {
            const d = difficultyMap[fold(val)];
            if (d) difficulty = d;
            else problem(`Difficulté inconnue : « ${val} ».`);
          }
          if (key === 'type') {
            explicit = typeMap[fold(val).replace(/\s+/g, '_')];
            if (!explicit) problem(`Type inconnu : « ${val} ».`);
          }
        }
        if (remaining.join('\n').trim()) statement.push(remaining.join('\n'));
      } else if (!foundOptions) statement.push(source(node, text));
      else if (node.type !== 'thematicBreak')
        problem(
          'Après les propositions, précédez chaque ligne d’explication par >.',
          node.position?.start.line,
        );
    }
    const correct = options.filter((o) => o.isCorrect).length;
    const tf =
      options.length === 2 &&
      options.some((o) => fold(o.text) === 'vrai') &&
      options.some((o) => fold(o.text) === 'faux');
    const draft = {
      statement: statement.join('\n\n').trim(),
      ...(image ? { image } : {}),
      explanation: explanations.join('\n\n').trim(),
      options,
      type: explicit ?? (tf ? 'TRUE_FALSE' : correct > 1 ? 'MULTIPLE' : 'SINGLE'),
      notion,
      difficulty,
      ...(externalId ? { externalId } : {}),
    };
    const parsed = questionSchema.safeParse(draft);
    if (!parsed.success)
      for (const err of parsed.error.issues)
        problem(`${err.path.join('.') ? err.path.join('.') + ' : ' : ''}${err.message}`);
    if (externalId) {
      if (ids.has(externalId))
        problem(`L’identifiant « ${externalId} » est utilisé plusieurs fois.`);
      ids.add(externalId);
    }
    const fingerprint = JSON.stringify(draft);
    if (fingerprints.has(fingerprint))
      problem('Cette question est présente plusieurs fois dans le lot.');
    fingerprints.add(fingerprint);
    return { question: parsed.success && !issues.length ? parsed.data : null, draft, line, issues };
  });
  return {
    questions: entries.flatMap((e) => (e.question ? [e.question] : [])),
    entries,
    issues: entries.flatMap((e) => e.issues),
  };
}

export function toMarkdown(q: QuestionInput): string {
  const image = q.image ? `![${q.image.alt.replace(/[\\[\]]/g, '\\$&')}](${q.image.src})\n\n` : '';
  return `## ${q.statement}\n\n${image}${q.externalId ? `ID: ${q.externalId}\n` : ''}Type: ${q.type.toLowerCase()}\nNotion: ${q.notion}\nDifficulté: ${q.difficulty.toLowerCase()}\n\n${q.options.map((o) => `- [${o.isCorrect ? 'x' : ' '}] ${o.text.replace(/\n/g, '\n  ')}`).join('\n')}\n\n${q.explanation
    .split('\n')
    .map((s) => `> ${s}`)
    .join('\n')}\n`;
}
