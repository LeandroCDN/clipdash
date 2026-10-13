"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LANGS } from "@/lib/labels";

const PLATFORMS: [string, string][] = [
  ["tiktok", "TikTok"],
  ["instagram", "Instagram"],
  ["youtube", "YouTube"],
  ["x", "X"],
  ["facebook", "Facebook"],
];


export default function FilterBar({ categories, providers }: { categories: string[]; providers: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const platforms = sp.getAll("p");
  const lang = sp.get("lang") ?? "";
  const cat = sp.get("cat") ?? "";
  const prov = sp.get("prov") ?? "";
  const noApply = sp.get("noapply") === "1";
  const active = platforms.length + (lang ? 1 : 0) + (cat ? 1 : 0) + (prov ? 1 : 0) + (noApply ? 1 : 0);

  function update(mut: (q: URLSearchParams) => void) {
    const q = new URLSearchParams(sp.toString());
    mut(q);
    start(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
  }

  function togglePlatform(p: string) {
    update((q) => {
      const cur = q.getAll("p");
      q.delete("p");
      (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]).forEach((x) => q.append("p", x));
    });
  }

  function setOne(key: string, value: string) {
    update((q) => (value ? q.set(key, value) : q.delete(key)));
  }

  return (
    <div className="filters" aria-busy={pending}>
      <div className="chips" role="group" aria-label="Redes">
        {PLATFORMS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="chip"
            aria-pressed={platforms.includes(id)}
            onClick={() => togglePlatform(id)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={noApply}
          onClick={() => setOne("noapply", noApply ? "" : "1")}
        >
          Sin aplicar
        </button>
      </div>
      <div className="selects">
        <label className={`select ${lang ? "on" : ""}`}>
          <span className="sr">Idioma</span>
          <select value={lang} onChange={(e) => setOne("lang", e.target.value)}>
            <option value="">Todos los idiomas</option>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className={`select ${cat ? "on" : ""}`}>
          <span className="sr">Temática</span>
          <select value={cat} onChange={(e) => setOne("cat", e.target.value)}>
            <option value="">Todas las temáticas</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {providers.length > 1 && (
          <label className={`select ${prov ? "on" : ""}`}>
            <span className="sr">Proveedor</span>
            <select value={prov} onChange={(e) => setOne("prov", e.target.value)}>
              <option value="">Todos los proveedores</option>
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        {active > 0 && (
          <button
            type="button"
            className="clear"
            onClick={() => start(() => router.replace(`${pathname}${sp.get("view") ? `?view=${sp.get("view")}` : ""}`, { scroll: false }))}
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}
