# 0019 — Rama `expense-buddy` separada de lo desplegado en SPI

**Estado:** Aceptada
**Fecha:** 2026-11-03
**Ola:** 10-11

## Contexto

Las Olas 10 (timbre SII) y 11 (exportación contable) están pensadas para
clientes chilenos. SPI trabaja en pesos colombianos, sin timbre SII, y su
contabilidad no está definida. El código ya separa por tenant (módulos
apagados para SPI), pero el responsable prefiere no llevar estos cambios a
SPI hasta probarlos en el demo y decidir cómo homologarlos (moneda base,
TD-026, documentos DIAN).

Hay un solo repositorio. `expense-buddy-demo` es solo otro proyecto Firebase
(alias `demo` en `.firebaserc`).

## Decisión

- La rama de larga vida `expense-buddy` lleva lo que se prueba en la
  plataforma genérica. Se despliega **solo** al proyecto demo
  (`firebase deploy --project demo`).
- `main` es lo que tiene SPI. Las ramas de las Olas 10-11 no se fusionan a
  `main` ni se despliegan a `spi-smart-expense` hasta homologar.
- Los arreglos que sirven a ambos van primero a `main` y luego se fusionan
  en `expense-buddy` (no al revés), para que la rama demo no se aleje.
- Al homologar, se fusiona `expense-buddy` en `main` con las decisiones para
  SPI tomadas (módulos, moneda base) y la rama se cierra.

## Alternativas consideradas

- **Repo aparte (`expense-buddy`)**: separación total, pero cada arreglo hay
  que portarlo a mano entre dos historiales. Descartado.
- **Fusionar a `main` con los módulos apagados para SPI**: el código lo
  permite, pero llevaría a SPI un bundle e índices nuevos sin necesidad.

## Consecuencias

- Un deploy a SPI desde `main` no incluye las Olas 10-11; un deploy desde
  `expense-buddy` a SPI estaría mal. Siempre indicar `--project`.
- Las reglas de Firestore e índices del demo divergen de los de SPI mientras
  dure la rama.
- Si `main` recibe cambios, hay que fusionarlos en `expense-buddy` antes del
  siguiente deploy del demo.
