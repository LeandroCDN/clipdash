# clipdash

Radar de campañas de clipping: junta campañas de varios proveedores, las normaliza y muestra dónde está la plata por temática, idioma, red y proveedor.

## Piezas

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| `supabase/migrations` | Supabase (Postgres) | Esquema común: `campaigns`, `campaign_payouts`, `campaign_snapshots`, `collector_runs` y la vista `campaign_latest` |
| `supabase/functions/collect` | Supabase Edge Function | Recolector. Corre cada 15 min con pg_cron; un adaptador por proveedor |
| `app/` + `lib/` | Vercel (Next.js) | Dashboard: KPIs, nuevas de 48 h, mapa por temática/idioma/red y ranking |

## Proveedores

- **Content Rewards** (Whop): API pública `contentrewards.com/api/campaign/campaigns/discover`, paginada por cursor.

Para sumar uno: crear `supabase/functions/collect/providers/<nombre>.ts` que implemente `Adapter` (ver `types.ts`) y agregarlo a `ADAPTERS` en `index.ts`.

## Puntaje

`mejor tasa por 1.000 vistas en las redes elegidas × presupuesto restante ÷ (clippers + 5)`

Burn rate y horas restantes salen de comparar el último snapshot con el de hace ~24 h, así que aparecen después de unas horas de corridas.

## Desarrollo local

```bash
cp .env.example .env.local   # URL y publishable key de Supabase
npm install
npm run dev
```

## Notas

- El idioma se infiere con palabras clave del título y la descripción (`language.ts`); pendiente reemplazarlo por un LLM.
- Ritmo de requests bajo a propósito (1,5 s entre páginas); errores 429/5xx se reintentan hasta 3 veces.
- Retención: snapshots de 15 min se guardan 7 días. Antes de borrarlos, `rollup_daily()` los resume en `campaign_daily` (corre en la ejecución de las 03:00 UTC).
