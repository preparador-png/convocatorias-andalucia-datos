(() => {
  const PROVS = ["Almería", "Cádiz", "Córdoba", "Granada", "Huelva", "Jaén", "Málaga", "Sevilla"];
  const $ = (id) => document.getElementById(id);
  const state = { prov: "", q: "", tipo: "", cat: "", grupo: "", bol: "", desde: "", hasta: "", abierto: false, sort: "fecha" };
  let DATA = { anuncios: [], ejecuciones: [] };
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Theme
  const root = document.documentElement;
  root.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  $("themeToggle").onclick = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const fmtDate = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) => new Date(iso + "T00:00:00").toLocaleDateString("es-ES", opts);
  const daysLeft = (a) => {
    if (!a.plazo || !a.plazo.fin_estimado) return null;
    return Math.round((new Date(a.plazo.fin_estimado + "T00:00:00") - today) / 86400000);
  };
  const totalPlazas = (a) => (a.plazas || []).reduce((s, p) => s + (Number(p.numero) || 0), 0);
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((x, y) => x.localeCompare(y, "es"));

  function fillSelect(el, label, values) {
    el.innerHTML = `<option value="">${label}</option>` + values.map((v) => `<option>${esc(v)}</option>`).join("");
  }

  function matches(a, ignoreProv = false) {
    if (!ignoreProv && state.prov && a.provincia !== state.prov) return false;
    if (state.tipo && a.tipo !== state.tipo) return false;
    if (state.bol && a.boletin !== state.bol) return false;
    if (state.cat && !(a.plazas || []).some((p) => p.categoria === state.cat)) return false;
    if (state.grupo && !(a.plazas || []).some((p) => p.grupo === state.grupo)) return false;
    if (state.desde && a.fecha < state.desde) return false;
    if (state.hasta && a.fecha > state.hasta) return false;
    if (state.abierto) { const d = daysLeft(a); if (d === null || d < 0) return false; }
    if (state.q) {
      const hay = norm([a.entidad, a.provincia, a.resumen, a.referencia, a.titulo, a.tipo, ...(a.plazas || []).map((p) => p.denominacion)].join(" "));
      if (!norm(state.q).split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  }

  function renderProvinces() {
    const counts = Object.fromEntries(PROVS.map((p) => [p, 0]));
    let total = 0;
    DATA.anuncios.forEach((a) => { if (matches(a, true)) { counts[a.provincia] = (counts[a.provincia] || 0) + 1; total++; } });
    const btn = (p, label, n, cls = "") => `<button class="prov-btn ${cls}" data-prov="${esc(p)}" aria-pressed="${state.prov === p}"><span>${esc(label)}</span><span class="c">${n}</span></button>`;
    $("provList").innerHTML = btn("", "Todas las provincias", total, "all") + PROVS.map((p) => btn(p, p, counts[p])).join("");
    const max = Math.max(1, ...Object.values(counts));
    $("provBars").innerHTML = PROVS.map((p) => `
      <button class="pb" data-prov="${esc(p)}" aria-pressed="${state.prov === p}" aria-label="${esc(p)}: ${counts[p]} anuncios">
        <span class="pb-n">${counts[p]}</span>
        <span class="pb-bar-wrap"><span class="pb-bar" style="height:${(counts[p] / max) * 100}%"></span></span>
        <span class="pb-name">${esc(p)}</span>
      </button>`).join("");
    document.querySelectorAll("[data-prov]").forEach((b) => b.onclick = () => {
      state.prov = state.prov === b.dataset.prov ? "" : b.dataset.prov; render();
    });
  }

  function plazoHtml(a) {
    const d = daysLeft(a);
    if (d === null) return `<div class="plazo"><small>Sin plazo de solicitudes</small></div>`;
    const fin = fmtDate(a.plazo.fin_estimado, { day: "numeric", month: "short" });
    if (d < 0) return `<div class="plazo closed">Plazo cerrado<small>Finalizó ${fin} (est.)</small></div>`;
    const cls = d <= 5 ? "soon" : "open";
    const txt = d === 0 ? "Último día" : `${d} día${d === 1 ? "" : "s"}`;
    return `<div class="plazo ${cls}">${txt}<small>Hasta ${fin} (est.) · ${a.plazo.dias} d. ${esc(a.plazo.tipo)}</small></div>`;
  }

  function cardHtml(a) {
    const plazas = (a.plazas || []).map((p) => {
      const meta = [p.grupo && p.grupo !== "—" ? p.grupo : "", p.sistema, p.turno, p.vinculo && p.vinculo !== "Funcionario" ? p.vinculo : ""].filter(Boolean).join(" · ");
      return `<li><span class="n">${p.numero ?? "–"}</span><span class="d">${esc(p.denominacion)}</span><span class="meta">${esc(meta)}</span></li>`;
    }).join("") || `<li><span class="d">${esc(a.resumen || a.titulo)}</span></li>`;
    const refs = (a.referencias || []).map((r) => `${esc(r.boletin)} nº ${esc(r.numero)} (${esc(r.fecha)})`).join(" · ");
    return `<article class="card">
      <div class="card-top">
        <span class="entidad">${esc(a.entidad)}</span>
        <span class="tag prov">${esc(a.provincia)}</span>
        <span class="tag tipo">${esc(a.tipo)}</span>
        <span class="tag">${esc(a.boletin)}</span>
      </div>
      <ul class="plazas">${plazas}</ul>
      ${refs || a.referencia ? `<div class="refs">${a.referencia ? esc(a.referencia) : ""}${refs ? (a.referencia ? " · Bases: " : "Bases: ") + refs : ""}</div>` : ""}
      <div class="card-side">
        ${plazoHtml(a)}
        <a class="link" href="${esc(/^https?:\/\//i.test(a.enlace || "") ? a.enlace : "#")}" target="_blank" rel="noopener">Ver anuncio
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17 17 7M9 7h8v8"/></svg></a>
      </div>
    </article>`;
  }

  function render() {
    renderProvinces();
    let list = DATA.anuncios.filter((a) => matches(a));
    if (state.sort === "plazo") {
      list.sort((x, y) => { const a = daysLeft(x), b = daysLeft(y); const ka = a === null || a < 0 ? 1e6 : a, kb = b === null || b < 0 ? 1e6 : b; return ka - kb || y.fecha.localeCompare(x.fecha); });
    } else if (state.sort === "plazas") {
      list.sort((x, y) => totalPlazas(y) - totalPlazas(x));
    } else list.sort((x, y) => y.fecha.localeCompare(x.fecha) || x.provincia.localeCompare(y.provincia, "es"));

    const plazas = list.reduce((s, a) => s + totalPlazas(a), 0);
    const abiertos = list.filter((a) => { const d = daysLeft(a); return d !== null && d >= 0; });
    $("kAnuncios").textContent = list.length.toLocaleString("es-ES");
    $("kPlazas").textContent = plazas.toLocaleString("es-ES");
    $("kAbiertos").textContent = abiertos.length.toLocaleString("es-ES");
    $("kCierran").textContent = abiertos.filter((a) => daysLeft(a) <= 5).length.toLocaleString("es-ES");
    $("count").textContent = `${list.length} anuncio${list.length === 1 ? "" : "s"}${state.prov ? " en " + state.prov : ""}`;

    if (!list.length) {
      $("results").innerHTML = `<div class="empty"><strong>Sin resultados</strong>Prueba a quitar algún filtro.</div>`;
      return;
    }
    if (state.sort === "fecha") {
      const groups = {};
      list.forEach((a) => (groups[a.fecha] ||= []).push(a));
      $("results").innerHTML = Object.entries(groups).map(([f, items]) =>
        `<div class="day"><div class="day-head">${fmtDate(f, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${items.length}</div>${items.map(cardHtml).join("")}</div>`).join("");
    } else {
      $("results").innerHTML = list.map(cardHtml).join("");
    }
  }

  function exportCsv() {
    const rows = [["Fecha", "Provincia", "Entidad", "Tipo", "Boletín", "Referencia", "Nº plazas", "Plaza", "Grupo", "Sistema", "Turno", "Vínculo", "Fin plazo (est.)", "Enlace"]];
    DATA.anuncios.filter((a) => matches(a)).forEach((a) => {
      const ps = a.plazas && a.plazas.length ? a.plazas : [{ denominacion: a.resumen || a.titulo }];
      ps.forEach((p) => rows.push([a.fecha, a.provincia, a.entidad, a.tipo, a.boletin, a.referencia, p.numero ?? "", p.denominacion, p.grupo ?? "", p.sistema ?? "", p.turno ?? "", p.vinculo ?? "", a.plazo?.fin_estimado ?? "", a.enlace]));
    });
    const csv = "\ufeff" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `convocatorias-andalucia-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function bind() {
    const map = { q: "q", fTipo: "tipo", fCat: "cat", fGrupo: "grupo", fBol: "bol", fDesde: "desde", fHasta: "hasta", sort: "sort" };
    Object.entries(map).forEach(([id, key]) => $(id).addEventListener("input", (e) => { state[key] = e.target.value; render(); }));
    $("fAbierto").onchange = (e) => { state.abierto = e.target.checked; render(); };
    $("reset").onclick = () => {
      Object.assign(state, { prov: "", q: "", tipo: "", cat: "", grupo: "", bol: "", desde: "", hasta: "", abierto: false });
      ["q", "fTipo", "fCat", "fGrupo", "fBol", "fDesde", "fHasta"].forEach((id) => $(id).value = "");
      $("fAbierto").checked = false; render();
    };
    $("csv").onclick = exportCsv;
    $("toggleFilters").onclick = () => {
      const open = $("sidebar").classList.toggle("open");
      $("toggleFilters").setAttribute("aria-expanded", open);
    };
  }

  function init() {
    $("results").innerHTML = '<div class="skeleton"></div>'.repeat(4);
    const REMOTE = "https://raw.githubusercontent.com/preparador-png/convocatorias-andalucia-datos/main/anuncios.json";
    const load = (u) => fetch(u, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    Promise.all([load(REMOTE).catch(() => null), load("data.json").catch(() => null)]).then(([remote, local]) => {
      // Usa la copia más reciente disponible (GitHub se actualiza cada mañana)
      const d = [remote, local].filter(Boolean).sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)))[0];
      if (!d) throw new Error("sin datos");
      DATA = d;
      fillSelect($("fTipo"), "Todos", uniq(d.anuncios.map((a) => a.tipo)));
      fillSelect($("fCat"), "Todas", uniq(d.anuncios.flatMap((a) => (a.plazas || []).map((p) => p.categoria))));
      fillSelect($("fGrupo"), "Todos", uniq(d.anuncios.flatMap((a) => (a.plazas || []).map((p) => p.grupo)).filter((g) => g !== "—")));
      fillSelect($("fBol"), "Todos", uniq(d.anuncios.map((a) => a.boletin)));
      const up = d.actualizado ? new Date(d.actualizado) : null;
      const fechas = d.anuncios.map((a) => a.fecha).sort();
      $("updated").textContent = (up ? `Actualizado ${up.toLocaleDateString("es-ES", { day: "numeric", month: "long" })} a las ${up.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : "")
        + (fechas.length ? ` · Histórico desde ${fmtDate(fechas[0])}` : "");
      $("runs").innerHTML = (d.ejecuciones || []).slice().reverse().slice(0, 15).map((e) => `<li><b>${fmtDate(e.fecha)}</b><span>${esc(e.nota)}</span></li>`).join("") || "<li>Sin revisiones registradas.</li>";
      bind(); render();
    }).catch(() => {
      $("results").innerHTML = `<div class="empty"><strong>No se pudieron cargar los datos</strong>Vuelve a intentarlo en unos minutos.</div>`;
    });
  }
  init();
})();
