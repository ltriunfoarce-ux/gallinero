(function () {
'use strict';

const KEY = 'gallinero_v2';
const clone = o => JSON.parse(JSON.stringify(o));
const DEFAULT = {
  aves: { gallinas: 25, gallos: 2, pollas: 59, consAdulta: 115, consPolla: 40, precioMaple: 250, tasaPostura: 95 },
  alimentos: [
    { nombre: 'Ponedora de piso', precioBolsa: 472, pct: 70 },
    { nombre: 'Maíz quebrado', precioBolsa: 413, pct: 30 },
  ],
  recolecciones: [],
  ventas: [],
};

let state = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULT);
    const p = JSON.parse(raw);
    const s = Object.assign(clone(DEFAULT), p);
    s.aves = Object.assign(clone(DEFAULT.aves), p.aves || {});
    return s;
  } catch (e) { return clone(DEFAULT); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('No se pudo guardar en este dispositivo'); }
}

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMoney = n => '$ ' + (n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = n => (n || 0).toLocaleString('es-UY', { maximumFractionDigits: 0 });
const fmtNum1 = n => (n || 0).toLocaleString('es-UY', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDate = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- cálculos ---------- */
function ventasPorFecha() {
  const m = {};
  state.ventas.forEach(v => {
    const x = m[v.fecha] || (m[v.fecha] = { cantidad: 0, monto: 0 });
    x.cantidad += v.cantidad || 0;
    x.monto += v.monto || 0;
  });
  return m;
}
function promedioHuevos7() {
  const d = state.recolecciones.filter(r => (r.juntados || 0) > 0).slice().sort((a, b) => a.fecha < b.fecha ? 1 : -1).slice(0, 7);
  return d.length ? d.reduce((s, r) => s + r.juntados, 0) / d.length : 0;
}
function ingresoProm7() {
  const pf = ventasPorFecha();
  const dias = Object.keys(pf).filter(f => pf[f].monto > 0).sort((a, b) => a < b ? 1 : -1).slice(0, 7);
  return dias.length ? dias.reduce((s, f) => s + pf[f].monto, 0) / dias.length : null;
}
function calc() {
  const a = state.aves;
  const tasa = a.tasaPostura / 100;
  const precioHuevo = a.precioMaple / 30;
  const consAdultas = ((a.gallinas + a.gallos) * a.consAdulta) / 1000;
  const consPollas = (a.pollas * a.consPolla) / 1000;
  const consTotal = consAdultas + consPollas;
  const totalPct = state.alimentos.reduce((s, x) => s + (x.pct || 0), 0) || 1;
  const costoKg = kg => state.alimentos.reduce((s, x) => s + kg * ((x.pct || 0) / totalPct) * ((x.precioBolsa || 0) / 25), 0);

  const costoAdultas = costoKg(consAdultas);
  const costoTotal = costoKg(consTotal);
  const hembras = a.gallinas + a.pollas;
  const costoFuturo = costoKg(((hembras + a.gallos) * a.consAdulta) / 1000);

  const huevosProm = promedioHuevos7();
  const ingReal = ingresoProm7();
  const ingresoActual = ingReal !== null ? ingReal : huevosProm * precioHuevo;
  const pct = Math.round(tasa * 100);

  const escenarios = [
    { nombre: '1. Producción registrada vs costo de las gallinas', huevos: huevosProm, ingreso: ingresoActual, costo: costoAdultas },
    { nombre: '2. Producción registrada vs costo de todo el plantel', huevos: huevosProm, ingreso: ingresoActual, costo: costoTotal },
    { nombre: `3. Gallinas actuales al ${pct}% de postura vs costo de adultas`, huevos: a.gallinas * tasa, ingreso: a.gallinas * tasa * precioHuevo, costo: costoAdultas },
    { nombre: `4. A futuro: todas las hembras al ${pct}% vs costo del plantel futuro`, huevos: hembras * tasa, ingreso: hembras * tasa * precioHuevo, costo: costoFuturo },
  ];
  escenarios.forEach(e => { e.ganancia = e.ingreso - e.costo; e.mes = e.ganancia * 30; });
  return { a, consAdultas, consPollas, consTotal, costoTotal, escenarios, huevosProm, precioHuevo };
}

/* ---------- navegación ---------- */
const screens = ['home', 'recoleccion', 'ventas', 'clientes', 'resumen', 'aves', 'escenarios', 'backup'];
let current = 'home';
const renderers = {
  home: renderHome, recoleccion: renderRecoleccion, ventas: renderVentas, clientes: renderClientes,
  resumen: renderResumen, aves: renderAves, escenarios: renderEscenarios, backup: () => {},
};
function show(name) {
  if (!screens.includes(name)) name = 'home';
  current = name;
  screens.forEach(s => $('screen-' + s).classList.toggle('active', s === name));
  const inner = name !== 'home';
  $('topbar').hidden = !inner;
  if (inner) $('topTitle').textContent = $('screen-' + name).dataset.title;
  window.scrollTo(0, 0);
  renderers[name]();
}
function go(name) {
  if (name === current) return;
  history.pushState({ s: name }, '');
  show(name);
}
window.addEventListener('popstate', e => show((e.state && e.state.s) || 'home'));
$('btnBack').addEventListener('click', () => {
  if (history.state && history.state.s && history.state.s !== 'home') history.back();
  else show('home');
});
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
history.replaceState({ s: 'home' }, '');

/* ---------- inicio ---------- */
function renderHome() {
  const d = calc();
  $('homeDate').textContent = new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });
  const hoy = state.recolecciones.find(r => r.fecha === todayISO());
  $('stHoy').textContent = hoy ? fmtInt(hoy.juntados) : '—';
  $('stProm').textContent = d.huevosProm > 0 ? fmtNum1(d.huevosProm) : '—';
  const g = d.escenarios[1].ganancia;
  const sg = $('stGan');
  sg.textContent = d.huevosProm > 0 ? '$ ' + fmtInt(g) : '—';
  sg.classList.toggle('neg', d.huevosProm > 0 && g < 0);
  $('subRec').textContent = hoy ? `Hoy: ${fmtInt(hoy.juntados)} huevos` : 'Todavía no cargaste hoy';
  $('subVentas').textContent = state.ventas.length ? `${state.ventas.length} venta${state.ventas.length === 1 ? '' : 's'}` : 'A quién vendiste';
  const nCli = new Set(state.ventas.map(v => (v.cliente || '').trim().toLowerCase()).filter(Boolean)).size;
  $('subClientes').textContent = nCli ? `${nCli} cliente${nCli === 1 ? '' : 's'}` : 'Quién te compra';
  $('subAves').textContent = `${fmtInt(d.a.gallinas + d.a.gallos + d.a.pollas)} aves`;
}

