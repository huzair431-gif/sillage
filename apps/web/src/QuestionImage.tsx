import { useMemo, useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { questionImageSchema, type QuestionImageData } from '@sillage/shared';
import { Dialog } from './ui';

export function QuestionImage({
  image,
  onOpenChange,
}: {
  image?: QuestionImageData | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const supported = useMemo(
    () => Boolean(image && questionImageSchema.safeParse(image).success),
    [image?.src, image?.alt],
  );
  if (!image) return null;
  if (!supported)
    return (
      <p className="field-error" role="status">
        Cette image n’est pas dans un format pris en charge.
      </p>
    );
  const change = (value: boolean) => {
    setOpen(value);
    onOpenChange?.(value);
  };
  if (failed === image.src)
    return (
      <p className="field-error" role="status">
        Impossible d’afficher l’image de cette question.
      </p>
    );
  const description = image.alt || 'Illustration de la question';
  return (
    <>
      <figure className="question-illustration">
        <button
          type="button"
          onClick={() => change(true)}
          aria-label="Agrandir l’image de la question"
        >
          <img
            src={image.src}
            alt={description}
            onError={() => {
              setFailed(image.src);
              change(false);
            }}
          />
        </button>
        <figcaption>
          <span>{image.alt || 'Image de la question'}</span>
          <span>
            <ZoomIn size={14} aria-hidden="true" /> Agrandir
          </span>
        </figcaption>
      </figure>
      <Dialog open={open} onOpenChange={change} title={description} wide>
        <img className="question-image-full" src={image.src} alt={description} />
      </Dialog>
    </>
  );
}
