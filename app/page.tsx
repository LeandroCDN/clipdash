import { Suspense } from "react";
import Link from "next/link";
import FilterBar from "./FilterBar";
import { groupSum, lastRun, loadCampaigns, median, score, type Filters, type Group, type Scored } from "@/lib/data";
import { LANGS, PLATFORM_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

type Raw = Record<string, string | string[] | undefined>;
type View = "top" | "new" | "market";

function parse(sp: Raw): Filters & { view: View } {
  const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const view = one(sp.view);
  return {
    platforms: arr(sp.p),
    language: one(sp.lang),
    category: one(sp.cat),
    provider: one(sp.prov),
    noApply: one(sp.noapply) === "1",
    view: view === "new" || view === "market" ? view : "top",
  };
}

function hrefWith(sp: Raw, view: View) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "view" || v == null) continue;
    (Array.isArray(v) ? v : [v]).forEach((x) => q.append(k, x));
  }
  if (view !== "top") q.set("view", view);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
function compact(n: number) {
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1e4) return "$" + Math.round(n / 1e3) + "k";
  return money(n);
}
function span(h: number) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

export default async function Page({ searchParams }: { searchParams: Promise<Raw> }) {
  const raw = await searchParams;
  const f = parse(raw);

  let all, runs;
  try {
    [all, runs] = await Promise.all([loadCampaigns(), lastRun()]);
  } catch (e) {
    return (
      <main className="page">
        <h1 className="brand">clipdash</h1>
        <p className="notice">
          No se pudo leer la base de datos: {e instanceof Error ? e.message : String(e)}. Revisá las variables
          de entorno de Supabase en Vercel.
        </p>
      </main>
    );
  }

  const { rows, hiddenOutliers } = score(all, f);
  const fresh = rows.filter((r) => r.ageHours <= 48).sort((a, b) => a.ageHours - b.ageHours);
  const total = rows.reduce((s, r) => s + Number(r.remaining_usd), 0);
  const med = median(rows.map((r) => r.rate));
  const categories = [...new Set(all.flatMap((c) => c.categories))].sort((a, b) => a.localeCompare(b));
  const providers = [...new Set(all.map((c) => c.provider))].sort();
  const run = runs[0];
  const updated = run?.finished_at ? (Date.now() - new Date(run.finished_at).getTime()) / 36e5 : null;

  return (
    <main className="page">
      <header className="masthead">
        <h1 className="brand">clipdash</h1>
        <p className="updated">
          {run?.error
            ? <span className="warn">Falló la última actualización</span>
            : updated != null ? `Actualizado hace ${span(updated)}` : "Sin datos todavía"}
        </p>
      </header>

      <section className="hero" aria-label="Resumen">
        <p className="hero-amount">{compact(total)}</p>
        <p className="hero-caption">
          por repartir en {rows.length.toLocaleString("en-US")} campañas
        </p>
        <dl className="facts">
          <div><dt>Tasa mediana</dt><dd>${med.toFixed(2)} <small>por 1.000 vistas</small></dd></div>
          <div><dt>Nuevas en 48 h</dt><dd>{fresh.length}</dd></div>
        </dl>
      </section>

      <Suspense fallback={<div className="filters" />}>
        <FilterBar categories={categories} providers={providers} />
      </Suspense>

      <nav className="tabs" aria-label="Vistas">
        <Link href={hrefWith(raw, "top")} aria-current={f.view === "top" ? "page" : undefined} scroll={false}>Mejores</Link>
        <Link href={hrefWith(raw, "new")} aria-current={f.view === "new" ? "page" : undefined} scroll={false}>
          Nuevas <span className="count">{fresh.length}</span>
        </Link>
        <Link href={hrefWith(raw, "market")} aria-current={f.view === "market" ? "page" : undefined} scroll={false}>Mercado</Link>
      </nav>

      {f.view === "top" && (
        <section aria-label="Mejores campañas">
          <p className="hint">
            Ordenadas por tasa × presupuesto que queda ÷ clippers compitiendo.
            {hiddenOutliers > 0 && ` Ocultamos ${hiddenOutliers} con tasas de más de $50 por 1.000 vistas, casi seguro errores de carga.`}
          </p>
          <CardList rows={rows.slice(0, 60)} empty="Ninguna campaña cumple estos filtros." />
        </section>
      )}

      {f.view === "new" && (
        <section aria-label="Campañas nuevas">
          <p className="hint">Las primeras 48 h son las que más pagan: hay presupuesto entero y poca competencia.</p>
          <CardList rows={fresh} empty="No apareció ninguna campaña nueva en las últimas 48 h con estos filtros." />
        </section>
      )}

      {f.view === "market" && (
        <section aria-label="Mercado" className="market">
          <BarList title="Por temática" groups={groupSum(rows, (r) => (r.categories.length ? r.categories : ["Sin temática"])).slice(0, 15)} />
          <BarList title="Por idioma" groups={groupSum(rows, (r) => [r.language ?? "?"])} label={(k) => LANGS[k] ?? k} />
          <BarList
            title="Por red"
            groups={groupSum(rows, (r) => Object.keys(r.rates).filter((p) => f.platforms.length === 0 || f.platforms.includes(p)))}
            label={(k) => PLATFORM_LABELS[k] ?? k}
          />
          {providers.length > 1 && <BarList title="Por proveedor" groups={groupSum(rows, (r) => [r.provider])} />}
          <p className="hint">Una campaña con varias temáticas o redes suma en cada una.</p>
        </section>
      )}
    </main>
  );
}

