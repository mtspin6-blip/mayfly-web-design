/* Montana Mallards: where are the birds this week, and how do they move through the season?
   Data is built by mallard-map/scripts/build_app.py (eBird S&T model + real tracked-bird insights). */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const isPhone = () => window.matchMedia('(max-width: 899px)').matches;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  const BASES = {
    sat: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    topo: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
  };
  const PLACES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
  const NWI = 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/services/Wetlands/MapServer/WMSServer?service=WMS&request=GetMap&layers=0&styles=&format=image/png&transparent=true&version=1.1.1&width=256&height=256&srs=EPSG:3857&bbox={bbox-epsg-3857}';

  const TOGGLES = [
    { id: 'heat', label: 'Mallard heat map', note: 'Where mallards are this week (eBird model).', on: true, layers: ['heat'] },
    { id: 'paths', label: 'Flight paths', note: 'Likely routes between areas; width follows this week.', on: true, layers: ['paths', 'path-arrows'] },
    { id: 'spots', label: 'Best spots', note: 'Top 10 for this week in the area you picked.', on: true, layers: [] },
    { id: 'wet', label: 'Marshes & wetlands', note: 'Every mapped marsh and pond (USFWS). Zoom in to see them.', on: true, layers: ['nwi'] },
    { id: 'places', label: 'Public land & duck water', note: 'Refuges, WMAs, WPAs and well-known water.', on: false, layers: ['places-pts'] },
    { id: 'zones', label: 'Duck zones & dates', note: 'Pacific Flyway, Central Zone 1 and 2. Tap a zone.', on: false, layers: ['zones-line', 'zones-fill'] },
  ];
  const on = (id) => TOGGLES.find((t) => t.id === id).on;

  const st = { region: 'Statewide', week: 0, playing: null, me: null, meLL: null };
  const D = {};
  let map, weeks = [], pins = [], heatBytes = null, heatCanvas, IDX = 1;

  const j = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
  Promise.all([j('data/reference.json'), j('data/spots.json'), j('data/ebird.json'), j('data/corridors_season.geojson'),
    j('data/timing.json'), j('data/weather.json'), fetch('data/ebird.bin').then((r) => r.arrayBuffer())])
    .then(([ref, spots, eb, paths, timing, wx, bin]) => {
      Object.assign(D, { ref, spots, eb, paths, timing, wx });
      heatBytes = new Uint8Array(bin);
      weeks = eb.seasonWeeks.slice().sort((a, b) => order(a) - order(b));
      IDX = Math.max(...spots.flatMap((s) => weeks.map((w) => s.w[w])));
      init();
    })
    .catch((e) => { $('#loadMsg').textContent = `Could not load map data (${e.message}). Check your connection and reload.`; });

  // season order: Sep (week ~38) first, then into January
  function order(w) { return w < 20 ? w + 52 : w; }
  const wkName = (w) => D.eb.weeks[w];
  const index = (v) => Math.max(0, Math.round((Math.log1p(v) / Math.log1p(IDX)) * 100)); // ~10 points = twice the birds

  function init() {
    if (!window.maplibregl) { $('#loadMsg').textContent = 'The map engine did not load. Reload the page.'; return; }
    if (!maplibregl.supported || (maplibregl.supported && !maplibregl.supported())) { /* v4 has no supported(); WebGL check below */ }
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) { $('#loadMsg').textContent = 'This browser has 3D graphics (WebGL) turned off, which the map needs. Try Safari or Chrome.'; return; }
    const now = new Date(), doy = Math.floor((now - Date.UTC(now.getUTCFullYear(), 0, 1)) / 864e5) + 1;
    const today = Math.max(0, Math.min(51, Math.round((doy - 4) / 7)));
    st.week = weeks.includes(today) ? today : weeks[Math.floor(weeks.length / 2)];
    const r = $('#week'); r.max = weeks.length - 1; r.value = weeks.indexOf(st.week);
    const b = D.ref.regions[0].bbox;
    map = new maplibregl.Map({
      container: 'map', attributionControl: false, dragRotate: false, pitchWithRotate: false,
      bounds: [[b[0], b[1]], [b[2], b[3]]], fitBoundsOptions: { padding: pad() },
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#2b2f2a' } }] },
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Imagery: Esri, Maxar. Birds: eBird Status & Trends (Cornell Lab), USGS. Wetlands: USFWS NWI.' }), 'bottom-right');
    map.on('load', () => { addLayers(); buildUI(); update(); $('#loading').classList.add('hidden'); });
    map.on('error', (e) => { if (!map.loaded()) $('#loadMsg').textContent = 'Map error: ' + ((e && e.error && e.error.message) || 'unknown'); });
    window.duckMap = map;
  }
  const pad = () => (isPhone() ? { top: 70, bottom: 140, left: 14, right: 14 } : { top: 80, bottom: 150, left: 40, right: 40 });
  const cardPad = () => (isPhone() ? { top: 70, bottom: Math.round(window.innerHeight * 0.55), left: 20, right: 20 } : { top: 80, bottom: 160, left: 440, right: 60 });

  // ---------------------------------------------------------------- layers
  function arrow() {
    const s = 24, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.strokeStyle = '#5a2aa0'; x.lineWidth = 1.8;
    x.beginPath(); x.moveTo(5, 6); x.lineTo(19, 12); x.lineTo(5, 18); x.lineTo(8.5, 12); x.closePath(); x.fill(); x.stroke();
    return x.getImageData(0, 0, s, s);
  }
  function addLayers() {
    for (const [k, t] of Object.entries(BASES)) {
      map.addSource('base-' + k, { type: 'raster', tiles: t, tileSize: 256, maxzoom: 18 });
      map.addLayer({ id: 'base-' + k, type: 'raster', source: 'base-' + k, layout: { visibility: k === 'sat' ? 'visible' : 'none' } });
    }
    map.addSource('nwi', { type: 'raster', tiles: [NWI], tileSize: 256, minzoom: 7 });
    map.addLayer({ id: 'nwi', type: 'raster', source: 'nwi', minzoom: 7, paint: { 'raster-opacity': 0.7 } });

    heatCanvas = document.createElement('canvas'); heatCanvas.width = D.eb.w; heatCanvas.height = D.eb.h;
    const [w, s, e, n] = D.eb.bounds;
    map.addSource('heat', { type: 'image', url: heatPng(), coordinates: [[w, n], [e, n], [e, s], [w, s]] });
    map.addLayer({ id: 'heat', type: 'raster', source: 'heat', paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.75, 10, 0.35], 'raster-resampling': 'linear', 'raster-fade-duration': 0 } });

    map.addSource('places', { type: 'raster', tiles: [PLACES], tileSize: 256, maxzoom: 18 });
    map.addLayer({ id: 'places', type: 'raster', source: 'places' });

    map.addSource('zones', { type: 'geojson', data: D.ref.zones });
    map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': '#fff', 'fill-opacity': 0.01 } });
    map.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': '#ffe08a', 'line-width': 1.6, 'line-dasharray': [4, 3] } });
    map.addSource('mt', { type: 'geojson', data: D.ref.mt });
    map.addLayer({ id: 'mt', type: 'line', source: 'mt', paint: { 'line-color': '#ffffff', 'line-width': 1.6, 'line-opacity': 0.8 } });

    map.addImage('arrow', arrow(), { pixelRatio: 2 });
    map.addSource('paths', { type: 'geojson', data: pathData() });
    map.addLayer({ id: 'paths', type: 'line', source: 'paths', layout: { 'line-cap': 'round' }, paint: {
      'line-color': '#c59bff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, ['+', 1, ['*', 16, ['sqrt', ['get', 'now']]]], 9, ['+', 2, ['*', 30, ['sqrt', ['get', 'now']]]]],
      'line-opacity': ['+', 0.18, ['*', 0.7, ['min', 1, ['*', 4, ['get', 'now']]]]] } });
    map.addLayer({ id: 'path-arrows', type: 'symbol', source: 'paths', filter: ['>', ['get', 'now'], 0.04], layout: {
      'symbol-placement': 'line', 'symbol-spacing': 80, 'icon-image': 'arrow', 'icon-size': 1.1, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });

    map.addSource('places-pts', { type: 'geojson', data: D.ref.places });
    map.addLayer({ id: 'places-pts', type: 'circle', source: 'places-pts', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 10, 8], 'circle-color': ['case', ['==', ['get', 'k'], 'water'], '#3d8fd1', '#3f9a4a'],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });

    map.on('click', (ev) => {
      const q = (ids) => map.queryRenderedFeatures([[ev.point.x - 10, ev.point.y - 10], [ev.point.x + 10, ev.point.y + 10]], { layers: ids.filter((l) => map.getLayoutProperty(l, 'visibility') !== 'none') });
      closePanels();
      const pl = q(['places-pts']); if (pl.length) return showPlace(pl[0].properties, pl[0].geometry.coordinates);
      const pa = q(['paths']); if (pa.length) return showPath(pa.sort((a, b) => b.properties.now - a.properties.now)[0].properties);
      const zo = q(['zones-fill']); if (zo.length) return showZone(zo[0].properties);
      hide('card');
    });
    ['paths', 'places-pts'].forEach((l) => {
      map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
    });
  }

  // heat map: warm colors read well on satellite imagery
  const RAMP = [[0, [255, 240, 150, 0]], [0.15, [255, 225, 120, 120]], [0.4, [247, 164, 64, 180]], [0.7, [224, 68, 43, 205]], [1, [143, 18, 64, 225]]];
  function ramp(t) {
    for (let k = 1; k < RAMP.length; k++) if (t <= RAMP[k][0]) {
      const [a, ca] = RAMP[k - 1], [b, cb] = RAMP[k], u = (t - a) / (b - a);
      return ca.map((v, i) => Math.round(v + (cb[i] - v) * u));
    }
    return RAMP[RAMP.length - 1][1];
  }
  function heatPng() {
    if (!heatCanvas) { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL(); }
    const { w, h } = D.eb, ctx = heatCanvas.getContext('2d'), img = ctx.createImageData(w, h), off = st.week * w * h;
    for (let i = 0; i < w * h; i++) {
      const q = heatBytes[off + i];
      if (q < 2) continue;
      img.data.set(ramp((q - 2) / 253), i * 4);
    }
    ctx.putImageData(img, 0, 0);
    return heatCanvas.toDataURL();
  }
  const qToVal = (q) => (q < 2 ? 0 : Math.expm1(((q - 2) / 253) * Math.log1p(D.eb.vmax)));

  function pathData() {
    return { type: 'FeatureCollection', features: D.paths.features.map((f) => ({ ...f, properties: { ...f.properties, w: undefined, now: f.properties.w[st.week] || 0 } })) };
  }

  // ---------------------------------------------------------------- update on week/region change
  function setVis(id, v) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none'); }
  function update() {
    for (const t of TOGGLES) t.layers.forEach((l) => setVis(l, t.on));
    if (on('heat')) map.getSource('heat').updateImage({ url: heatPng(), coordinates: map.getSource('heat').coordinates });
    map.getSource('paths').setData(pathData());
    drawPins(); weekLabel();
    if (!$('#spots').classList.contains('hidden')) renderSpots();
  }
  function rankedSpots() {
    const reg = D.timing.regions[st.region] ? st.region : null;
    const prev = weeks[Math.max(0, weeks.indexOf(st.week) - 1)];
    return D.spots.filter((s) => !reg || s.regions.includes(reg))
      .map((s) => ({ s, now: s.w[st.week], prev: s.w[prev] }))
      .filter((r) => r.now > 0.05).sort((a, b) => b.now - a.now).slice(0, 10);
  }
  function drawPins() {
    pins.forEach((m) => m.remove()); pins = [];
    if (!on('spots')) return;
    rankedSpots().forEach((r, i) => {
      const el = document.createElement('button'); el.className = 'pin'; el.textContent = i + 1;
      el.setAttribute('aria-label', `Spot ${i + 1}: ${r.s.name}`);
      el.addEventListener('click', (e) => { e.stopPropagation(); showSpot(r.s, i + 1); });
      pins.push(new maplibregl.Marker({ element: el }).setLngLat([r.s.lon, r.s.lat]).addTo(map));
    });
  }
  function trend(now, prev) {
    if (!prev || prev < 0.05) return '<span class="flat">–</span>';
    const p = Math.round(((now - prev) / prev) * 100);
    return p >= 5 ? `<span class="up">▲ ${p}% arriving</span>` : p <= -5 ? `<span class="down">▼ ${-p}% leaving</span>` : '<span class="flat">steady</span>';
  }
  function zoneOpen(win, md) { return JSON.parse(win).some(([a, b]) => (a <= b ? md >= a && md <= b : md >= a || md <= b)); }
  function weekLabel() {
    const nm = wkName(st.week), md = nm.slice(5);
    $('#weekLabel').textContent = `Week of ${fmtDate(nm)}`;
    const open = D.ref.zones.features.filter((f) => zoneOpen(f.properties.win, md)).map((f) => f.properties.zone.replace('Central Flyway ', 'Central ').replace(' Flyway', ''));
    const sw = D.timing.statewide, prev = weeks[Math.max(0, weeks.indexOf(st.week) - 1)];
    const pct = Math.round(((sw[st.week] - sw[prev]) / sw[prev]) * 100);
    const move = st.week === weeks[0] ? '' : pct >= 5 ? ` · birds arriving ▲${pct}%` : pct <= -5 ? ` · birds leaving ▼${-pct}%` : ' · numbers steady';
    $('#weekNote').textContent = (open.length === 3 ? 'all zones open' : open.length ? `open: ${open.join(', ')}` : 'season closed') + move;
  }

  // ---------------------------------------------------------------- cards
  function openCard(html) { $('#cardBody').innerHTML = html; closePanels(); show('card'); }
  function seasonChart(vals, label) {
    const W = 340, H = 64, xs = weeks.map((w, i) => (i / (weeks.length - 1)) * W), max = Math.max(...weeks.map((w) => vals[w]), 0.01);
    const y = (v) => H - 4 - (v / max) * (H - 10), cur = weeks.indexOf(st.week);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
      <polygon points="0,${H} ${weeks.map((w, i) => `${xs[i].toFixed(1)},${y(vals[w]).toFixed(1)}`).join(' ')} ${W},${H}" fill="#c59bff" opacity=".35"/>
      <polyline points="${weeks.map((w, i) => `${xs[i].toFixed(1)},${y(vals[w]).toFixed(1)}`).join(' ')}" fill="none" stroke="#6a2fb8" stroke-width="2"/>
      <line x1="${xs[cur]}" x2="${xs[cur]}" y1="0" y2="${H}" stroke="#e8590c" stroke-width="2"/></svg>
      <div class="tl-ends"><span>Late Sep</span><span>Orange = selected week</span><span>Mid Jan</span></div>`;
  }
  function showSpot(s, rank) {
    const prev = weeks[Math.max(0, weeks.indexOf(st.week) - 1)];
    openCard(`<h2>#${rank} ${esc(s.name)}</h2>
      <p class="note">${esc(s.where)}</p>
      <div class="kv"><b>This week</b><span><span class="big">${index(s.w[st.week])}</span> / 100 &nbsp; ${trend(s.w[st.week], s.w[prev])}</span>
      <b>Best week</b><span>${fmtDate(s.peak)} (${index(Math.max(...weeks.map((w) => s.w[w])))} / 100)</span></div>
      ${seasonChart(s.w, 'Mallards here through the season')}
      <p class="note">Bird index: 100 = the best spot in Montana at its best week; every ~10 points is about twice as many birds (eBird model, ~6-mile area).
      Zoom in on satellite to find the water and grain fields; birds roost on open water and feed in fields usually 1–3 miles away.
      Check access and private land before you go.</p>
      <div class="btnrow"><button id="zoomTo">Zoom in</button>
      <a href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}" target="_blank" rel="noopener">Open in Maps</a></div>`);
    $('#zoomTo').onclick = () => map.flyTo({ center: [s.lon, s.lat], zoom: 11, padding: cardPad() });
  }
  function showPath(p) {
    const lvl = p.now >= 0.25 ? 'Heavy' : p.now >= 0.08 ? 'Moderate' : p.now > 0.01 ? 'Light' : 'Little or none';
    const kind = p.kind === 'entry' ? 'Birds arriving in Montana' : p.kind === 'exit' ? 'Birds leaving Montana' : 'Birds moving within Montana';
    openCard(`<h2>${esc(p.from)} → ${esc(p.to)}</h2>
      <div class="kv"><b>What</b><span>${kind}</span><b>This week</b><span><b>${lvl}</b></span>
      <b>Whole season</b><span>${Math.round(p.share * 100)}% of all estimated moves</span><b>Distance</b><span>${Math.round(p.km * 0.621)} miles</span></div>
      <p class="note">An estimate, not a tracked flight. It comes from eBird's weekly mallard numbers: when one area loses birds and another gains them,
      the route between them is drawn, steered by the directions real tracked mallards flew. Ducks migrate at night in broad fronts, so read it as
      "birds move from here toward there", not an exact line. See Guide → How the map works.</p>`);
  }
  function showZone(p) {
    const open = zoneOpen(p.win, wkName(st.week).slice(5));
    openCard(`<h2>${esc(p.zone)}</h2><div class="kv"><b>2026–27 ducks</b><span>${esc(p.dates)}</span><b>Youth days</b><span>Sep 26–27</span>
      <b>Selected week</b><span>${open ? 'Open' : 'Closed'}</span></div>
      <p class="note">Check the FWP regulations before you hunt.</p>
      <div class="btnrow"><a href="https://fwp.mt.gov/hunt/regulations/migratory-bird" target="_blank" rel="noopener">FWP regulations</a></div>`);
  }
  function showPlace(p, c) {
    openCard(`<h2>${esc(p.name)}</h2><p class="note">${p.k === 'water' ? 'Well-known duck water' : 'Public area (' + esc(p.k) + ')'}. Approximate location.
      Check FWP / USFWS for access, closures and rules.</p>
      <div class="btnrow"><a href="https://www.google.com/maps/search/?api=1&query=${c[1]},${c[0]}" target="_blank" rel="noopener">Open in Maps</a></div>`);
  }

  // ---------------------------------------------------------------- best spots list
  function hav(la1, lo1, la2, lo2) {
    const r = Math.PI / 180, a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a)) * 0.621;
  }
  function renderSpots() {
    const t = D.timing.regions[st.region];
    const prev = weeks[Math.max(0, weeks.indexOf(st.week) - 1)];
    const typeText = { 'Early season': 'Best early: birds leave when the water freezes', 'Late season': 'Best late: open water keeps building birds', 'All season': 'Holds birds all season' };
    const head = t ? `<p><span class="rtype">${t.type}</span>${typeText[t.type]}. ${t.share}% of Montana's mallards in season.</p>
      ${seasonChart(t.weekly, 'Mallards in this area through the season')}` : '<p class="note">Showing all of Montana. Pick an area below the map for local spots.</p>';
    const list = rankedSpots().map((r, i) => `<button class="spot" data-i="${D.spots.indexOf(r.s)}" data-r="${i + 1}"><span class="pin">${i + 1}</span>
      <span class="mid"><b>${esc(r.s.name)}</b><small>${esc(r.s.where)}${st.meLL ? ` · ${Math.round(hav(st.meLL[1], st.meLL[0], r.s.lat, r.s.lon))} mi from you` : ''}</small></span>
      <span class="val"><b>${index(r.now)}</b>${trend(r.now, r.prev)}</span></button>`).join('');
    $('#spotsBody').innerHTML = `<h2>Best mallard spots · week of ${fmtDate(wkName(st.week))}</h2>
      <p class="note">${esc(st.region === 'Statewide' ? 'All of Montana' : st.region)}. Move the week slider to plan ahead.</p>${head}
      ${list || '<p>No strong spots this week in this area.</p>'}
      <p class="note">Bird index 0–100: 100 = the best spot in Montana at its best week; every ~10 points ≈ twice the birds. ▲ arriving / ▼ leaving = change from the week before. Estimated from eBird.</p>`;
    document.querySelectorAll('#spotsBody .spot').forEach((b) => b.addEventListener('click', () => {
      const s = D.spots[+b.dataset.i]; map.flyTo({ center: [s.lon, s.lat], zoom: 10, padding: cardPad() }); showSpot(s, +b.dataset.r);
    }));
  }

  // ---------------------------------------------------------------- guide
  let guideDone = false;
  function renderGuide() {
    if (guideDone) return;
    fetch('guide.html').then((r) => r.text()).then((html) => {
      $('#guideBody').innerHTML = html; guideDone = true;
      const wt = $('#wxTable');
      if (wt) wt.innerHTML = `<table><tr><th>Weather</th><th>Days birds left</th><th>Days they stayed</th></tr>${D.wx.rules.map((r) => `<tr><td>${esc(r.label)}</td><td><b>${r.departDays}%</b></td><td>${r.otherDays}%</td></tr>`).join('')}</table>`;
      const rt = $('#regionTable');
      if (rt) {
        const ord = Object.entries(D.timing.regions).sort((a, b) => b[1].share - a[1].share);
        rt.innerHTML = `<table><tr><th>Area</th><th>Type</th><th>Share</th><th>Fall peak</th></tr>${ord.map(([n, t]) => `<tr><td>${esc(n)}</td><td>${t.type}</td><td>${t.share}%</td><td>${fmtDate(t.peak)}</td></tr>`).join('')}</table>`;
      }
    }).catch(() => { $('#guideBody').innerHTML = '<p>Guide could not load.</p>'; });
  }

  // ---------------------------------------------------------------- UI wiring
  const PANELS = ['spots', 'guide', 'settings'];
  function show(id) { $('#' + id).classList.remove('hidden'); }
  function hide(id) { $('#' + id).classList.add('hidden'); }
  function closePanels() { PANELS.forEach(hide); if (isPhone()) $('#keyBody').classList.add('hidden'); document.querySelectorAll('.topbtn').forEach((b) => b.classList.remove('on')); }
  function toggle(id, btn) {
    const was = $('#' + id).classList.contains('hidden'); closePanels(); hide('card');
    if (was) { show(id); btn.classList.add('on'); }
  }
  function buildUI() {
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { hide(b.dataset.close); closePanels(); }));
    $('#btnSpots').onclick = (e) => { renderSpots(); toggle('spots', e.currentTarget); };
    $('#btnGuide').onclick = (e) => { renderGuide(); toggle('guide', e.currentTarget); };
    $('#btnMap').onclick = (e) => toggle('settings', e.currentTarget);
    $('#keyToggle').onclick = () => { const b = $('#keyBody'); b.classList.toggle('hidden'); $('#keyToggle').setAttribute('aria-expanded', String(!b.classList.contains('hidden'))); };
    if (!isPhone()) $('#keyBody').classList.remove('hidden');
    $('#toggles').innerHTML = TOGGLES.map((t) => `<label class="tog"><input type="checkbox" data-t="${t.id}" ${t.on ? 'checked' : ''}><span>${t.label}<small>${t.note}</small></span></label>`).join('');
    document.querySelectorAll('#toggles input').forEach((i) => i.addEventListener('change', () => { TOGGLES.find((t) => t.id === i.dataset.t).on = i.checked; update(); }));
    document.querySelectorAll('#baseSeg button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#baseSeg button').forEach((x) => x.classList.toggle('on', x === b));
      Object.keys(BASES).forEach((k) => setVis('base-' + k, k === b.dataset.base)); setVis('places', b.dataset.base === 'sat');
    }));
    const chips = $('#chips');
    for (const r of D.ref.regions.filter((x) => x.name !== 'Whole flyway' && x.name !== 'MT + neighbors')) {
      const c = document.createElement('button'); c.className = 'chip' + (r.name === st.region ? ' on' : ''); c.textContent = r.name === 'Statewide' ? 'All Montana' : r.name;
      c.onclick = () => {
        st.region = r.name; chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
        map.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: pad(), duration: 800 }); hide('card'); update();
      };
      chips.appendChild(c);
    }
    $('#week').oninput = (e) => { st.week = weeks[+e.target.value]; update(); };
    $('#play').onclick = () => {
      if (st.playing) { clearInterval(st.playing); st.playing = null; $('#play').textContent = '▶'; return; }
      $('#play').textContent = '❚❚';
      st.playing = setInterval(() => { const r = $('#week'); r.value = (+r.value + 1) % (+r.max + 1); st.week = weeks[+r.value]; update(); }, 1100);
    };
    $('#nearMe').onclick = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((p) => {
        const c = [p.coords.longitude, p.coords.latitude]; st.meLL = c;
        if (!st.me) st.me = new maplibregl.Marker({ color: '#1a73e8' }).setLngLat(c).addTo(map); else st.me.setLngLat(c);
        map.flyTo({ center: c, zoom: 9 });
      }, () => alert('Location not available. Check your browser location permission.'), { timeout: 10000 });
    };
  }
})();
