import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Button, Dialog } from '../apps/web/src/ui';
import { QuestionEditor, blankQuestion } from '../apps/web/src/QuestionEditor';
import { QuestionImage } from '../apps/web/src/QuestionImage';
import { questionImage } from './fixtures/question-image';
afterEach(cleanup);
describe('éditeur visuel accessible', () => {
  const illustrated = {
    ...blankQuestion,
    statement: 'Que représente ce schéma ?',
    explanation: 'Une explication complète.',
    image: questionImage,
    options: [
      { text: 'A', isCorrect: true },
      { text: 'B', isCorrect: false },
    ],
  };
  it('ne charge pas de lien externe dans un aperçu d’image invalide', () => {
    render(
      <QuestionImage image={{ src: 'https://example.com/image.png', alt: 'Image externe' }} />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('format pris en charge');
  });
  it('préserve une image et sa description lors de l’enregistrement', async () => {
    const save = vi.fn();
    render(<QuestionEditor initial={illustrated} onSave={save} onCancel={() => {}} />);
    expect(screen.getByRole('img', { name: questionImage.alt })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Description de l’image'), {
      target: { value: 'Repères A et B' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer', exact: true }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[0].image).toEqual({ ...questionImage, alt: 'Repères A et B' });
  });
  it('permet de retirer une image sans retirer la question', async () => {
    const save = vi.fn();
    render(<QuestionEditor initial={illustrated} onSave={save} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer l’image' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer', exact: true }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[0].image).toBeNull();
    expect(save.mock.calls[0]?.[0].statement).toBe(illustrated.statement);
  });
  it('refuse un format d’image non pris en charge avec une erreur lisible', async () => {
    render(<QuestionEditor initial={blankQuestion} onSave={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Choisir une image pour la question'), {
      target: { files: [new File(['<svg></svg>'], 'image.svg', { type: 'image/svg+xml' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG, JPEG ou WebP');
  });
  it('agrandit une illustration et signale l’ouverture puis la fermeture', async () => {
    const change = vi.fn();
    render(<QuestionImage image={questionImage} onOpenChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir l’image de la question' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('img', { name: questionImage.alt })).toBeVisible();
    expect(change).toHaveBeenLastCalledWith(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    expect(change).toHaveBeenLastCalledWith(false);
  });
  it('garde le début des corrections lisible et restitue le focus au déclencheur', async () => {
    function Example() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Ouvrir la correction</button>
          <Dialog open={open} mandatory title="Une correction longue">
            <p>Le début de l’explication.</p>
            <button onClick={() => setOpen(false)}>J’ai compris</button>
          </Dialog>
        </>
      );
    }
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Ouvrir la correction' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'J’ai compris' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it('rend les boutons liens sans rompre la navigation', () => {
    render(
      <Button asChild>
        <a href="/subjects">Mes matières</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Mes matières' })).toHaveAttribute('href', '/subjects');
  });
  it('bloque une question sans explication et affiche une erreur lisible', async () => {
    const save = vi.fn();
    render(
      <QuestionEditor
        initial={{
          ...blankQuestion,
          statement: 'Question',
          options: [
            { text: 'A', isCorrect: true },
            { text: 'B', isCorrect: false },
          ],
        }}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Une explication est obligatoire.');
    expect(save).not.toHaveBeenCalled();
  });
  it('génère les choix Vrai/Faux et enregistre le modèle commun', async () => {
    const save = vi.fn();
    render(
      <QuestionEditor
        initial={{
          ...blankQuestion,
          statement: 'Une affirmation',
          explanation: 'La justification.',
        }}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Type de question'), {
      target: { value: 'TRUE_FALSE' },
    });
    expect(screen.getByLabelText('Texte de la proposition 1')).toHaveValue('Vrai');
    expect(screen.getByLabelText('Texte de la proposition 2')).toHaveValue('Faux');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[0].type).toBe('TRUE_FALSE');
  });
  it('affiche le Markdown et le LaTeX dans un dialogue de prévisualisation', async () => {
    render(
      <QuestionEditor
        initial={{
          ...blankQuestion,
          statement: 'Le **speedup** est $S=2$.',
          explanation: 'Une formule.',
        }}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(await screen.findByText('speedup', {}, { timeout: 10000 })).toBeVisible();
    await waitFor(() => expect(document.querySelector('.katex')).toBeInTheDocument());
  }, 15000);
});