function CardList({ rows, empty }: { rows: Scored[]; empty: string }) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ol className="cards">
      {rows.map((r) => <Card key={r.provider + r.id} r={r} />)}
    </ol>
  );
}

function Card({ r }: { r: Scored }) {
  const budget = Number(r.budget_usd ?? 0);
  const remaining = Number(r.remaining_usd);
  const spentPct = budget > 0 ? Math.min(100, Math.max(0, ((budget - remaining) / budget) * 100)) : 0;
  const burn = r.burn_usd_per_hour != null ? Number(r.burn_usd_per_hour) : null;
  const platforms = Object.keys(r.rates);

  return (
    <li className="card">
      <div className="card-head">
        <div className="card-title">
          <a href={r.url ?? "#"} target="_blank" rel="noreferrer">{r.name}</a>
          <p className="org">
            {r.organizer}
            {r.organizer_verified && <span className="verified" title="Organizador verificado"> ✓</span>}
            {r.categories.length > 0 && <span className="cat">{r.categories.slice(0, 2).join(", ")}</span>}
          </p>
        </div>
        <p className="rate">
          <strong>${r.rate.toFixed(2)}</strong>
          <span>por 1k</span>
        </p>
      </div>

      <div className="meter" role="img" aria-label={`Gastado ${Math.round(spentPct)}% del presupuesto`}>
        <span style={{ width: `${spentPct}%` }} />
      </div>
      <p className="budget">
        <span><strong>{money(remaining)}</strong> quedan de {compact(budget)}</span>
        <span>{Math.round(spentPct)}% gastado</span>
      </p>

      <ul className="tags">
        <li>{(r.creators ?? 0).toLocaleString("en-US")} {r.creators === 1 ? "clipper" : "clippers"}</li>
        <li>Hace {span(r.ageHours)}</li>
        {burn != null && burn > 0 && (
          <li className={r.hoursLeft != null && r.hoursLeft < 48 ? "urgent" : ""}>
            {money(burn)}/h{r.hoursLeft != null && `, se agota en ${span(r.hoursLeft)}`}
          </li>
        )}
        {platforms.map((p) => <li key={p} className="plat">{PLATFORM_LABELS[p] ?? p}</li>)}
        {r.requires_application && <li className="apply">Requiere aplicar</li>}
        {r.language && r.language !== "en" && <li className="lang">{LANGS[r.language] ?? r.language}</li>}
      </ul>
    </li>
  );
}

function BarList({ title, groups, label = (k) => k }: { title: string; groups: Group[]; label?: (k: string) => string }) {
  const max = groups[0]?.remaining || 1;
  return (
    <div className="barlist">
      <h2>{title}</h2>
      <ul>
        {groups.map((g) => (
          <li key={g.key}>
            <div className="bl-row">
              <span className="bl-label">{label(g.key)}</span>
              <span className="bl-value">{compact(g.remaining)}</span>
            </div>
            <div className="bl-bar"><span style={{ width: `${(g.remaining / max) * 100}%` }} /></div>
            <p className="bl-meta">{g.count} {g.count === 1 ? "campaña" : "campañas"}, mediana ${g.medianRate.toFixed(2)} por 1k</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
