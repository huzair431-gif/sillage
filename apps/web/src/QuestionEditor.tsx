import { useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { questionSchema, type QuestionInput, typeLabels, difficultyLabels } from '@sillage/shared';
import type { z } from 'zod';
import { ArrowDown, ArrowUp, Check, Eye, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button, Dialog, Field } from './ui';
import { Markdown } from './Markdown';
import { QuestionImage } from './QuestionImage';
import { prepareQuestionImage } from './question-image';
export const blankQuestion: QuestionInput = {
  statement: '',
  type: 'SINGLE',
  notion: '',
  difficulty: 'MEDIUM',
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
  ],
  explanation: '',
};
export function QuestionEditor({
  initial,
  onSave,
  onCancel,
  loading = false,
}: {
  initial: Partial<QuestionInput>;
  onSave: (q: QuestionInput) => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState('');
  const imageInput = useRef<HTMLInputElement>(null);
  const form = useForm<z.input<typeof questionSchema>, unknown, QuestionInput>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      ...blankQuestion,
      ...initial,
      options: initial.options?.length ? initial.options : blankQuestion.options,
    },
  });
  const options = useFieldArray({ control: form.control, name: 'options' });
  const values = form.watch();
  const type = values.type;
  const setType = (next: QuestionInput['type']) => {
    form.setValue('type', next);
    if (next === 'TRUE_FALSE')
      options.replace([
        { text: 'Vrai', isCorrect: true },
        { text: 'Faux', isCorrect: false },
      ]);
    else if (next === 'SINGLE') {
      const first = values.options.findIndex((o) => o.isCorrect);
      values.options.forEach((_, i) =>
        form.setValue(`options.${i}.isCorrect`, i === (first < 0 ? 0 : first)),
      );
    } else if (values.options.filter((o) => o.isCorrect).length < 2) {
      form.setValue('options.0.isCorrect', true);
      form.setValue('options.1.isCorrect', true);
    }
  };
  return (
    <form className="question-editor" onSubmit={form.handleSubmit(onSave)}>
      <Field label="Énoncé" error={form.formState.errors.statement?.message}>
        <textarea
          rows={3}
          placeholder="Quelle connaissance souhaitez-vous retrouver ?"
          {...form.register('statement')}
        />
      </Field>
      <div className="field question-image-editor">
        <span>
          Image de la question <small className="muted">· Facultatif</small>
        </span>
        <input
          ref={imageInput}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Choisir une image pour la question"
          disabled={imageLoading || loading}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setImageLoading(true);
            setImageError('');
            try {
              const image = await prepareQuestionImage(file);
              form.setValue('image', image, { shouldDirty: true, shouldValidate: true });
            } catch (error) {
              setImageError(
                error instanceof Error ? error.message : 'Impossible de charger cette image.',
              );
            } finally {
              setImageLoading(false);
            }
          }}
        />
        <QuestionImage image={values.image as QuestionInput['image']} />
        <div className="question-image-actions">
          <Button
            type="button"
            variant="secondary"
            loading={imageLoading}
            disabled={loading}
            onClick={() => imageInput.current?.click()}
          >
            <ImagePlus size={17} />
            {values.image ? 'Remplacer l’image' : 'Ajouter une image'}
          </Button>
          {values.image && (
            <Button
              type="button"
              variant="ghost"
              disabled={imageLoading || loading}
              onClick={() => {
                form.setValue('image', null, { shouldDirty: true, shouldValidate: true });
                setImageError('');
              }}
            >
              <Trash2 size={16} /> Retirer l’image
            </Button>
          )}
        </div>
        <small className="muted">
          PNG, JPEG ou WebP · 10 Mo maximum. Les grandes images sont optimisées automatiquement.
        </small>
        {imageError && (
          <p className="field-error" role="alert">
            {imageError}
          </p>
        )}
        {form.formState.errors.image && (
          <p className="field-error" role="alert">
            Vérifiez l’image et sa description.
          </p>
        )}
      </div>
      {values.image && (
        <Field
          label="Description de l’image"
          hint="Décrivez ce qu’elle représente, sans dévoiler la réponse."
        >
          <input
            {...form.register('image.alt')}
            maxLength={300}
            placeholder="Ex. Schéma d’un circuit électrique"
          />
        </Field>
      )}
      <div className="form-row">
        <Field label="Type de question">
          <select value={type} onChange={(e) => setType(e.target.value as QuestionInput['type'])}>
            {Object.entries(typeLabels).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Difficulté">
          <select {...form.register('difficulty')}>
            {Object.entries(difficultyLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Notion">
          <input {...form.register('notion')} placeholder="Le concept étudié" />
        </Field>
        <Field
          label="Identifiant stable (facultatif)"
          error={form.formState.errors.externalId?.message}
        >
          <input
            {...form.register('externalId', { setValueAs: (v) => v.trim() || undefined })}
            placeholder="ex. notion-001"
          />
        </Field>
      </div>
      <div className="field">
        <span>
          Propositions <small className="muted">· Cochez les bonnes réponses</small>
        </span>
        <div className="editor-options">
          {options.fields.map((option, i) => (
            <div className="editor-option" key={option.id}>
              <input
                type={type === 'MULTIPLE' ? 'checkbox' : 'radio'}
                name="correct-answer"
                aria-label={`Proposition ${i + 1} correcte`}
                checked={Boolean(values.options[i]?.isCorrect)}
                onChange={(e) => {
                  if (type === 'MULTIPLE')
                    form.setValue(`options.${i}.isCorrect`, e.target.checked);
                  else
                    values.options.forEach((_, j) =>
                      form.setValue(`options.${j}.isCorrect`, i === j),
                    );
                }}
              />
              <textarea
                rows={1}
                aria-label={`Texte de la proposition ${i + 1}`}
                {...form.register(`options.${i}.text`)}
                readOnly={type === 'TRUE_FALSE'}
              />
              {type !== 'TRUE_FALSE' && (
                <div className="option-tools">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Monter la proposition ${i + 1}`}
                    disabled={i === 0}
                    onClick={() => options.move(i, i - 1)}
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Descendre la proposition ${i + 1}`}
                    disabled={i === options.fields.length - 1}
                    onClick={() => options.move(i, i + 1)}
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Supprimer la proposition ${i + 1}`}
                    disabled={options.fields.length <= 2}
                    onClick={() => options.remove(i)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
        {type !== 'TRUE_FALSE' && (
          <Button
            type="button"
            variant="ghost"
            size="small"
            disabled={options.fields.length >= 12}
            onClick={() => options.append({ text: '', isCorrect: false })}
          >
            <Plus size={16} />
            Ajouter une proposition
          </Button>
        )}
        {form.formState.errors.options && (
          <small className="field-error" role="alert">
            {form.formState.errors.options.message ??
              form.formState.errors.options.root?.message ??
              'Complétez toutes les propositions et vérifiez les bonnes réponses.'}
          </small>
        )}
      </div>
      <Field
        label="Explication"
        hint="Markdown, code et formules LaTeX sont acceptés."
        error={form.formState.errors.explanation?.message}
      >
        <textarea
          rows={4}
          placeholder="Pourquoi cette réponse est-elle correcte ?"
          {...form.register('explanation')}
        />
      </Field>
      <div className="dialog-actions">
        <Button type="button" variant="ghost" onClick={() => setPreview(!preview)}>
          <Eye size={17} />
          Prévisualiser
        </Button>
        <span className="spacer" />
        <Button type="button" variant="secondary" disabled={imageLoading} onClick={onCancel}>
          Annuler
        </Button>
        <Button loading={loading || imageLoading} type="submit">
          <Check size={17} />
          Enregistrer
        </Button>
      </div>
      <Dialog open={preview} onOpenChange={setPreview} title="Aperçu de la question">
        <Markdown>{values.statement || 'Votre énoncé'}</Markdown>
        <QuestionImage image={values.image as QuestionInput['image']} />
        <div className="preview-options">
          {values.options.map((o, i) => (
            <div key={i} className={o.isCorrect ? 'is-correct' : ''}>
              <span>{o.isCorrect ? <Check size={15} /> : String.fromCharCode(65 + i)}</span>
              <Markdown>{o.text || 'Proposition'}</Markdown>
            </div>
          ))}
        </div>
        <div className="explanation-box">
          <Markdown>{values.explanation || 'Votre explication'}</Markdown>
        </div>
      </Dialog>
    </form>
  );
}
