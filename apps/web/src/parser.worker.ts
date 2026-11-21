import { parseQuestions } from '@sillage/quiz-parser';
self.onmessage = (e: MessageEvent<{ text: string; id: number }>) => {
  try {
    self.postMessage({ id: e.data.id, result: parseQuestions(e.data.text) });
  } catch {
    self.postMessage({
      id: e.data.id,
      error: 'Le texte n’a pas pu être analysé. Vérifiez sa structure Markdown.',
    });
  }
};
