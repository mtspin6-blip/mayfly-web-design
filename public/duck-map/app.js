/* Montana Duck Map v5 — MapLibre app. Data built by scripts/build_app.py into ./data/.
   Evidence labels: REAL (measured birds), DERIVED (computed from REAL), MODELED (statistical estimate). */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const isPhone = () => window.matchMedia('(max-width: 899px)').matches;
  const C = { corr: '#6a3fb5', corrWeek: '#e8590c', teal: '#0e8a8a', tealFaint: '#5aa9a9', week: '#e8590c', sel: '#111', stop: '#d98c1a', hot: '#7b2cbf' };
  const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const badge = (t) => `<span class="badge b-${t}">${t}</span>`;

  const BASES = {
    topo: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Base: Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS' },
    sat: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Imagery: Esri, Maxar, Earthstar Geographics' },
    plain: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Base: Esri, HERE, Garmin' },
  };
  const PLACES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
  const NWI = 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/services/Wetlands/MapServer/WMSServer?service=WMS&request=GetMap&layers=0&styles=&format=image/png&transparent=true&version=1.1.1&width=256&height=256&srs=EPSG:3857&bbox={bbox-epsg-3857}';

  // Layer registry: id -> {label, evidence, species, on, maplayers, note}
  const LAYERS = [
    { group: 'Flight paths', id: 'corr', label: 'Estimated mallard flight paths', ev: 'MODELED', sp: 'mall', on: true,
      note: 'Where mallards likely move week to week, from eBird changes + real mallard heading. Not observed flights.', ml: ['corr-season', 'corr-week', 'corr-arrows', 'corr-warrows'] },
    { group: 'Flight paths', id: 'tracks', label: 'Blue-winged teal tracks', ev: 'REAL', sp: 'bwte', on: false,
      note: 'Argos satellite fixes, 42 birds 2013–16. Bold = duck season.', ml: ['trk-base', 'trk-arrows', 'trk-week', 'trk-sel'] },
    { group: 'Flight paths', id: 'mallTracks', label: 'Mallard tracks', ev: 'REAL', sp: 'mall', on: false, empty: true,
      note: 'No public mallard GPS crosses Montana yet.', ml: [] },
    { group: 'Flight paths', id: 'bands', label: 'Mallard band → recovery lines', ev: 'REAL', sp: 'mall', on: false, empty: true,
      note: 'Waiting on the NABBP download (needs a browser click).', ml: [] },
    { group: 'Time spent', id: 'stops', label: 'Teal stops (3+ days)', ev: 'DERIVED', sp: 'bwte', on: false,
      note: 'Circle size = days within 5 km. Approximate (Argos error).', ml: ['stops'] },
    { group: 'Hot spots', id: 'hot', label: 'Mallard hot spots', ev: 'MODELED', sp: 'mall', on: true,
      note: 'Top eBird cells for the season, per region. Not time spent.', ml: [] },
    { group: 'Abundance (heat)', id: 'heat', label: 'Mallard abundance by week', ev: 'MODELED', sp: 'mall', on: false,
      note: 'eBird Status & Trends, ~9 km cells, Montana only.', ml: ['heat'] },
    { group: 'Habitat', id: 'nwi', label: 'Wetlands & marshes (NWI)', ev: 'REF', sp: 'any', on: true,
      note: 'Every mapped marsh, pond and wet meadow (USFWS). Zoom in past the state view to see it.', ml: ['nwi'] },
    { group: 'Reference', id: 'zones', label: 'Duck zones & season dates', ev: 'REF', sp: 'any', on: true,
      note: 'Pacific Flyway, Central Zone 1 and 2 (FWP). Tap a zone for dates.', ml: ['zones-fill', 'zones-line'] },
    { group: 'Reference', id: 'towns', label: 'Extra town labels', ev: 'REF', sp: 'any', on: false, note: 'Topo and Satellite already show town names; this adds labels on the Plain map.', ml: [] },
    { group: 'Reference', id: 'refuges', label: 'Refuges, WMAs & duck water', ev: 'REF', sp: 'any', on: true, note: 'Named public areas and well-known water. Approximate points.', ml: ['refuges'] },
    { group: 'Reference', id: 'water', label: 'Major rivers & lakes', ev: 'REF', sp: 'any', on: false, note: 'Natural Earth.', ml: ['rivers', 'lakes'] },
  ];

  const st = { species: 'all', region: 'Statewide', week: 0, fullYear: false, onlyWeek: false, playing: null, selBird: null };
  const D = {};
  let map, weeksList = [], heatCanvas, hotMarkers = [];

  // ------------------------------------------------------------------ load
  const j = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
  Promise.all([j('data/reference.json'), j('data/tracks.geojson'), j('data/stops.geojson'), j('data/birds.json'),
    j('data/hotspots.json'), j('data/ebird.json'), j('data/usgs.json'), j('data/summary.json'),
    j('data/corridors_season.geojson'), j('data/corridors_week.geojson')])
    .then(([ref, tracks, stops, birds, hot, eb, usgs, summary, corrS, corrW]) => {
      Object.assign(D, { ref, tracks, stops, hot, eb, usgs, summary, corrS, corrW, birds: Object.fromEntries(birds.map((b) => [b.id, b])) });
      init();
    }).catch((e) => { document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;top:80px;left:16px;z-index:9;background:#fff;padding:8px">Could not load map data (${esc(e.message)}).</p>`); });

  function weekName(i) { return D.eb.weeks[i]; }
  function buildWeeks() {
    const n = D.eb.weeks.map((w, i) => ({ i, md: w.slice(5) }));
    const [a, b] = D.ref.season;
    weeksList = st.fullYear ? n.map((x) => x.i)
      : [...n.filter((x) => x.md >= a).map((x) => x.i), ...n.filter((x) => x.md <= b).map((x) => x.i)];
    const r = $('#week');
    r.max = weeksList.length - 1;
    let pos = weeksList.indexOf(st.week);
    if (pos < 0) pos = 0;
    r.value = pos; st.week = weeksList[pos];
  }
  function todayWeek() {
    const now = new Date(); const start = Date.UTC(now.getUTCFullYear(), 0, 1);
    const doy = Math.floor((now - start) / 864e5) + 1;
    return Math.max(0, Math.min(51, Math.round((doy - 4) / 7)));
  }

  // ------------------------------------------------------------------ map
  function init() {
    st.week = todayWeek();
    buildWeeks();
    if (weeksList.indexOf(todayWeek()) < 0) { st.week = weeksList[Math.floor(weeksList.length / 2)]; buildWeeks(); }
    const sw = D.ref.regions[0].bbox;
    map = new maplibregl.Map({
      container: 'map', attributionControl: false, dragRotate: false, pitchWithRotate: false,
      bounds: [[sw[0], sw[1]], [sw[2], sw[3]]], fitBoundsOptions: { padding: fitPad() },
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef0ea' } }] },
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true,
      customAttribution: 'Birds: USGS, eBird S&T (Cornell Lab). Wetlands: USFWS NWI.' }), 'bottom-right');
    map.on('load', () => { addLayers(); buildUI(); applyAll(); });
    window.duckMap = map;
  }
  function fitPad() { return isPhone() ? { top: 80, bottom: 150, left: 16, right: 16 } : { top: 80, bottom: 150, left: 40, right: 40 }; }

  function arrowImage(fill, stroke) {
    const s = 24, c = document.createElement('canvas'); c.width = c.height = s;
    const x = c.getContext('2d');
    x.fillStyle = fill; x.strokeStyle = stroke; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(5, 6); x.lineTo(19, 12); x.lineTo(5, 18); x.lineTo(8.5, 12); x.closePath(); x.fill(); x.stroke();
    return x.getImageData(0, 0, s, s);
  }

  function addLayers() {
    for (const [k, b] of Object.entries(BASES)) {
      map.addSource('base-' + k, { type: 'raster', tiles: b.tiles, tileSize: 256, maxzoom: 18, attribution: b.attribution });
      map.addLayer({ id: 'base-' + k, type: 'raster', source: 'base-' + k, layout: { visibility: k === 'sat' ? 'visible' : 'none' },
        paint: { 'raster-opacity': k === 'sat' ? 0.9 : 0.85, 'raster-saturation': k === 'topo' ? -0.35 : 0 } });
    }
    map.addSource('places', { type: 'raster', tiles: [PLACES], tileSize: 256, maxzoom: 18 });
    map.addLayer({ id: 'places', type: 'raster', source: 'places', layout: { visibility: 'visible' } });
    map.addSource('nwi', { type: 'raster', tiles: [NWI], tileSize: 256, minzoom: 7, attribution: 'USFWS NWI' });
    map.addLayer({ id: 'nwi', type: 'raster', source: 'nwi', minzoom: 7, paint: { 'raster-opacity': 0.6 } });

    // MODELED heat (canvas rendered to an image)
    heatCanvas = document.createElement('canvas'); heatCanvas.width = D.eb.w; heatCanvas.height = D.eb.h;
    const [w, s, e, n] = D.eb.bounds;
    map.addSource('heat', { type: 'image', url: blankPng(), coordinates: [[w, n], [e, n], [e, s], [w, s]] });
    map.addLayer({ id: 'heat', type: 'raster', source: 'heat', paint: { 'raster-opacity': 0.75, 'raster-resampling': 'nearest' } });

    map.addSource('zones', { type: 'geojson', data: D.ref.zones });
    map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.01 } });
    map.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': '#ffe08a', 'line-width': 1.4, 'line-opacity': 0.75, 'line-dasharray': [4, 3] } });
    map.addSource('mt', { type: 'geojson', data: D.ref.mt });
    map.addLayer({ id: 'mt', type: 'line', source: 'mt', paint: { 'line-color': '#ffffff', 'line-width': 1.8, 'line-opacity': 0.85, 'line-dasharray': [3, 2] } });
    map.addSource('lakes', { type: 'geojson', data: D.ref.lakes });
    map.addLayer({ id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': '#9cc4dd', 'fill-opacity': 0.5 } });
    map.addSource('rivers', { type: 'geojson', data: D.ref.rivers });
    map.addLayer({ id: 'rivers', type: 'line', source: 'rivers', paint: { 'line-color': '#7fb0cf', 'line-width': 1.2, 'line-opacity': 0.8 } });
    map.addSource('refuges', { type: 'geojson', data: D.ref.places });
    map.addLayer({ id: 'refuges', type: 'circle', source: 'refuges', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 9, 8],
      'circle-color': ['case', ['==', ['get', 'k'], 'water'], '#3d8fd1', '#3f9a4a'], 'circle-opacity': 0.9,
      'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } });

    // DERIVED stops
    map.addSource('stops', { type: 'geojson', data: D.stops });
    map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'days'], 3, 4, 20, 9, 60, 15, 150, 22],
      'circle-color': C.stop, 'circle-opacity': ['case', ['==', ['get', 's'], 1], 0.55, 0.22],
      'circle-stroke-color': '#7a4a00', 'circle-stroke-width': ['case', ['==', ['get', 's'], 1], 1.2, 0.5] } });

    // MODELED estimated mallard flight paths
    map.addImage('arrow', arrowImage('#ffffff', '#0b5d5d'), { pixelRatio: 2 });
    map.addImage('arrowP', arrowImage('#ffffff', C.corr), { pixelRatio: 2 });
    map.addImage('arrowO', arrowImage('#e8590c', '#ffffff'), { pixelRatio: 2 });
    map.addSource('corrS', { type: 'geojson', data: D.corrS });
    map.addSource('corrW', { type: 'geojson', data: D.corrW });
    map.addLayer({ id: 'corr-season', type: 'line', source: 'corrS', layout: { 'line-cap': 'round' }, paint: {
      'line-color': '#b794f6',
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 5.5, ['case', ['>=', ['get', 'share'], 0.01], 0.55, 0], 7, ['case', ['>=', ['get', 'share'], 0.01], 0.55, 0.5]],
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, ['+', 2, ['*', 12, ['get', 'rel']]], 8, ['+', 4, ['*', 26, ['get', 'rel']]]] } });
    map.addLayer({ id: 'corr-arrows', type: 'symbol', source: 'corrS', filter: ['>=', ['get', 'share'], 0.01], layout: {
      'symbol-placement': 'line', 'symbol-spacing': 70, 'icon-image': 'arrowP', 'icon-size': 1.1,
      'icon-allow-overlap': true, 'icon-ignore-placement': true } });
    map.addLayer({ id: 'corr-week', type: 'line', source: 'corrW', layout: { 'line-cap': 'round' }, paint: {
      'line-color': C.corrWeek, 'line-opacity': 0.8, 'line-dasharray': [2, 1.2],
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, ['+', 1.5, ['*', 7, ['get', 'rel']]], 8, ['+', 3, ['*', 14, ['get', 'rel']]]] } });
    map.addLayer({ id: 'corr-warrows', type: 'symbol', source: 'corrW', layout: {
      'symbol-placement': 'line', 'symbol-spacing': 60, 'icon-image': 'arrowO', 'icon-size': 1.2,
      'icon-allow-overlap': true, 'icon-ignore-placement': true } });

    // REAL tracks
    map.addSource('tracks', { type: 'geojson', data: D.tracks });
    map.addLayer({ id: 'trk-base', type: 'line', source: 'tracks', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': ['case', ['==', ['get', 's'], 1], C.teal, C.tealFaint],
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['==', ['get', 's'], 1], 2, 0.8], 8, ['case', ['==', ['get', 's'], 1], 4, 1.6]],
      'line-opacity': ['case', ['==', ['get', 's'], 1], 0.85, 0.35] } });
    map.addLayer({ id: 'trk-arrows', type: 'symbol', source: 'tracks', filter: ['==', ['get', 's'], 1], layout: {
      'symbol-placement': 'line', 'symbol-spacing': 90, 'icon-image': 'arrow', 'icon-size': 0.9,
      'icon-allow-overlap': true, 'icon-ignore-placement': true } });
    map.addLayer({ id: 'trk-week', type: 'line', source: 'tracks', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': C.week, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 8, 6], 'line-opacity': 0.95 } });
    map.addLayer({ id: 'trk-sel', type: 'line', source: 'tracks', filter: ['==', ['get', 'b'], ''], layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': C.sel, 'line-width': 2.5, 'line-opacity': 0.9, 'line-dasharray': [1, 0] } });

    // taps
    const tapLayers = ['trk-week', 'trk-base', 'stops', 'refuges', 'corr-week', 'corr-season', 'zones-fill'];
    map.on('click', (ev) => {
      const box = 10;
      const f = map.queryRenderedFeatures([[ev.point.x - box, ev.point.y - box], [ev.point.x + box, ev.point.y + box]],
        { layers: tapLayers.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none') });
      closePanels(['layers', 'info', 'legend']);
      if (f.length) {
        const pri = ['stops', 'trk-week', 'trk-base', 'refuges', 'corr-week', 'corr-season', 'zones-fill'];
        const top = pri.map((id) => f.find((x) => x.layer.id === id)).find(Boolean) || f[0];
        if (top.layer.id.startsWith('corr')) return showCorr(top.properties, top.layer.id === 'corr-week');
        if (top.layer.id === 'stops') return showStop(top.properties);
        if (top.layer.id === 'refuges') return showRefuge(top.properties, top.geometry.coordinates);
        if (top.layer.id === 'zones-fill') { if (layerOn('heat')) return showCell(ev.lngLat); return showZone(top.properties); }
        return showTrack(top.properties);
      }
      if (layerOn('heat')) return showCell(ev.lngLat);
      hide('card'); selectBird(null);
    });
    for (const l of tapLayers) {
      map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
    }
  }
  function blankPng() { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL(); }

  // ------------------------------------------------------------------ heat rendering
  const RAMP = [[0, [255, 255, 204]], [0.25, [161, 218, 180]], [0.5, [65, 182, 196]], [0.75, [44, 127, 184]], [1, [37, 52, 148]]];
  function ramp(t) {
    for (let k = 1; k < RAMP.length; k++) if (t <= RAMP[k][0]) {
      const [a, ca] = RAMP[k - 1], [b, cb] = RAMP[k], u = (t - a) / (b - a);
      return ca.map((v, i) => Math.round(v + (cb[i] - v) * u));
    }
    return RAMP[RAMP.length - 1][1];
  }
  let heatBytes = null, heatLoading = null;
  function loadHeat() {
    if (heatBytes) return Promise.resolve(heatBytes);
    if (!heatLoading) heatLoading = fetch('data/ebird.bin').then((r) => r.arrayBuffer()).then((b) => (heatBytes = new Uint8Array(b)));
    return heatLoading;
  }
  function qToVal(q) { return q < 2 ? 0 : Math.expm1(((q - 2) / 253) * Math.log1p(D.eb.vmax)); }
  function cellQ(wk, row, col) { return heatBytes[wk * D.eb.w * D.eb.h + row * D.eb.w + col]; }
  function drawHeat() {
    if (!layerOn('heat')) return;
    loadHeat().then(() => {
      const { w, h } = D.eb, ctx = heatCanvas.getContext('2d'), img = ctx.createImageData(w, h), off = st.week * w * h;
      for (let i = 0; i < w * h; i++) {
        const q = heatBytes[off + i];
        if (q < 2) { img.data[i * 4 + 3] = 0; continue; }
        const c = ramp((q - 2) / 253);
        img.data.set([c[0], c[1], c[2], 215], i * 4);
      }
      ctx.putImageData(img, 0, 0);
      map.getSource('heat').updateImage({ url: heatCanvas.toDataURL(), coordinates: map.getSource('heat').coordinates });
    });
  }
  function lngLatToCell(ll) {
    const [w, s, e, n] = D.eb.bounds, merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const col = Math.floor(((ll.lng - w) / (e - w)) * D.eb.w);
    const row = Math.floor(((merc(n) - merc(ll.lat)) / (merc(n) - merc(s))) * D.eb.h);
    return (col < 0 || row < 0 || col >= D.eb.w || row >= D.eb.h) ? null : { row, col };
  }

  // ------------------------------------------------------------------ apply state
  const layerOn = (id) => LAYERS.find((l) => l.id === id).on && spOk(LAYERS.find((l) => l.id === id));
  const spOk = (l) => l.sp === 'any' || st.species === 'all' || st.species === l.sp;
  function setVis(id, v) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none'); }
  function applyAll() {
    for (const l of LAYERS) for (const m of l.ml) setVis(m, layerOn(l.id));
    applyWeek(); drawHotspots(); drawTowns(); renderLegend(); renderLayerList(); renderBanner();
  }
  function applyWeek() {
    const wk = st.week, nm = weekName(wk);
    const moving = layerOn('tracks') ? new Set(D.tracks.features.filter((f) => f.properties.wk === wk).map((f) => f.properties.b)).size : null;
    $('#weekLabel').textContent = `Week of ${fmtDate(nm)}` + (inSeason(nm) ? ' · in season' : ' · off season') +
      (moving === null ? '' : ` · ${moving} teal moving`);
    map.setFilter('corr-week', ['==', ['get', 'wk'], wk]); map.setFilter('corr-warrows', ['==', ['get', 'wk'], wk]);
    setVis('corr-season', layerOn('corr') && !st.onlyWeek); setVis('corr-arrows', layerOn('corr') && !st.onlyWeek);
    map.setFilter('trk-week', ['==', ['get', 'wk'], wk]);
    map.setFilter('trk-base', st.onlyWeek ? ['==', ['get', 'wk'], wk] : null);
    map.setFilter('trk-arrows', st.onlyWeek ? ['all', ['==', ['get', 'wk'], wk]] : ['==', ['get', 's'], 1]);
    const stopNow = ['any',
      ['all', ['<=', ['get', 'wk'], wk], ['>=', ['get', 'wk1'], wk]],
      ['all', ['>', ['get', 'wk'], ['get', 'wk1']], ['any', ['>=', wk, ['get', 'wk']], ['<=', wk, ['get', 'wk1']]]]];
    map.setFilter('stops', st.onlyWeek ? stopNow : null);
    drawHeat();
  }
  function inSeason(nm) { const md = nm.slice(5), [a, b] = D.ref.season; return md >= a || md <= b; }

  let townMarkers = [];
  function drawTowns() {
    townMarkers.forEach((m) => m.remove()); townMarkers = [];
    if (!layerOn('towns')) return;
    for (const f of D.ref.towns.features) {
      const el = document.createElement('div'); el.className = 'town'; el.textContent = f.properties.name;
      townMarkers.push(new maplibregl.Marker({ element: el, anchor: 'left', offset: [-4, 0] }).setLngLat(f.geometry.coordinates).addTo(map));
    }
  }
  function drawHotspots() {
    hotMarkers.forEach((m) => m.remove()); hotMarkers = [];
    if (!layerOn('hot')) return;
    const regs = new Set(D.hot.map((h) => h.region));
    const reg = regs.has(st.region) ? st.region : 'Statewide';
    for (const h of D.hot.filter((x) => x.region === reg)) {
      const el = document.createElement('button');
      el.className = 'hs-pin tier-' + h.tier; el.textContent = h.rank; el.setAttribute('aria-label', `Mallard hot spot ${h.rank}`);
      el.addEventListener('click', (e) => { e.stopPropagation(); showHot(h); });
      hotMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([h.lon, h.lat]).addTo(map));
    }
  }

  // ------------------------------------------------------------------ cards
  function openCard(html) { $('#cardBody').innerHTML = html; show('card'); closePanels(['layers', 'info']); }
  function selectBird(id) { st.selBird = id; map.setFilter('trk-sel', ['==', ['get', 'b'], id || '']); }
  function showTrack(p) {
    const b = D.birds[p.b]; selectBird(p.b);
    openCard(`<h2>Blue-winged teal ${badge('REAL')}</h2>
      <p class="note">Not a mallard. One bird's Argos satellite track. Black line = this bird's whole path.</p>
      <div class="kv"><b>This leg</b><span>${fmtDate(p.d0)} → ${fmtDate(p.d1)} ${p.d0.slice(0, 4)} · ${p.km} km · ended in ${esc(p.r)}</span>
      <b>Bird</b><span>${esc(b.id)}</span><b>Tagged</b><span>${esc(b.tag)}</span>
      <b>Tracked</b><span>${b.first} → ${b.last} (${b.km.toLocaleString()} km total)</span>
      <b>Went</b><span>${b.regions.map(esc).join(' → ')}</span><b>Farthest south</b><span>${esc(b.south)}</span>
      <b>Fixes in MT</b><span>${b.mtFixes}</span></div>
      <p class="note">Bold lines = Sep 26–Jan 19 (Montana season dates, other years). Orange = the week on the slider.
      Argos locations can be off by 0.25 to 10+ km.</p>
      <div class="btnrow"><button id="zoomBird">Zoom to whole track</button></div>`);
    $('#zoomBird').onclick = () => {
      const fs = D.tracks.features.filter((f) => f.properties.b === p.b).flatMap((f) => f.geometry.coordinates);
      const bb = fs.reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])], [180, 90, -180, -90]);
      map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: cardPad() });
    };
  }
  function showCorr(p, week) {
    const kind = p.kind === 'entry' ? 'Arriving in Montana' : p.kind === 'exit' ? 'Leaving Montana' : 'Moving within Montana';
    openCard(`<h2>Estimated mallard flight path ${badge('MODELED')}</h2>
      <p class="note">An estimate of where mallards likely move. Not an observed flight. No real mallard tracks cross Montana yet.</p>
      <div class="kv"><b>From</b><span>${esc(p.from)}</span><b>To</b><span>${esc(p.to)}</span><b>Type</b><span>${kind}</span>
      <b>Distance</b><span>${Math.round(p.km * 0.621)} mi straight line</span>
      <b>Share</b><span>${Math.round(p.share * 100)}% of estimated movement ${week ? 'during the week of ' + fmtDate(weekName(st.week)) : 'over the whole season'}</span></div>
      <p class="note"><b>How it's estimated:</b> eBird shows how many mallards are in each area each week. When one area drops and another rises,
      we route birds along the shortest path, preferring the south-southeast heading real GPS-tracked mallards flew in the Dakotas (USGS).
      Birds that appear with no nearby source come in from Canada; birds that vanish leave the state. It only sees net change, so real traffic is higher.
      Confidence: low to medium. It can't be checked against real Montana mallard tracks yet.</p>`);
  }
  function showStop(p) {
    selectBird(p.b);
    openCard(`<h2>Teal stop: ${p.days} days ${badge('DERIVED')}</h2>
      <p class="note">Blue-winged teal, not mallard. A stop = the bird stayed within 5 km for 3+ days.</p>
      <div class="kv"><b>When</b><span>${fmtDate(p.d0)} → ${fmtDate(p.d1)} ${p.d0.slice(0, 4)}</span>
      <b>Where</b><span>${esc(p.r)}</span><b>Bird</b><span>${esc(p.b)}</span></div>`);
  }
  function zoneOpen(win, md) {
    return JSON.parse(win).some(([a, b]) => (a <= b ? md >= a && md <= b : md >= a || md <= b));
  }
  function showZone(p) {
    const md = weekName(st.week).slice(5), open = zoneOpen(p.win, md);
    openCard(`<h2>${esc(p.zone)}</h2>
      <div class="kv"><b>2026–27 ducks</b><span>${esc(p.dates)}</span><b>Youth days</b><span>Sep 26–27 (statewide)</span>
      <b>Slider week</b><span>${fmtDate(weekName(st.week))}: ${open ? 'open' : 'closed'}</span></div>
      <p class="note">Zones follow county lines (FWP). Dates from the 2026 FWP migratory bird regulations as reported by several outlets.
      <b>Check the FWP regulations before you hunt.</b></p>
      <div class="btnrow"><a href="https://fwp.mt.gov/hunt/regulations/migratory-bird" target="_blank" rel="noopener">FWP regulations</a></div>`);
  }
  function showRefuge(p, c) {
    openCard(`<h2>${esc(p.name)}</h2><p class="note">${p.k === 'water' ? 'Well-known duck water' : 'Public area (' + esc(p.k) + ')'}, approximate point.
      Check FWP / USFWS for access, closures and hunting rules.</p>
      <div class="btnrow"><a href="https://www.google.com/maps/search/?api=1&query=${c[1]},${c[0]}" target="_blank" rel="noopener">Open in Maps</a></div>`);
  }
  function sparkSVG(row, col, title) {
    const vals = D.eb.weeks.map((_, wk) => qToVal(cellQ(wk, row, col)));
    const max = Math.max(...vals, 0.01), W = 340, H = 70, x = (i) => (i / 51) * W, y = (v) => H - 4 - (v / max) * (H - 12);
    const sw = new Set(D.eb.seasonWeeks), runs = [];
    for (let i = 0; i < 52; i++) if (sw.has(i)) { if (runs.length && runs[runs.length - 1][1] === i - 1) runs[runs.length - 1][1] = i; else runs.push([i, i]); }
    const shade = runs.map(([a, b]) => `<rect x="${Math.max(0, x(a) - 3)}" y="0" width="${x(b) - x(a) + 6}" height="${H}" fill="#2f855a" opacity=".12"/>`).join('');
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return { vals, svg: `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(title)}">${shade}
      <polyline points="${pts}" fill="none" stroke="#5b3fa0" stroke-width="2"/>
      <line x1="${x(st.week)}" x2="${x(st.week)}" y1="0" y2="${H}" stroke="#e8590c" stroke-width="2"/></svg>
      <p class="note">Jan → Dec. Green bands = duck season weeks. Orange = slider week.</p>` };
  }
  function showHot(h) {
    loadHeat().then(() => {
      const cell = lngLatToCell({ lng: h.lon, lat: h.lat });
      const sp = cell ? sparkSVG(cell.row, cell.col, 'Weekly mallard abundance') : { svg: '', vals: [] };
      const now = sp.vals.length ? sp.vals[st.week] : null;
      const tierNote = { High: 'top 2% of Montana cells', Medium: 'top 10% of Montana cells', Low: 'below the top 10% statewide' }[h.tier];
      openCard(`<h2>Mallard hot spot #${h.rank} · ${esc(h.region)} ${badge('MODELED')}</h2>
        <p class="note">eBird model estimate of where mallards are. Not tracked birds and not a flight path.</p>
        <div class="kv"><b>Where</b><span>${esc(h.water)} · ${h.townMi} mi from ${esc(h.town)}</span>
        <b>Strength</b><span><b class="tier tier-${h.tier}">${h.tier}</b> (${tierNote}; season avg ${h.v})</span>
        ${now !== null ? `<b>Slider week</b><span>${now.toFixed(1)}</span>` : ''}
        <b>Peak week</b><span>${fmtDate(h.peakWeek)}${h.peakInSeason ? '' : ' (after the season closes)'}</span>
        <b>Public area</b><span>${esc(h.refuge)} (${Math.round(h.refugeKm * 0.621)} mi)</span>
        <b>Location</b><span>${h.lat.toFixed(3)}, ${h.lon.toFixed(3)} (the model's cell is ~6 mi wide)</span></div>
        ${sp.svg}
        <p class="note">Switch to Satellite and zoom in to see the marshes, open water and grain fields in this cell. Access and private land: check FWP / onX.</p>
        <div class="btnrow"><button id="zHot">Zoom in</button>
        <a href="https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lon}" target="_blank" rel="noopener">Open in Maps</a></div>`);
      $('#zHot').onclick = () => map.flyTo({ center: [h.lon, h.lat], zoom: 10, padding: cardPad() });
    });
  }
  function showCell(ll) {
    loadHeat().then(() => {
      const cell = lngLatToCell(ll);
      if (!cell || cellQ(st.week, cell.row, cell.col) === 0) { hide('card'); return; }
      const sp = sparkSVG(cell.row, cell.col, 'Weekly mallard abundance');
      openCard(`<h2>Mallard abundance here ${badge('MODELED')}</h2>
        <div class="kv"><b>Week of ${fmtDate(weekName(st.week))}</b><span>${sp.vals[st.week].toFixed(2)} (relative)</span>
        <b>Location</b><span>${ll.lat.toFixed(3)}, ${ll.lng.toFixed(3)}</span></div>${sp.svg}`);
    });
  }
  function cardPad() { return isPhone() ? { top: 80, bottom: Math.round(window.innerHeight * 0.55), left: 20, right: 20 } : { top: 80, bottom: 160, left: 420, right: 60 }; }

  // ------------------------------------------------------------------ UI
  function show(id) { $('#' + id).classList.remove('hidden'); }
  function hide(id) { $('#' + id).classList.add('hidden'); if (id === 'legend') $('#btnLegend').classList.remove('hidden'); }
  function closePanels(ids) { ids.forEach(hide); }
  function toggle(id) { const el = $('#' + id); const was = el.classList.contains('hidden'); ['layers', 'info'].forEach(hide); if (was) { show(id); hide('card'); } }

  function buildUI() {
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
      hide(b.dataset.close); if (b.dataset.close === 'card') selectBird(null);
      if (b.dataset.close === 'banner') try { localStorage.setItem('duckmap.banner', '1'); } catch (e) { /* ignore */ }
    }));
    $('#btnLayers').onclick = () => toggle('layers');
    $('#btnInfo').onclick = () => { renderInfo(); toggle('info'); };
    $('#btnLegend').onclick = () => { show('legend'); $('#btnLegend').classList.add('hidden'); };
    if (!isPhone()) { show('legend'); $('#btnLegend').classList.add('hidden'); }
    $('#species').onchange = (e) => { st.species = e.target.value; applyAll(); };
    document.querySelectorAll('#baseSeg button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#baseSeg button').forEach((x) => x.classList.toggle('on', x === b));
      Object.keys(BASES).forEach((k) => setVis('base-' + k, k === b.dataset.base));
      setVis('places', b.dataset.base === 'sat');
      map.setPaintProperty('mt', 'line-color', b.dataset.base === 'sat' ? '#ffffff' : '#5b6b62');
      LAYERS.find((l) => l.id === 'towns').on = b.dataset.base === 'plain'; applyAll();
    }));
    const chips = $('#chips');
    for (const r of D.ref.regions) {
      const c = document.createElement('button'); c.className = 'chip' + (r.name === st.region ? ' on' : ''); c.textContent = r.name;
      c.onclick = () => {
        st.region = r.name; chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
        map.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: fitPad(), duration: 800 });
        drawHotspots(); hide('card');
      };
      chips.appendChild(c);
    }
    $('#week').oninput = (e) => { st.week = weeksList[+e.target.value]; applyWeek(); };
    $('#onlyWeek').onchange = (e) => { st.onlyWeek = e.target.checked; applyWeek(); };
    $('#fullYear').onchange = (e) => { st.fullYear = e.target.checked; buildWeeks(); applyWeek(); };
    $('#play').onclick = () => {
      if (st.playing) { clearInterval(st.playing); st.playing = null; $('#play').textContent = '▶'; return; }
      $('#play').textContent = '❚❚';
      st.playing = setInterval(() => {
        const r = $('#week'); r.value = (+r.value + 1) % (+r.max + 1); st.week = weeksList[+r.value]; applyWeek();
      }, 900);
    };
    $('#nearMe').onclick = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((p) => {
        const c = [p.coords.longitude, p.coords.latitude];
        if (!st.me) st.me = new maplibregl.Marker({ color: '#1a73e8' }).setLngLat(c).addTo(map); else st.me.setLngLat(c);
        map.flyTo({ center: c, zoom: 9 });
      }, () => alert('Location not available. Check your browser location permission.'), { enableHighAccuracy: false, timeout: 10000 });
    };
  }

  function renderLayerList() {
    let html = '', g = '';
    for (const l of LAYERS) {
      if (l.group !== g) { g = l.group; html += `<h3>${g}</h3>`; }
      const dis = !spOk(l);
      html += `<label class="lyr${dis || l.empty ? ' disabled' : ''}"><input type="checkbox" data-l="${l.id}" ${l.on && !l.empty ? 'checked' : ''} ${dis || l.empty ? 'disabled' : ''}>
        <span class="nm">${l.label} ${badge(l.ev)}<small>${l.empty ? 'No data yet: ' : ''}${l.note}${dis ? ' (hidden for this species)' : ''}</small></span></label>`;
    }
    $('#layerList').innerHTML = html;
    document.querySelectorAll('#layerList input').forEach((i) => i.addEventListener('change', () => {
      LAYERS.find((l) => l.id === i.dataset.l).on = i.checked; applyAll();
    }));
  }
  function renderLegend() {
    const rows = [];
    if (layerOn('corr')) rows.push(`<div class="lg"><span class="sw" style="background:${C.corr};opacity:.45;height:10px"></span>Estimated mallard path, season (width = birds) ${badge('MODELED')}</div>`,
      `<div class="lg"><span class="sw" style="border-top:4px dashed ${C.corrWeek};height:0;border-radius:0"></span>Estimated mallard moves, slider week ${badge('MODELED')}</div>`);
    if (layerOn('tracks')) rows.push(`<div class="lg"><span class="sw" style="background:${C.teal}"></span>Teal track, duck season ${badge('REAL')}</div>`,
      `<div class="lg"><span class="sw" style="background:${C.tealFaint};opacity:.5;height:4px"></span>Teal track, rest of year</div>`,
      `<div class="lg"><span class="sw" style="background:${C.week}"></span>Moves during slider week</div>`);
    if (layerOn('stops')) rows.push(`<div class="lg"><span class="sw" style="background:${C.stop};border-radius:50%;flex-basis:14px;height:14px;margin:0 7px"></span>Teal stop, size = days ${badge('DERIVED')}</div>`);
    if (layerOn('hot')) rows.push(`<div class="lg"><span class="hs-pin" style="width:22px;height:22px;font-size:11px;margin:0 3px">1</span>Mallard hot spot (rank) ${badge('MODELED')}</div>`);
    if (layerOn('heat')) rows.push(`<div class="lg"><span class="sw" style="background:linear-gradient(90deg,#ffffcc,#41b6c4,#253494)"></span>Mallard abundance, low → high ${badge('MODELED')}</div>`);
    if (layerOn('hot')) rows.push(`<div class="lg"><span class="hs-pin tier-High" style="width:18px;height:18px;font-size:0;margin:0 1px"></span><span class="hs-pin tier-Medium" style="width:18px;height:18px;font-size:0;margin:0 1px"></span><span class="hs-pin tier-Low" style="width:18px;height:18px;font-size:0;margin:0 1px"></span>Strength: high · medium · low</div>`);
    if (layerOn('refuges')) rows.push(`<div class="lg"><span class="sw" style="background:#3f9a4a;border-radius:50%;flex-basis:10px;height:10px;margin:0 9px"></span>Refuge / WMA / WPA</div>`,
      `<div class="lg"><span class="sw" style="background:#3d8fd1;border-radius:50%;flex-basis:10px;height:10px;margin:0 9px"></span>Well-known duck water</div>`);
    if (layerOn('nwi')) rows.push(`<div class="lg"><span class="sw" style="background:#7fc8a9"></span>Wetlands &amp; marshes (zoom in)</div>`);
    if (layerOn('zones')) rows.push(`<div class="lg"><span class="sw" style="border-top:2px dashed #e0b400;height:0;border-radius:0"></span>Duck zone boundary (tap for dates)</div>`);
    rows.push(`<div class="lg"><span class="sw" style="border-top:2px dashed #5b6b62;height:0;border-radius:0"></span>Montana border</div>`);
    if (!rows.length) rows.push('<p class="note">No data layers on.</p>');
    $('#legendBody').innerHTML = rows.join('') + `<p class="note">${badge('REAL')} measured birds · ${badge('DERIVED')} computed from real birds · ${badge('MODELED')} statistical estimate</p>`;
  }
  function renderBanner() {
    let dismissed = false; try { dismissed = localStorage.getItem('duckmap.banner') === '1'; } catch (e) { /* ignore */ }
    const msg = st.species === 'mall'
      ? '<b>Mallard view: all modeled.</b> No real mallard tracks cross Montana yet, so the paths are estimates. Band-recovery lines are next.'
      : st.species === 'bwte'
        ? '<b>Blue-winged teal only.</b> 42 birds tagged in SK, AB, TX and LA (2013–16); 3 passed through Montana.'
        : '<b>Purple lines are estimated mallard flight paths</b> (modeled from eBird, not tracked birds). Orange dashes = this week. Pins = hot spots.';
    $('#bannerText').innerHTML = msg;
    if (dismissed && st.species === 'all') hide('banner'); else show('banner');
  }

  function roseSVG(r) {
    const S = 160, c = S / 2, max = Math.max(...r);
    const wedges = r.map((v, i) => {
      const a0 = ((i * 45 - 22.5 - 90) * Math.PI) / 180, a1 = ((i * 45 + 22.5 - 90) * Math.PI) / 180, R = 12 + (v / max) * (c - 22);
      return `<path d="M${c},${c} L${c + R * Math.cos(a0)},${c + R * Math.sin(a0)} A${R},${R} 0 0 1 ${c + R * Math.cos(a1)},${c + R * Math.sin(a1)} Z" fill="#1d6b3a" opacity=".75"/>`;
    }).join('');
    const lab = ['N', 'E', 'S', 'W'].map((t, i) => { const a = ((i * 90 - 90) * Math.PI) / 180; return `<text x="${c + (c - 8) * Math.cos(a)}" y="${c + (c - 8) * Math.sin(a) + 4}" font-size="11" text-anchor="middle" fill="currentColor">${t}</text>`; }).join('');
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="Direction of first fall migration">${wedges}${lab}</svg>`;
  }
  function renderInfo() {
    const u = D.usgs, s = D.summary;
    $('#infoBody').innerHTML = `
      <h2>Montana Duck Map</h2>
      <p>How ducks move through Montana in duck season: real tracks first, modeled hot spots and abundance underneath.</p>
      <h3>What's on the map</h3>
      <table class="t"><tr><th>Layer</th><th>Type</th><th>Total</th><th>In MT</th></tr>
      <tr><td>Estimated mallard flight paths</td><td>${badge('MODELED')}</td><td>${D.corrS.features.length} season paths</td><td>all</td></tr>
      <tr><td>Mallard GPS tracks</td><td>${badge('REAL')}</td><td>0</td><td>0</td></tr>
      <tr><td>Mallard band → recovery</td><td>${badge('REAL')}</td><td>0</td><td>0</td></tr>
      <tr><td>Blue-winged teal tracks</td><td>${badge('REAL')}</td><td>${s.tealBirds} birds</td><td>${s.tealMtBirds} birds, ${s.tealMtFixes} fixes</td></tr>
      <tr><td>Teal stops 3+ days</td><td>${badge('DERIVED')}</td><td>${s.tealStops}</td><td>${s.tealStopsMt}</td></tr>
      <tr><td>Mallard hot spots</td><td>${badge('MODELED')}</td><td>${D.hot.length}</td><td>${D.hot.length}</td></tr></table>
      <h3>How the estimated flight paths work ${badge('MODELED')}</h3>
      <p class="note">Montana is split into 20 mallard areas: every region's strongest eBird area plus the next strongest. For each week of the season,
      areas that lose birds send them to areas that gain birds, or out of state; gains with no source come in from Canada. Routes take the shortest
      path, prefer the south-southeast heading real GPS mallards flew (USGS, ND/SD), and avoid crossing the Continental Divide unless nothing
      cheaper fits. Small valleys like the Bitterroot get thin paths. It is an estimate: it sees only net change and has not been checked
      against real Montana tracks. Real band recoveries will be the first check.</p>
      <h3>2026–27 Montana duck season</h3>
      <p class="note">Youth days Sep 26–27 · Pacific Flyway Oct 3–Jan 15 (scaup close Dec 27) · Central Zone 1 Oct 3–Jan 7 · Central Zone 2 Oct 3–11 &amp; Oct 24–Jan 19.
      Pacific Flyway = Hill, Chouteau, Cascade, Meagher, Park counties and everything west (includes Great Falls). Zone 2 = Big Horn, Carbon, Custer, Prairie, Rosebud, Treasure, Yellowstone.
      <b>Verify in the FWP regulations before you hunt.</b> The map uses Sep 26–Jan 19 as the season window.</p>
      <h3>What real mallards do ${badge('REAL')}</h3>
      <p class="note">USGS GPS study of ${u.birds} young mallards tagged in North and South Dakota, 2018–2020 (summary tables only; no coordinates are public).</p>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${roseSVG(u.rose)}
      <div class="kv" style="flex:1;min-width:170px"><b>First fall flight</b><span>median ${u.firstMedKm} km, heading ~${u.firstBearing}° (SSE)</span>
      <b>Migration moves</b><span>${u.mig}, median ${u.migMedKm} km</span><b>Local moves</b><span>${u.reg}, median ${u.regMedKm} km</span></div></div>
      <p class="note">Pearse et al. (2023): birds flew farther when it got colder, about 166 km more per 1 °C drop in minimum temperature.</p>
      <h3>Data gaps and next steps</h3>
      <ul class="src"><li><b>Mallard band recoveries</b> (NABBP 1960–2026): needs a browser download from ScienceBase. This will add real mallard start → end lines for Montana.</li>
      <li><b>USGS western waterfowl GPS 2019–20</b> (mallard, pintail, wigeon, shoveler, gadwall, cinnamon teal): browser download; best chance of real mallard lines over Montana.</li>
      <li>eBird at 3 km for more species; weather (cold fronts, freeze-up); habitat (grain, wetlands) for the "why here?" card.</li></ul>
      <h3>Sources</h3>
      <ul class="src">
      <li>Ramey, A.M., Soos, C., Link, P., Walther, P., Tibbitts, T.L., and Douglas, D.C., 2019, Tracking Data for Blue-winged Teal (<i>Anas discors</i>), ver 1.0: USGS Alaska Science Center data release, <a href="https://doi.org/10.5066/P9Z9BA9F">doi:10.5066/P9Z9BA9F</a>. Movebank study 446107870. Public domain.</li>
      <li>${esc(u.citation)}</li>
      <li>${esc(D.eb.citation)}</li>
      <li>U.S. Fish &amp; Wildlife Service, National Wetlands Inventory (WMS). Public domain.</li>
      <li>Montana Fish, Wildlife &amp; Parks, 2026 Migratory Bird Regulations (flyway and zone counties). Season dates as reported for 2026–27; confirm with FWP.</li>
      <li>Public area and duck-water points: approximate, for naming only (project knowledge base, docs/kb/topics/places.md).</li>
      <li>Montana outline, rivers and lakes: Natural Earth (public domain). State boundaries for labels: US Census via us-atlas (public domain); countries: Natural Earth via world-atlas.</li>
      <li>Base maps: Esri World Imagery with Boundaries &amp; Places (default), World Topo and Light Gray Canvas (Esri terms of use). Map software: MapLibre GL JS (BSD-3).</li></ul>
      <p class="note">Built ${s.built}. Personal, non-commercial use. Not a hunting regulation source.</p>`;
  }
})();
