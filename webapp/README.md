# MAINTIQ — análisis CMMS/GMAO

Aplicación web estática para GitHub Pages. No requiere servidor de aplicación, instalación ni compilación: los CSV se procesan en el navegador y no se transmiten.

## Publicar en GitHub Pages

El repositorio incluye `.github/workflows/pages.yml`, que publica directamente el contenido de `webapp` como sitio estático al hacer push a `main` o `master`, o al ejecutar el flujo manualmente desde **Actions**.

1. Sube al repositorio tanto la carpeta `webapp` como `.github/workflows/pages.yml`, manteniendo su estructura.
2. En GitHub, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente de publicación.
3. Haz push a `main` o `master` y revisa el flujo **Publicar aplicacion estatica en GitHub Pages** en la pestaña **Actions**. Al terminar, Pages muestra la URL del sitio en el entorno `github-pages`.

El artefacto incluye únicamente `webapp`: no necesita Node.js, compilación ni servidor de aplicación.

La aplicación incluye `data/CMMS_grupo_D.csv` como dataset inicial. Si se abre sin ese CSV mediante `file://`, el navegador puede bloquear la carga automática: publícala en GitHub Pages o sírvela desde un servidor web local, por ejemplo `python -m http.server 8765 --directory webapp`.

## Cargar otro dataset

Selecciona o arrastra un CSV UTF-8 separado por comas o punto y coma. Antes de agrupar, la aplicación unifica las variantes habituales de tipo de mantenimiento (mayúsculas, espacios, singular/plural y formas como `preventiva` o `correctiva`) y homologa los estados `cerrado/cerrada`. Las diferencias de mayúsculas, acentos y espacios no generan categorías duplicadas.

El archivo debe conservar los encabezados del análisis GMAO y contener, como mínimo:

- `Tipo_mantenimiento`
- `Equipo`
- `Downtime_h`
- `Horas_mano_obra`
- `Costo_total_CLP`

Para calcular el MTTR, incluye también `Estado`, `Fecha_inicio` y `Fecha_fin`. Se promedian las horas entre inicio y fin de las órdenes correctivas cerradas con fechas válidas y duración positiva. Las filas exactamente duplicadas se eliminan. Cuando esté presente `OT`, las órdenes se cuentan de forma única. Los filtros por estrategia y área actualizan todas las tarjetas, tablas e indicadores.

Las fechas del dataset original están en formato `DD-MM-AAAA` y se interpretan explícitamente como día-mes-año (también se aceptan fechas ISO). Por esto el MTTR y la mediana pueden diferir de los valores guardados en la salida del notebook, donde algunas fechas se interpretaron como mes-día-año. Los totales base de órdenes, horas-hombre, downtime y costo coinciden con el informe ejecutivo. Los colores de correctivo, preventivo y predictivo son consistentes entre las gráficas.

## Exportar el informe

Pulsa **Exportar informe PDF** y elige **Guardar como PDF** en el cuadro de impresión del navegador. Se exportan las métricas, gráficas y tabla comparativa por estrategia actualmente filtradas; los controles de carga y navegación se excluyen del informe.

## Indicadores incluidos

Órdenes únicas, horas-hombre, downtime, costo total, MTTR y mediana de reparación correctiva, distribución por tipo de mantenimiento, equipos con mayor downtime y modos de falla frecuentes. Los datos se leen y analizan localmente.
