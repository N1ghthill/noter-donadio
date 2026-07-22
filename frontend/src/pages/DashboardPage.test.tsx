import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage.js';
import { RealtimeProvider } from '../realtime/RealtimeContext.js';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn() }),
}));

describe('dashboard operacional', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exibe agregados do servidor e permite alterar o período', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      periodDays: 30,
      contactsCount: 12,
      activeNegotiationsCount: 4,
      pipelineValue: '12500.5',
      overdueFollowUpsCount: 2,
      todayFollowUpsCount: 1,
      missingFollowUpsCount: 1,
      wonCount: 3,
      lostCount: 1,
      winRatePercent: '75.00',
      stages: [{ stage: 'qualified', count: 2, value: '8000' }],
      recentNegotiations: [],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<RealtimeProvider><DashboardPage /></RealtimeProvider>);

    expect(await screen.findByText(/12\.500,50/)).toBeInTheDocument();
    expect(screen.getByText('75.00%')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: '.metric-card.warning strong' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Período de conversão'), { target: { value: '90' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard?periodDays=90', expect.objectContaining({ credentials: 'include' }),
    ));
  });
});
