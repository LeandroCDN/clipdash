import { groupSum, lastRun, loadCampaigns, score, type Filters, type Scored } from "@/lib/data";

export const dynamic = "force-dynamic";

const PLATFORMS = ["tiktok", "instagram", "youtube", "x", "facebook"];
const LANGS: Record<string, string> = {
  en: "Inglés", es: "Español", fr: "Francés", de: "Alemán", pt: "Portugués", it: "Italiano", ar: "Árabe", tr: "Turco",
};

type SP = Promise<Record<string, string | string[] | undefined>>;

function parse(sp: Record<string, string | string[] | undefined>): Filters {
  const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return {
    platforms: arr(sp.p),
    language: one(sp.lang),
    category: one(sp.cat),
    provider: one(sp.prov),
    noApply: one(sp.noapply) === "1",
  };
}

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const ago = (h: number) => (h < 24 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`);

export default async function Page({ searchParams }: { searchParams: SP }) {
  const f = parse(await searchParams);
  let all, runs;
  try {
    [all, runs] = await Promise.all([loadCampaigns(), lastRun()]);
  } catch (e) {
    return (
      <main className="wrap">
        <h1>clipdash</h1>
        <p className="err">No pude leer la base: {e instanceof Error ? e.message : String(e)}</p>
      </main>
    );
  }

  const rows = score(all, f);
  const fresh = rows.filter((r) => r.ageHours <= 48).slice(0, 8);
  const byCat = groupSum(rows, (r) => (r.categories.length ? r.categories : ["Sin categoría"])).slice(0, 12);
  const byLang = groupSum(rows, (r) => [r.language ?? "?"]);
  const byPlat = groupSum(rows, (r) =>
    Object.keys(r.rates).filter((p) => f.platforms.length === 0 || f.platforms.includes(p)));
  const categories = [...new Set(all.flatMap((c) => c.categories))].sort();
  const providers = [...new Set(all.map((c) => c.provider))].sort();
  const totalRemaining = rows.reduce((s, r) => s + Number(r.remaining_usd), 0);
  const avgRate = rows.length ? rows.reduce((s, r) => s + r.rate, 0) / rows.length : 0;
  const maxCat = byCat[0]?.remaining || 1;
  const run = runs[0];

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>clipdash</h1>
          <p className="muted">Radar de campañas de clipping</p>
        </div>
        <p className="muted small">
          {run ? <>Última corrida: {new Date(run.finished_at ?? "").toLocaleString("es-AR")} · {run.campaigns ?? 0} campañas{run.error ? ` · error: ${run.error}` : ""}</> : "Sin corridas todavía"}
        </p>
      </header>

      <form className="filters" method="get">
        <fieldset>
          <legend>Redes</legend>
          {PLATFORMS.map((p) => (
            <label key={p} className="chip">
              <input type="checkbox" name="p" value={p} defaultChecked={f.platforms.includes(p)} /> {p}
            </label>
          ))}
        </fieldset>
        <label>Idioma
          <select name="lang" defaultValue={f.language}>
            <option value="">Todos</option>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Temática
          <select name="cat" defaultValue={f.category}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Proveedor
          <select name="prov" defaultValue={f.provider}>
            <option value="">Todos</option>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="chip">
          <input type="checkbox" name="noapply" value="1" defaultChecked={f.noApply} /> Sin aplicación
        </label>
        <button type="submit">Aplicar</button>
      </form>

      <section className="kpis">
        <Kpi label="Campañas" value={rows.length.toLocaleString("en-US")} />
        <Kpi label="Presupuesto restante" value={usd(totalRemaining)} />
        <Kpi label="Tasa promedio / 1k" value={"$" + avgRate.toFixed(2)} />
        <Kpi label="Nuevas (48 h)" value={String(rows.filter((r) => r.ageHours <= 48).length)} />
      </section>

      {fresh.length > 0 && (
        <section>
          <h2>Nuevas en las últimas 48 h</h2>
          <CampaignTable rows={fresh} />
        </section>
      )}

      <section className="grid2">
        <div>
          <h2>Dónde está la plata · por temática</h2>
          <table className="t">
            <thead><tr><th>Temática</th><th className="n">Restante</th><th className="n">Camp.</th><th className="n">$/1k</th></tr></thead>
            <tbody>
              {byCat.map((g) => (
                <tr key={g.key}>
                  <td>
                    <div className="barcell">
                      <span className="bar" style={{ width: `${(g.remaining / maxCat) * 100}%` }} />
                      <span>{g.key}</span>
                    </div>
                  </td>
                  <td className="n">{usd(g.remaining)}</td>
                  <td className="n">{g.count}</td>
                  <td className="n">{g.avgRate.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h2>Por idioma</h2>
          <table className="t">
            <thead><tr><th>Idioma</th><th className="n">Restante</th><th className="n">Camp.</th><th className="n">$/1k</th></tr></thead>
            <tbody>
              {byLang.map((g) => (
                <tr key={g.key}><td>{LANGS[g.key] ?? g.key}</td><td className="n">{usd(g.remaining)}</td><td className="n">{g.count}</td><td className="n">{g.avgRate.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
          <h2>Por red</h2>
          <table className="t">
            <thead><tr><th>Red</th><th className="n">Restante</th><th className="n">Camp.</th><th className="n">$/1k</th></tr></thead>
            <tbody>
              {byPlat.map((g) => (
                <tr key={g.key}><td>{g.key}</td><td className="n">{usd(g.remaining)}</td><td className="n">{g.count}</td><td className="n">{g.avgRate.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Ranking · tasa × restante ÷ competencia</h2>
        <CampaignTable rows={rows.slice(0, 100)} />
      </section>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="muted small">{label}</div>
      <div className="kv">{value}</div>
    </div>
  );
}

function CampaignTable({ rows }: { rows: Scored[] }) {
  return (
    <div className="scroll">
      <table className="t">
        <thead>
          <tr>
            <th>Campaña</th><th>Temática</th><th>Redes</th>
            <th className="n">$/1k</th><th className="n">Restante</th><th className="n">Clippers</th>
            <th className="n">Burn/h</th><th className="n">Quedan</th><th className="n">Edad</th><th className="n">Puntaje</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.provider + r.id}>
              <td>
                <a href={r.url ?? "#"} target="_blank" rel="noreferrer">{r.name}</a>
                <div className="muted small">
                  {r.organizer}{r.organizer_verified ? " ✓" : ""} · {r.provider}{r.requires_application ? " · aplicar" : ""}{r.language && r.language !== "en" ? ` · ${r.language}` : ""}
                </div>
              </td>
              <td className="small">{r.categories.slice(0, 2).join(", ") || "—"}</td>
              <td className="small">{Object.keys(r.rates).join(" ")}</td>
              <td className="n">{r.rate.toFixed(2)}</td>
              <td className="n">{usd(Number(r.remaining_usd))}</td>
              <td className="n">{r.creators ?? 0}</td>
              <td className="n">{r.burn_usd_per_hour != null ? usd(Number(r.burn_usd_per_hour)) : "—"}</td>
              <td className="n">{r.hoursLeft != null ? ago(r.hoursLeft) : "—"}</td>
              <td className="n">{ago(r.ageHours)}</td>
              <td className="n strong">{Math.round(r.score).toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