/* ---------- recolección ---------- */
$('recFecha').value = todayISO();
$('btnGuardarRec').addEventListener('click', () => {
  const fecha = $('recFecha').value || todayISO();
  const juntados = parseFloat($('recJuntados').value);
  if (!(juntados >= 0)) { toast('Ingresá cuántos huevos juntaste'); $('recJuntados').focus(); return; }
  const entry = { fecha, juntados, nota: $('recNota').value.trim() };
  const i = state.recolecciones.findIndex(r => r.fecha === fecha);
  if (i >= 0) state.recolecciones[i] = entry; else state.recolecciones.push(entry);
  state.recolecciones.sort((a, b) => a.fecha < b.fecha ? 1 : -1);
  save();
  $('recJuntados').value = ''; $('recNota').value = ''; $('recFecha').value = todayISO();
  toast(i >= 0 ? 'Recolección actualizada' : 'Recolección guardada');
  renderRecoleccion();
});
function renderRecoleccion() {
  const box = $('recList');
  if (!state.recolecciones.length) { box.innerHTML = '<div class="empty">Todavía no cargaste ninguna recolección.</div>'; return; }
  box.innerHTML = state.recolecciones.map(r => `
    <div class="item">
      <div class="main"><div class="t">${fmtDate(r.fecha)}</div>${r.nota ? `<div class="s">${esc(r.nota)}</div>` : ''}</div>
      <div class="amt">${fmtInt(r.juntados)}<small>huevos</small></div>
      <button class="del" type="button" data-fecha="${esc(r.fecha)}">Borrar</button>
    </div>`).join('');
  box.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => {
    if (!confirm('¿Borrar esta recolección?')) return;
    state.recolecciones = state.recolecciones.filter(r => r.fecha !== b.dataset.fecha);
    save(); renderRecoleccion();
  }));
}

