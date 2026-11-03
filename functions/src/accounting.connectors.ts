// Ola 11: ERP connectors for the accounting export (ADR 0018).
//
// A connector turns balanced journals into import files. Today every
// connector only builds files; `push` (Service Layer, APIs) is a later wave
// and must not change the journal model.
//
// ASSUMPTION discipline: where a column layout comes from public material
// rather than from a confirmed customer template, the connector says so in
// `assumptions` (shown in the UI and the ADR). Confirm with the first
// customer's import before announcing a connector as native.

import type { Journal } from './accounting.logic';
import { currencyDecimals } from './accounting.logic';

export type ConnectorId = 'generic-csv' | 'softland' | 'defontana' | 'sap-b1';

export interface ExportFile {
  name: string;
  mimeType: string;
  content: string;
}

export interface ExportContext {
  exportId: string;
  from: string;
  to: string;
}

export interface ErpConnector {
  id: ConnectorId;
  label: string;
  description: string;
  assumptions: string[];
  build(journals: Journal[], ctx: ExportContext): ExportFile[];
}

type Cell = string | number | null;

function csv(rows: Cell[][], delimiter: string): string {
  const quote = (v: Cell) => {
    const s = v === null ? '' : String(v);
    return s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(quote).join(delimiter)).join('\r\n') + '\r\n';
}

/** Amount with the currency's decimals; `comma` for Spanish-locale Excel. */
function amount(value: number, currency: string, comma: boolean): string {
  if (value === 0) return '0';
  const s = value.toFixed(currencyDecimals(currency));
  return comma ? s.replace('.', ',') : s;
}

const BOM = '﻿';
const FISCAL_LABEL: Record<string, string> = {
  verified: 'verificado',
  invalid_signature: 'firma inválida',
  folio_out_of_range: 'folio fuera de rango',
  issuer_mismatch: 'RUT no coincide',
  not_verifiable: 'sin timbre',
  error: 'pendiente',
};
const fiscal = (j: Journal) => (j.fiscalStatus ? FISCAL_LABEL[j.fiscalStatus] ?? j.fiscalStatus : '');
const fileBase = (id: ConnectorId, ctx: ExportContext) => `${id}_${ctx.from}_${ctx.to}_${ctx.exportId.slice(0, 8)}`;
const ddmmyyyy = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const yyyymmdd = (iso: string) => iso.slice(0, 10).replace(/-/g, '');

const genericCsv: ErpConnector = {
  id: 'generic-csv',
  label: 'CSV genérico',
  description: 'Una fila por línea contable, separada por punto y coma, para abrir en Excel o adaptar a cualquier ERP.',
  assumptions: [],
  build(journals, ctx) {
    const rows: Cell[][] = [[
      'Comprobante', 'Fecha', 'Cuenta', 'Debe', 'Haber', 'Centro de costo', 'RUT proveedor', 'Proveedor',
      'Tipo documento', 'Folio', 'Glosa', 'Rendido por', 'Timbre SII', 'ID gasto',
    ]];
    journals.forEach((j, i) => {
      for (const l of j.lines) {
        rows.push([
          i + 1, j.date, l.account, amount(l.debit, j.currency, true), amount(l.credit, j.currency, true), l.costCentre,
          j.supplierRut, j.supplierName, j.docType, j.folio, l.memo, j.employee, fiscal(j), j.expenseId,
        ]);
      }
    });
    return [{ name: `${fileBase('generic-csv', ctx)}.csv`, mimeType: 'text/csv;charset=utf-8', content: BOM + csv(rows, ';') }];
  },
};

// ASSUMPTION: Softland ERP imports vouchers from a delimited text file whose
// columns are configured per installation. This is the common order
// (account, debit, credit, memo, cost centre, auxiliary RUT, document type
// and number, date); map it in Softland's import definition.
const softland: ErpConnector = {
  id: 'softland',
  label: 'Softland ERP',
  description: 'Archivo plano de comprobantes contables, un comprobante por rendición.',
  assumptions: [
    'El orden de columnas no está confirmado con una instalación real: se define en el importador de Softland de cada cliente.',
    'Fechas dd/mm/aaaa y decimales con coma; sin fila de encabezado si el importador no la admite (quitarla antes de importar).',
  ],
  build(journals, ctx) {
    const rows: Cell[][] = [[
      'NumComprobante', 'Fecha', 'Cuenta', 'Debe', 'Haber', 'Glosa', 'CentroCosto', 'RutAuxiliar', 'TipoDocumento', 'NumDocumento',
    ]];
    journals.forEach((j, i) => {
      for (const l of j.lines) {
        rows.push([
          i + 1, ddmmyyyy(j.date), l.account, amount(l.debit, j.currency, true), amount(l.credit, j.currency, true),
          l.memo.slice(0, 60), l.costCentre, j.supplierRut, j.docType, j.folio,
        ]);
      }
    });
    return [{ name: `${fileBase('softland', ctx)}.txt`, mimeType: 'text/plain;charset=utf-8', content: csv(rows, ';') }];
  },
};

