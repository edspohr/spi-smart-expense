# Benchmark de mercado — resumen (2026-10-26)

Resumen del informe "Benchmark competitivo de rendición de gastos (Chile,
Colombia, Perú y México) y estrategia de entrada para Expense Buddy",
versión ajustada del 26 de octubre de 2026 (investigación con fuentes
citadas; el informe completo lo conserva el responsable). Fuente de las
decisiones del ADR 0014 y del plan v4. Los datos de competidores son
autodeclarados o de fuentes secundarias según se indica en el informe; no
usar como cifras auditadas.

## Mercado

- **Chile lo lidera Rindegastos** (adquirida por Visma en 2025): UF 0,05 a
  0,20 por usuario/mes, validación SII y SUNAT, conectores nativos
  Softland/Defontana/SAP B1, ISO 27001, SSO en Enterprise.
- Siguen **Xpendit** (WhatsApp + IA, clientes industriales y de energía),
  **Buk Rendiciones** (módulo de su suite de RR.HH., junio 2026) y
  **Cardda** (tarjetas prepago + reembolsos).
- En México y Colombia dominan fintech de tarjeta (Clara, Mendel, Jeeves) y
  globales con CFDI (Emburse, Navan, Rydoo). Las ERP locales (Softland,
  Defontana, Nubox, Siigo, Alegra) son destino de integración, no
  competencia: oportunidad de alianza.

## Base funcional del mercado

- **Table stakes (≥70%):** captura con IA, aprobaciones multinivel,
  duplicados y auditoría, apps nativas, integración ERP, conciliación de
  tarjetas, reportería.
- **Comunes (40-70%):** validación tributaria en tiempo real (de facto
  obligatoria en Chile), fondos por rendir, viáticos, kilometraje, tarjetas,
  WhatsApp/email, SSO y certificaciones.
- **Diferenciadores (<40%, solo Expense Buddy):** rendición offline con
  sincronización automática, marca blanca, ambiente dedicado por cliente,
  tipo de cambio oficial BCCh/BanRep.
- El alojamiento de datos en Chile **no** es diferenciador.

## Brechas de Expense Buddy (prioridad del informe)

1. Validación SII de DTE · 2. Exportador contable + Softland/Defontana/
SAP B1 · 3. Fondos por rendir formales · 4. Viáticos · 5. SSO · 6. Paquete
de seguridad (antesala de ISO 27001) · 7. WhatsApp y email · 8. Nómina
bancaria de reembolsos · 9. Conciliación de cartola · 10. Kilometraje ·
11. Validación DIAN · 12. Apps de tienda (solo si se piden).

El roadmap (ADR 0014) adelanta el offline automatizado como Ola 8 y luego
sigue este orden de brechas (olas 9-16 en `docs/implementation-plan.md`).

## Posicionamiento y pricing sugeridos (hipótesis)

- Cliente ideal en Chile: 300-3.000 empleados con 50-800 rendidores en
  terreno (contratistas de minería y energía, constructoras, ingenierías,
  servicios industriales, logística). Colombia desde el cliente actual;
  Perú y México solo con SUNAT/CFDI.
- Mensaje de apertura: "Rinde desde la faena, aunque no haya señal".
- Pricing recomendado (modelo C, por validar con clientes fundadores):
  implementación 150-400 UF + plataforma 15-20 UF/mes + 0,06-0,10 UF por
  usuario activo/mes; oferta de cliente fundador con implementación al 50%.

## Próximos pasos de validación sugeridos

Cotizar como comprador a Rindegastos Enterprise, Xpendit y Buk (preguntar
por modo offline); entrevistar 10-12 prospectos del perfil; probar el
mensaje "rinde sin señal" en faenas y el de "ambiente dedicado" con comités
de TI; explorar alianzas con partners de Softland/Defontana.