/* ---------- ventas ---------- */
$('ventaFecha').value = todayISO();
function updateSuggest() {
  const cant = parseFloat($('ventaCantidad').value);
  const row = $('ventaSuggestRow');
  if (cant > 0 && state.aves.precioMaple > 0) {
    const sug = cant * (state.aves.precioMaple / 30);
    row.hidden = false;
    $('ventaSuggest').innerHTML = `Según el precio del maple: ${fmtMoney(sug)} <button type="button" id="btnUseSuggest">Usar</button>`;
    $('btnUseSuggest').addEventListener('click', () => { $('ventaMonto').value = sug.toFixed(2); row.hidden = true; });
  } else row.hidden = true;
}
$('ventaCantidad').addEventListener('input', updateSuggest);
let ventaSeq = Date.now();
$('btnGuardarVenta').addEventListener('click', () => {
  const cantidad = parseFloat($('ventaCantidad').value);
  const monto = parseFloat($('ventaMonto').value) || 0;
  if (!(cantidad > 0)) { toast('Ingresá cuántos huevos vendiste'); $('ventaCantidad').focus(); return; }
  state.ventas.push({
    id: 'v' + (ventaSeq++), fecha: $('ventaFecha').value || todayISO(),
    cliente: $('ventaCliente').value.trim(), cantidad, monto, nota: $('ventaNota').value.trim(),
  });
  state.ventas.sort((a, b) => a.fecha === b.fecha ? (a.id < b.id ? 1 : -1) : (a.fecha < b.fecha ? 1 : -1));
  save();
  ['ventaCliente', 'ventaCantidad', 'ventaMonto', 'ventaNota'].forEach(i => $(i).value = '');
  $('ventaFecha').value = todayISO();
  $('ventaSuggestRow').hidden = true;
  toast('Venta guardada');
  renderVentas();
});
function renderVentas() {
  const names = [...new Set(state.ventas.map(v => (v.cliente || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  $('clientesList').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
  const box = $('ventaList');
  if (!state.ventas.length) { box.innerHTML = '<div class="empty">Todavía no cargaste ninguna venta.</div>'; return; }
  box.innerHTML = state.ventas.map(v => `
    <div class="item">
      <div class="main">
        <div class="t">${v.cliente ? esc(v.cliente) : 'Sin cliente'}</div>
        <div class="s">${fmtDate(v.fecha)} · ${fmtInt(v.cantidad)} huevos${v.nota ? ' · ' + esc(v.nota) : ''}</div>
      </div>
      <div class="amt">${fmtMoney(v.monto)}</div>
      <button class="del" type="button" data-id="${esc(v.id)}">Borrar</button>
    </div>`).join('');
  box.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => {
    if (!confirm('¿Borrar esta venta?')) return;
    state.ventas = state.ventas.filter(v => v.id !== b.dataset.id);
    save(); renderVentas();
  }));
}

/* ---------- clientes ---------- */
const openClients = new Set();
function renderClientes() {
  const groups = {};
  state.ventas.forEach(v => {
    const nombre = (v.cliente || '').trim() || 'Sin cliente';
    const k = nombre.toLowerCase();
    const g = groups[k] || (groups[k] = { nombre, ventas: [], huevos: 0, monto: 0 });
    g.ventas.push(v); g.huevos += v.cantidad || 0; g.monto += v.monto || 0;
  });
  const arr = Object.entries(groups).sort((a, b) => b[1].monto - a[1].monto);
  const box = $('clienteList');
  if (!arr.length) { box.innerHTML = '<div class="empty">Cuando cargues ventas con cliente, van a aparecer acá.</div>'; return; }
  box.innerHTML = arr.map(([k, g]) => {
    const ult = g.ventas.map(v => v.fecha).sort().pop();
    const open = openClients.has(k);
    const det = open ? `<div class="client-sales">${g.ventas.map(v =>
      `<div class="mini"><span>${fmtDate(v.fecha)} · ${fmtInt(v.cantidad)} huevos</span><b>${fmtMoney(v.monto)}</b></div>`).join('')}</div>` : '';
    return `<div class="${open ? 'open' : ''}">
      <button class="item client-head" type="button" data-k="${esc(k)}">
        <div class="main"><div class="t">${esc(g.nombre)}</div>
          <div class="s">${g.ventas.length} venta${g.ventas.length === 1 ? '' : 's'} · ${fmtInt(g.huevos)} huevos · última ${fmtDate(ult)}</div></div>
        <div class="amt">${fmtMoney(g.monto)}</div>
        <span class="chev">›</span>
      </button>${det}</div>`;
  }).join('');
  box.querySelectorAll('.client-head').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k;
    openClients.has(k) ? openClients.delete(k) : openClients.add(k);
    renderClientes();
  }));
}

