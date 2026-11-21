import {
  MAX_QUESTION_IMAGE_BYTES,
  QUESTION_IMAGE_TYPES,
  questionImageSchema,
  type QuestionImageData,
} from '@sillage/shared';

function asDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Impossible de lire cette image.'));
    reader.readAsDataURL(file);
  });
}

export async function prepareQuestionImage(file: File): Promise<QuestionImageData> {
  if (!QUESTION_IMAGE_TYPES.some((type) => type === file.type))
    throw new Error('Choisissez une image PNG, JPEG ou WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('L’image doit faire moins de 10 Mo.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Cette image ne peut pas être ouverte. Choisissez un autre fichier.');
  }
  try {
    if (file.size <= MAX_QUESTION_IMAGE_BYTES && Math.max(bitmap.width, bitmap.height) <= 1600) {
      const original = questionImageSchema.safeParse({ src: await asDataUrl(file), alt: '' });
      if (original.success) return original.data;
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Impossible de préparer l’image dans ce navigateur.');
    for (const side of [1600, 1280, 1024, 800]) {
      const scale = Math.min(1, side / bitmap.width, side / bitmap.height);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.75]) {
        const image = questionImageSchema.safeParse({
          src: canvas.toDataURL('image/webp', quality),
          alt: '',
        });
        if (image.success) return image.data;
      }
    }
    throw new Error('L’image est encore trop volumineuse. Recadrez-la ou réduisez sa résolution.');
  } finally {
    bitmap.close();
  }
}
