import { describe, it, expect } from 'vitest';
import { buildReceiptPrompt, isTransientGeminiError, postProcessExtraction } from './gemini.logic';

describe('postProcessExtraction', () => {
  it('strips markdown fences and parses the JSON object', () => {
    const out = postProcessExtraction('```json\n{"merchant":"Uber","amount":12.5}\n```', []);
    expect(out).toEqual({ merchant: 'Uber', amount: 12.5 });
  });

  it('overrides VARIOS with GASOLINA for fuel merchants when the category exists', () => {
    const out = postProcessExtraction('{"merchant":"Terpel Av 68","category":"VARIOS"}', ['GASOLINA', 'VARIOS']);
    expect(out.category).toBe('GASOLINA');
  });

  it('keeps the model category when it is not VARIOS', () => {
    const out = postProcessExtraction('{"merchant":"Terpel","category":"TRANSPORTE TERRESTRE"}', ['GASOLINA']);
    expect(out.category).toBe('TRANSPORTE TERRESTRE');
  });

  it('throws on non-JSON output', () => {
    expect(() => postProcessExtraction('sorry, no', [])).toThrow();
  });
});

describe('isTransientGeminiError', () => {
  it('flags saturation and quota errors', () => {
    expect(isTransientGeminiError(new Error('503 Service Unavailable'))).toBe(true);
    expect(isTransientGeminiError(new Error('Quota exceeded for quota metric'))).toBe(true);
  });
  it('does not flag validation errors', () => {
    expect(isTransientGeminiError(new Error('400 invalid argument'))).toBe(false);
  });
});

describe('buildReceiptPrompt', () => {
  it('lists the allowed categories when provided', () => {
    expect(buildReceiptPrompt(['HOTEL', 'VARIOS'])).toContain('HOTEL, VARIOS');
  });
});

describe('country prompts', () => {
  it('keeps Colombian rules by default and switches to RUT/boleta/CLP for Chile', () => {
    expect(buildReceiptPrompt([])).toContain('NIT');
    const cl = buildReceiptPrompt(['COMBUSTIBLE', 'VARIOS'], 'CL');
    expect(cl).toContain('RUT');
    expect(cl).toContain('Boleta');
    expect(cl).toContain("'CLP', 'USD', or 'EUR'");
    expect(cl).toContain("'COMBUSTIBLE'");
  });

  it('maps Chilean fuel merchants to COMBUSTIBLE', () => {
    const out = postProcessExtraction('{"merchant":"Copec Ruta 5","category":"VARIOS"}', ['COMBUSTIBLE', 'VARIOS']);
    expect(out.category).toBe('COMBUSTIBLE');
  });
});