/* ---------- gráficos ---------- */
const charts = {};
function makeChart(id, cfg) {
  if (charts[id]) charts[id].destroy();
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = cssVar('--sans') || 'sans-serif';
  Chart.defaults.color = cssVar('--ink-soft');
  charts[id] = new Chart($(id), cfg);
}
function palette() {
  return { accent: cssVar('--accent'), yolk: cssVar('--yolk'), brick: cssVar('--brick'), line: cssVar('--line'), ink: cssVar('--ink'), card: cssVar('--card') };
}
const baseOpts = { responsive: true, maintainAspectRatio: false };

function renderResumen() {
  const d = calc();
  $('kpiAves').textContent = fmtInt(d.a.gallinas + d.a.gallos + d.a.pollas);
  $('kpiCosto').textContent = fmtMoney(d.costoTotal);
  $('kpiHuevos').textContent = d.huevosProm > 0 ? fmtNum1(d.huevosProm) : '—';
  const g = d.escenarios[1].ganancia;
  $('kpiGan').textContent = d.huevosProm > 0 ? fmtMoney(g) : '—';
  $('kpiGan').classList.toggle('neg', d.huevosProm > 0 && g < 0);

  const c = palette();
  const vf = ventasPorFecha();
  const junt = {};
  state.recolecciones.forEach(r => junt[r.fecha] = (junt[r.fecha] || 0) + (r.juntados || 0));
  const fechas = [...new Set([...Object.keys(junt), ...Object.keys(vf)])].sort().slice(-14);
  makeChart('chartHistorial', {
    type: 'bar',
    data: { labels: fechas.map(f => fmtDate(f).slice(0, 5)), datasets: [
      { label: 'Juntados', data: fechas.map(f => junt[f] || 0), backgroundColor: c.accent, borderRadius: 4 },
      { label: 'Vendidos', data: fechas.map(f => (vf[f] && vf[f].cantidad) || 0), backgroundColor: c.yolk, borderRadius: 4 },
    ] },
    options: { ...baseOpts, plugins: { legend: { position: 'top', align: 'start' } },
      scales: { y: { beginAtZero: true, grid: { color: c.line } }, x: { grid: { display: false } } } },
  });

  const totalPct = state.alimentos.reduce((s, x) => s + (x.pct || 0), 0) || 1;
  const pal = [c.accent, c.yolk, c.brick, '#5B7A9B', '#9B6B9E', '#B3924A'];
  makeChart('chartComposicion', {
    type: 'doughnut',
    data: { labels: state.alimentos.map(x => x.nombre), datasets: [{
      data: state.alimentos.map(x => d.consTotal * ((x.pct || 0) / totalPct) * ((x.precioBolsa || 0) / 25)),
      backgroundColor: state.alimentos.map((_, i) => pal[i % pal.length]), borderColor: c.card, borderWidth: 3 }] },
    options: { ...baseOpts, plugins: { legend: { position: 'bottom', labels: { boxWidth: 14 } } } },
  });
}

