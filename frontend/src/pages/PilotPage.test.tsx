import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PilotPage } from './PilotPage.js';

describe('checklist do piloto', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('orienta as jornadas e preserva marcações somente no navegador', () => {
    render(<MemoryRouter><PilotPage /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: '0 de 6 jornadas validadas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir conversas' })).toHaveAttribute('href', '/conversas?period=all');
    fireEvent.click(screen.getByRole('checkbox', { name: /Jornada 1/ }));
    expect(screen.getByRole('heading', { name: '1 de 6 jornadas validadas' })).toBeInTheDocument();
    expect(window.localStorage.getItem('noter-pilot-checklist-v1')).toContain('access');
  });

  it('reinicia somente depois da confirmação', () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    render(<MemoryRouter><PilotPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('checkbox', { name: /Jornada 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar marcações' }));
    expect(screen.getByRole('heading', { name: '1 de 6 jornadas validadas' })).toBeInTheDocument();
  });
});
