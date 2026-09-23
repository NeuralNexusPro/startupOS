import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JevProviderSection, type JevProviderSectionHandle } from '../JevProviderSection';

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), clear: vi.fn() }));
vi.mock('@/services/jevProviderService', () => ({ getJevProvider: api.get, updateJevProvider: api.update, clearJevProviderCredential: api.clear }));
const summary = { enabled: false, baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', credentialConfigured: true, credentialSource: 'secure-store' as const };

describe('JevProviderSection', () => {
  beforeEach(() => { api.get.mockResolvedValue(summary); api.update.mockResolvedValue({ ...summary, enabled: true }); api.clear.mockResolvedValue({ ...summary, enabled: false, credentialConfigured: false, credentialSource: undefined }); vi.spyOn(window, 'confirm').mockReturnValue(true); });

  it('loads a summary, enables, submits a write-only key, and clears the input', async () => {
    render(<JevProviderSection />);
    await screen.findByText('已由安全存储配置');
    fireEvent.click(screen.getByRole('switch', { name: '启用 Jev 决策模型' }));
    fireEvent.change(screen.getByLabelText('Jev API Key'), { target: { value: 'ui-secret-marker' } });
    fireEvent.click(screen.getByRole('button', { name: '保存 Jev 配置' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, apiKey: 'ui-secret-marker' })));
    expect(screen.getByLabelText('Jev API Key')).toHaveValue('');
    expect(localStorage.length).toBe(0);
  });

  it('omits an empty key, confirms clear, and exposes status/error semantics', async () => {
    render(<JevProviderSection />); await screen.findByText('已由安全存储配置');
    fireEvent.click(screen.getByRole('button', { name: '保存 Jev 配置' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.not.objectContaining({ apiKey: expect.anything() })));
    api.update.mockRejectedValueOnce(new Error('SECURE_STORAGE_UNAVAILABLE'));
    fireEvent.click(screen.getByRole('button', { name: '保存 Jev 配置' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('不能安全保存');
    fireEvent.click(screen.getByRole('button', { name: '清除 Jev 凭据' }));
    await waitFor(() => expect(api.clear).toHaveBeenCalledTimes(1));
    expect(window.confirm).toHaveBeenCalled();
  });

  it('exposes its save operation for the dialog-level save button', async () => {
    const ref = React.createRef<JevProviderSectionHandle>();
    render(<JevProviderSection ref={ref} />);
    await screen.findByText('已由安全存储配置');
    fireEvent.click(screen.getByRole('switch', { name: '启用 Jev 决策模型' }));
    fireEvent.change(screen.getByLabelText('Jev API Key'), { target: { value: 'outer-secret-marker' } });
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });
    expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, apiKey: 'outer-secret-marker' }));
  });
});