// ASSUMPTION: Defontana's voucher import takes one row per line with the
// account, debit/credit, memo, business centre ("centro de negocio") and the
// auxiliary file ("ficha", by RUT). Column names follow that vocabulary; the
// customer's template decides the final order.
const defontana: ErpConnector = {
  id: 'defontana',
  label: 'Defontana',
  description: 'Planilla de importación de comprobantes (CSV que Excel abre directo), una fila por línea.',
  assumptions: [
    'Columnas según el vocabulario de Defontana (centro de negocio, ficha); el orden exacto de la plantilla no está confirmado.',
    'Se entrega CSV; si la plantilla del cliente exige .xlsx, abrir en Excel y guardar como .xlsx.',
  ],
  build(journals, ctx) {
    const rows: Cell[][] = [[
      'Fecha', 'Cuenta', 'Debe', 'Haber', 'Glosa', 'Centro de negocio', 'Ficha (RUT)', 'Tipo documento', 'Número documento', 'Comprobante',
    ]];
    journals.forEach((j, i) => {
      for (const l of j.lines) {
        rows.push([
          ddmmyyyy(j.date), l.account, amount(l.debit, j.currency, true), amount(l.credit, j.currency, true), l.memo,
          l.costCentre, j.supplierRut, j.docType, j.folio, i + 1,
        ]);
      }
    });
    return [{ name: `${fileBase('defontana', ctx)}.csv`, mimeType: 'text/csv;charset=utf-8', content: BOM + csv(rows, ';') }];
  },
};

// SAP Business One Data Transfer Workbench, Journal Entries object: a header
// file (OJDT) and a lines file (JDT1) linked by RecordKey/ParentKey, each with
// the DTW field-name row followed by the database column row.
// ASSUMPTION: field names as in the standard DTW "oJournalEntries" templates;
// confirm against the customer's SAP B1 version before the first import.
const sapB1: ErpConnector = {
  id: 'sap-b1',
  label: 'SAP Business One (DTW)',
  description: 'Plantillas de Data Transfer Workbench para asientos: cabecera y líneas.',
  assumptions: [
    'Nombres de campo de las plantillas estándar de DTW (JournalEntries y JournalEntries_Lines); confirmar con la versión de SAP B1 del cliente.',
    'Memo y glosa de línea recortados a 50 caracteres (límite de SAP B1).',
  ],
  build(journals, ctx) {
    const head: Cell[][] = [
      ['RecordKey', 'ReferenceDate', 'TaxDate', 'DueDate', 'Memo', 'Reference', 'Reference2'],
      ['JdtNum', 'RefDate', 'TaxDate', 'DueDate', 'Memo', 'Ref1', 'Ref2'],
    ];
    const lines: Cell[][] = [
      ['ParentKey', 'LineNum', 'AccountCode', 'Debit', 'Credit', 'LineMemo', 'CostingCode', 'Reference1'],
      ['JdtNum', 'LineNum', 'Account', 'Debit', 'Credit', 'LineMemo', 'ProfitCode', 'Ref1'],
    ];
    journals.forEach((j, i) => {
      const key = i + 1;
      const date = yyyymmdd(j.date);
      head.push([key, date, date, date, j.memo.slice(0, 50), j.folio, j.expenseId]);
      j.lines.forEach((l, n) => {
        lines.push([key, n, l.account, amount(l.debit, j.currency, false), amount(l.credit, j.currency, false), l.memo.slice(0, 50), l.costCentre, j.folio]);
      });
    });
    const base = fileBase('sap-b1', ctx);
    return [
      { name: `${base}_JournalEntries.csv`, mimeType: 'text/csv;charset=utf-8', content: csv(head, ',') },
      { name: `${base}_JournalEntries_Lines.csv`, mimeType: 'text/csv;charset=utf-8', content: csv(lines, ',') },
    ];
  },
};

export const CONNECTORS: Record<ConnectorId, ErpConnector> = {
  'generic-csv': genericCsv,
  softland,
  defontana,
  'sap-b1': sapB1,
};

export function isConnectorId(v: unknown): v is ConnectorId {
  return typeof v === 'string' && v in CONNECTORS;
}