/* ---------- aves y alimento ---------- */
const aveInputs = {
  gallinas: 'inGallinas', gallos: 'inGallos', pollas: 'inPollas', consAdulta: 'inConsAdulta',
  consPolla: 'inConsPolla', precioMaple: 'inPrecioMaple', tasaPostura: 'inTasaPostura',
};
const renderAvesCharts = debounce(() => {
  const d = calc(); const c = palette();
  makeChart('chartConsumo', {
    type: 'bar',
    data: { labels: ['Gallinas', 'Gallos', 'Pollas'], datasets: [{ label: 'kg por día', data: [
      (d.a.gallinas * d.a.consAdulta) / 1000, (d.a.gallos * d.a.consAdulta) / 1000, d.consPollas],
      backgroundColor: [c.accent, c.yolk, c.brick], borderRadius: 4, maxBarThickness: 64 }] },
    options: { ...baseOpts, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: c.line }, ticks: { callback: v => v + ' kg' } }, x: { grid: { display: false } } } },
  });
}, 200);
Object.entries(aveInputs).forEach(([k, id]) => {
  $(id).addEventListener('input', () => {
    state.aves[k] = parseFloat($(id).value) || 0;
    if (k === 'tasaPostura') $('tasaVal').textContent = state.aves.tasaPostura + '%';
    save(); renderAvesCharts();
  });
});
function updateMix() {
  const t = state.alimentos.reduce((s, x) => s + (x.pct || 0), 0);
  const el = $('mixTotal');
  el.innerHTML = `Suma de porcentajes: <b>${fmtInt(t)}%</b>` + (Math.round(t) !== 100 ? ' — revisá que sume 100%' : '');
  el.classList.toggle('warn', Math.round(t) !== 100);
}
function renderFeeds() {
  const box = $('feedList');
  if (!state.alimentos.length) box.innerHTML = '<div class="empty">No hay alimentos cargados.</div>';
  else box.innerHTML = state.alimentos.map((a, i) => `
    <div class="feed">
      <div class="f-name"><label>Alimento</label><input type="text" value="${esc(a.nombre)}" data-i="${i}" data-f="nombre" autocomplete="off"></div>
      <div><label>$ por bolsa 25 kg</label><input type="number" inputmode="decimal" min="0" value="${a.precioBolsa}" data-i="${i}" data-f="precioBolsa"></div>
      <div><label>% de la mezcla</label><input type="number" inputmode="decimal" min="0" max="100" value="${a.pct}" data-i="${i}" data-f="pct"></div>
      <button class="del" type="button" data-del="${i}" aria-label="Quitar alimento">✕</button>
    </div>`).join('');
  box.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    const f = inp.dataset.f;
    state.alimentos[+inp.dataset.i][f] = f === 'nombre' ? inp.value : (parseFloat(inp.value) || 0);
    save(); updateMix(); renderAvesCharts();
  }));
  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('¿Quitar este alimento?')) return;
    state.alimentos.splice(+b.dataset.del, 1);
    save(); renderFeeds(); renderAvesCharts();
  }));
  updateMix();
}
$('btnAddFeed').addEventListener('click', () => {
  state.alimentos.push({ nombre: 'Nuevo alimento', precioBolsa: 0, pct: 0 });
  save(); renderFeeds();
});
function renderAves() {
  Object.entries(aveInputs).forEach(([k, id]) => { $(id).value = state.aves[k]; });
  $('tasaVal').textContent = state.aves.tasaPostura + '%';
  renderFeeds();
  renderAvesCharts();
}

