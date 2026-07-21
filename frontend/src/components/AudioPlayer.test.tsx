import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AudioPlayer } from './AudioPlayer.js';

describe('player de áudio privado', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('busca acesso somente após ação da pessoa e usa a URL assinada', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: '/api/media/message-1/content?expires=123&signature=assinatura',
      expiresAt: '2026-07-21T12:02:00.000Z',
      mimeType: 'audio/wav',
      durationSeconds: 1,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<AudioPlayer messageId="message-1" playbackAvailable />);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar áudio' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/media/message-1/access',
      expect.objectContaining({ credentials: 'include' }),
    ));
    expect(container.querySelector('audio')).toHaveAttribute(
      'src',
      '/api/media/message-1/content?expires=123&signature=assinatura',
    );
  });

  it('não solicita acesso quando a retenção tornou o áudio indisponível', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<AudioPlayer messageId="message-1" playbackAvailable={false} />);

    expect(screen.getByText('Áudio indisponível ou removido pela retenção.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
