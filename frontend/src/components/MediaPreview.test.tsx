import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaPreview } from './MediaPreview.js';

describe('pré-visualização privada de mídia', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('só solicita a URL curta da imagem após ação do usuário', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: '/api/media/message-1/content?expires=123&signature=synthetic',
      expiresAt: '2026-07-29T12:02:00.000Z',
      mimeType: 'image/jpeg',
      durationSeconds: null,
      fileName: 'imagem.jpg',
      disposition: 'inline',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<MediaPreview messageId="message-1" messageType="image" fileName="imagem.jpg" />);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ver imagem' }));
    const image = await screen.findByRole('img', { name: 'Pré-visualização de imagem.jpg' });
    expect(image).toHaveAttribute('src', '/api/media/message-1/content?expires=123&signature=synthetic');
  });

  it('prepara documento como download autenticado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: '/api/media/message-2/content?expires=123&signature=synthetic',
      expiresAt: '2026-07-29T12:02:00.000Z',
      mimeType: 'application/pdf',
      durationSeconds: null,
      fileName: 'proposta.pdf',
      disposition: 'attachment',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    render(<MediaPreview messageId="message-2" messageType="document" fileName="proposta.pdf" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar download' }));
    expect(await screen.findByRole('link', { name: 'Baixar documento' })).toHaveAttribute(
      'download',
      'proposta.pdf',
    );
  });
});