/* ---------- escenarios ---------- */
function renderEscenarios() {
  const d = calc(); const c = palette();
  $('scnList').innerHTML = d.escenarios.map(e => `
    <div class="scn"><div class="nm">${esc(e.nombre)}</div>
      <dl>
        <div><dt>Huevos por día</dt><dd>${fmtNum1(e.huevos)}</dd></div>
        <div><dt>Ingreso por día</dt><dd>${fmtMoney(e.ingreso)}</dd></div>
        <div><dt>Costo por día</dt><dd>${fmtMoney(e.costo)}</dd></div>
        <div><dt>Ganancia por día</dt><dd class="${e.ganancia < 0 ? 'neg' : 'good'}">${fmtMoney(e.ganancia)}</dd></div>
        <div style="grid-column:1/-1"><dt>Ganancia por mes</dt><dd class="${e.mes < 0 ? 'neg' : 'good'}">${fmtMoney(e.mes)}</dd></div>
      </dl></div>`).join('');
  const labels = ['Esc. 1', 'Esc. 2', 'Esc. 3', 'Esc. 4'];
  const opts = { ...baseOpts, plugins: { legend: { display: false } }, scales: { y: { grid: { color: c.line } }, x: { grid: { display: false } } } };
  makeChart('chartGanDia', { type: 'bar', data: { labels, datasets: [{ data: d.escenarios.map(e => e.ganancia),
    backgroundColor: d.escenarios.map(e => e.ganancia < 0 ? c.brick : c.accent), borderRadius: 4 }] }, options: opts });
  makeChart('chartGanMes', { type: 'bar', data: { labels, datasets: [{ data: d.escenarios.map(e => e.mes),
    backgroundColor: d.escenarios.map(e => e.mes < 0 ? c.brick : c.yolk), borderRadius: 4 }] }, options: opts });
}

/* ---------- copia de seguridad ---------- */
async function shareOrDownload(filename, text, mime) {
  const file = new File([text], filename, { type: mime });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Archivo generado');
}
const csvCell = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
$('btnExportJson').addEventListener('click', () => {
  shareOrDownload(`gallinero_copia_${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
});
$('btnCsvRec').addEventListener('click', () => {
  const rows = state.recolecciones.slice().sort((a, b) => a.fecha < b.fecha ? -1 : 1)
    .map(r => [r.fecha, r.juntados, csvCell(r.nota)].join(','));
  shareOrDownload('gallinero_recoleccion.csv', ['fecha,huevos_juntados,nota', ...rows].join('\n') + '\n', 'text/csv');
});
$('btnCsvVentas').addEventListener('click', () => {
  const rows = state.ventas.slice().sort((a, b) => a.fecha < b.fecha ? -1 : 1)
    .map(v => [v.fecha, csvCell(v.cliente), v.cantidad, v.monto, csvCell(v.nota)].join(','));
  shareOrDownload('gallinero_ventas.csv', ['fecha,cliente,huevos_vendidos,ingreso,nota', ...rows].join('\n') + '\n', 'text/csv');
});
$('btnImportJson').addEventListener('click', () => $('fileImport').click());
$('fileImport').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (!p || typeof p.aves !== 'object' || !Array.isArray(p.alimentos) || !Array.isArray(p.recolecciones) || !Array.isArray(p.ventas)) throw new Error('formato');
    if (!confirm('Esto reemplaza todos los datos actuales por los de la copia. ¿Continuar?')) return;
    state = Object.assign(clone(DEFAULT), p);
    state.aves = Object.assign(clone(DEFAULT.aves), p.aves);
    save();
    toast('Copia restaurada');
    show('home');
    history.replaceState({ s: 'home' }, '');
  } catch (err) { toast('Ese archivo no es una copia válida'); }
});

/* ---------- arranque ---------- */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
show('home');
})();
