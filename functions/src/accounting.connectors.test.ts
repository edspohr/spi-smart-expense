import { describe, expect, it } from 'vitest';
import { buildJournals, type AccountingSettings } from './accounting.logic';
import { CONNECTORS, isConnectorId } from './accounting.connectors';

const settings: AccountingSettings = {
  liabilityAccount: '2-1-05-001',
  companyCardAccount: '2-1-01-010',
  vatAccount: '1-1-05-001',
  vatRate: 0.19,
  recoverableDocTypes: ['33'],
  costCentreSource: 'projectCode',
  categoryAccounts: { COMBUSTIBLE: '6-1-01-001', ALIMENTACIÓN: '6-1-02-001' },
};

// Canonical input: a factura with recoverable VAT and a boleta with a ";" in
// the merchant name (must be quoted).
const { ready } = buildJournals([
  { id: 'exp-factura', status: 'approved', date: '2026-10-20', category: 'COMBUSTIBLE', amount: 119000, currency: 'CLP', projectId: 'p1', merchant: 'COPEC', userName: 'Ana Pérez', fiscalVerification: { status: 'verified', docType: '33', folio: '881', issuerRut: '99520000-7' } },
  { id: 'exp-boleta', status: 'approved', date: '2026-10-21', category: 'ALIMENTACIÓN', amount: 8900, currency: 'CLP', projectId: 'p1', merchant: 'Café; Norte', taxId: '76111222-3', invoiceNumber: '55', userName: 'Ana Pérez', isCompanyExpense: true },
], settings, { baseCurrency: 'CLP', projects: { p1: { code: 'CC-100' } } });

const ctx = { exportId: 'abcdef1234567890', from: '2026-10-01', to: '2026-10-31' };

describe('connectors', () => {
  it('generic CSV: one row per line, semicolons, BOM, quoted cells', () => {
    const [file] = CONNECTORS['generic-csv'].build(ready, ctx);
    expect(file!.name).toBe('generic-csv_2026-10-01_2026-10-31_abcdef12.csv');
    expect(file!.content).toBe('﻿' + [
      'Comprobante;Fecha;Cuenta;Debe;Haber;Centro de costo;RUT proveedor;Proveedor;Tipo documento;Folio;Glosa;Rendido por;Timbre SII;ID gasto',
      '1;2026-10-20;6-1-01-001;100000;0;CC-100;99520000-7;COPEC;33;881;Ana Pérez · COPEC · COMBUSTIBLE;Ana Pérez;verificado;exp-factura',
      '1;2026-10-20;1-1-05-001;19000;0;;99520000-7;COPEC;33;881;Ana Pérez · COPEC · COMBUSTIBLE;Ana Pérez;verificado;exp-factura',
      '1;2026-10-20;2-1-05-001;0;119000;;99520000-7;COPEC;33;881;Ana Pérez · COPEC · COMBUSTIBLE;Ana Pérez;verificado;exp-factura',
      '2;2026-10-21;6-1-02-001;8900;0;CC-100;76111222-3;"Café; Norte";;55;"Ana Pérez · Café; Norte · ALIMENTACIÓN";Ana Pérez;;exp-boleta',
      '2;2026-10-21;2-1-01-010;0;8900;;76111222-3;"Café; Norte";;55;"Ana Pérez · Café; Norte · ALIMENTACIÓN";Ana Pérez;;exp-boleta',
    ].join('\r\n') + '\r\n');
  });

  it('Softland: dd/mm/aaaa dates and one voucher number per expense', () => {
    const [file] = CONNECTORS.softland.build(ready, ctx);
    const rows = file!.content.trim().split('\r\n');
    expect(rows[0]).toBe('NumComprobante;Fecha;Cuenta;Debe;Haber;Glosa;CentroCosto;RutAuxiliar;TipoDocumento;NumDocumento');
    expect(rows[1]).toBe('1;20/10/2026;6-1-01-001;100000;0;Ana Pérez · COPEC · COMBUSTIBLE;CC-100;99520000-7;33;881');
    expect(rows).toHaveLength(6);
  });

  it('Defontana: business centre and auxiliary file columns', () => {
    const [file] = CONNECTORS.defontana.build(ready, ctx);
    const rows = file!.content.replace('﻿', '').trim().split('\r\n');
    expect(rows[0]).toBe('Fecha;Cuenta;Debe;Haber;Glosa;Centro de negocio;Ficha (RUT);Tipo documento;Número documento;Comprobante');
    expect(rows[5]).toBe('21/10/2026;2-1-01-010;0;8900;"Ana Pérez · Café; Norte · ALIMENTACIÓN";;76111222-3;;55;2');
  });

  it('SAP B1: header and lines files with two title rows, linked by key', () => {
    const [head, lines] = CONNECTORS['sap-b1'].build(ready, ctx);
    expect(head!.name).toBe('sap-b1_2026-10-01_2026-10-31_abcdef12_JournalEntries.csv');
    expect(head!.content.split('\r\n').slice(0, 4)).toEqual([
      'RecordKey,ReferenceDate,TaxDate,DueDate,Memo,Reference,Reference2',
      'JdtNum,RefDate,TaxDate,DueDate,Memo,Ref1,Ref2',
      '1,20261020,20261020,20261020,Ana Pérez · COPEC · COMBUSTIBLE,881,exp-factura',
      '2,20261021,20261021,20261021,Ana Pérez · Café; Norte · ALIMENTACIÓN,55,exp-boleta',
    ]);
    expect(lines!.content.split('\r\n').slice(2, 5)).toEqual([
      '1,0,6-1-01-001,100000,0,Ana Pérez · COPEC · COMBUSTIBLE,CC-100,881',
      '1,1,1-1-05-001,19000,0,Ana Pérez · COPEC · COMBUSTIBLE,,881',
      '1,2,2-1-05-001,0,119000,Ana Pérez · COPEC · COMBUSTIBLE,,881',
    ]);
  });

  it('every connector builds at least one file', () => {
    for (const c of Object.values(CONNECTORS)) {
      expect(c.build(ready, ctx).length).toBeGreaterThan(0);
    }
    expect(isConnectorId('softland')).toBe(true);
    expect(isConnectorId('quickbooks')).toBe(false);
  });

  it('uses decimals for two-decimal currencies', () => {
    const usd = buildJournals([{ id: 'u', status: 'approved', date: '2026-10-20', category: 'COMBUSTIBLE', amount: 12.5, currency: 'USD', merchant: 'Shell' }],
      { ...settings, costCentreSource: 'none' }, { baseCurrency: 'USD', projects: {} }).ready;
    expect(CONNECTORS['generic-csv'].build(usd, ctx)[0]!.content).toContain(';12,50;0;');
    expect(CONNECTORS['sap-b1'].build(usd, ctx)[1]!.content).toContain(',12.50,0,');
  });
});
