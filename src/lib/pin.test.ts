import { describe, it, expect, vi } from 'vitest';

vi.mock('./functions', () => ({ callFunction: vi.fn() }));

async function freshPin() {
  vi.resetModules();
  return import('./pin');
}

const pinError = (pin: string, message = 'PIN requerido') => Object.assign(new Error(message), { details: { pin } });
const tick = () => new Promise((r) => setTimeout(r, 0));

async function answerPrompt(mod: Awaited<ReturnType<typeof freshPin>>, pin: string | null) {
  await tick();
  const prompt = mod.peekPinPrompt();
  if (!prompt.open || !prompt.resolve) throw new Error('No open PIN prompt');
  prompt.resolve(pin);
}

describe('withPin', () => {
  it('runs once without prompting when the server does not ask for a PIN', async () => {
    const mod = await freshPin();
    const call = vi.fn().mockResolvedValue('ok');
    await expect(mod.withPin('aprobar', call)).resolves.toBe('ok');
    expect(call).toHaveBeenCalledWith(undefined);
    expect(mod.peekPinPrompt().open).toBe(false);
  });

  it('prompts on "required", retries with the PIN and reuses it within 2 minutes', async () => {
    const mod = await freshPin();
    const call = vi.fn().mockRejectedValueOnce(pinError('required')).mockResolvedValue('ok');
    const result = mod.withPin('aprobar', call);
    await answerPrompt(mod, '4829');
    await expect(result).resolves.toBe('ok');
    expect(call).toHaveBeenLastCalledWith('4829');

    const next = vi.fn().mockResolvedValue('again');
    await mod.withPin('aprobar', next);
    expect(next).toHaveBeenCalledWith('4829');
  });

  it('shows the server error and asks again on "invalid"', async () => {
    const mod = await freshPin();
    const call = vi
      .fn()
      .mockRejectedValueOnce(pinError('required'))
      .mockRejectedValueOnce(pinError('invalid', 'PIN incorrecto. Te quedan 4 intentos'))
      .mockResolvedValue('ok');
    const result = mod.withPin('rechazar', call);
    await answerPrompt(mod, '1111');
    await tick();
    expect(mod.peekPinPrompt().error).toMatch(/incorrecto/);
    await answerPrompt(mod, '4829');
    await expect(result).resolves.toBe('ok');
  });

  it('throws PinCancelled when the prompt is dismissed', async () => {
    const mod = await freshPin();
    const result = mod.withPin('eliminar', vi.fn().mockRejectedValue(pinError('required')));
    await answerPrompt(mod, null);
    await expect(result).rejects.toBeInstanceOf(mod.PinCancelled);
  });

  it('shares a single prompt between concurrent calls', async () => {
    const mod = await freshPin();
    const make = () => vi.fn().mockRejectedValueOnce(pinError('required')).mockResolvedValue('ok');
    const a = make();
    const b = make();
    const both = Promise.all([mod.withPin('aprobar', a), mod.withPin('aprobar', b)]);
    await answerPrompt(mod, '4829');
    await expect(both).resolves.toEqual(['ok', 'ok']);
    expect(a).toHaveBeenLastCalledWith('4829');
    expect(b).toHaveBeenLastCalledWith('4829');
  });

  it('propagates locked/unset errors without prompting', async () => {
    const mod = await freshPin();
    await expect(mod.withPin('aprobar', vi.fn().mockRejectedValue(pinError('locked', 'bloqueado')))).rejects.toThrow('bloqueado');
    expect(mod.peekPinPrompt().open).toBe(false);
  });
});
