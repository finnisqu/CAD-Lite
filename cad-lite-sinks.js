/*
  CAD‑Lite — Sinks Card module (UI + rendering)
  ------------------------------------------------
  Drop this file in your project (e.g., /js/sinks.js) and import it after your core app.
  Exposes:
    initSinksCard({ uiMountEl, getSelectedPiece, onStateChange, models })
    renderSinksForPiece({ svg, piece, scale })
    migratePieceForSinks(piece)

  Integration checklist:
  1) Call migratePieceForSinks(piece) whenever you create/import a piece so older saves get sink support.
  2) On selection change, call sinksCard.refresh(). The card auto-opens/closes per rules below.
  3) In your main render loop, call renderSinksForPiece({ svg, piece, scale }).
  4) Ensure piece.rotation (deg), piece.width, piece.height, piece.x, piece.y exist. Units = inches.
  5) Set your global standard sink setback with SINK_STANDARD_SETBACK (inches).
  6) Allow sink clipping by NOT constraining to piece bounds; this renderer draws even if outside.

  Notes:
  • Up to 4 sinks per piece.
  • Faucet holes: 9-checkbox rack, each 1.5" Ø, 2.5" back from sink edge to hole center.
  • Spacing between hole centers = 2".
  • Standard sink front setback = 3.125" (configurable).
  • Side placement selector controls which piece edge hosts the sink (front/back/left/right).
  • Centerline is measured from the piece's X-reference border (depends on side selection—see logic).
  • Sinks rotate with the piece (we apply the piece's rotation to the sink group).
  • No labels on canvas (shapes only).
*/

// ===== Config =====
export const SINK_STANDARD_SETBACK = 3.125; // inches
const MAX_SINKS_PER_PIECE = 4;
const HOLE_DIAMETER = 1.5; // inches
const HOLE_RADIUS = HOLE_DIAMETER / 2;
const HOLE_BACKSET_FROM_SINK_EDGE = 2.5; // center of hole from sink edge (in)
const HOLE_SPACING = 2; // center-to-center (in)

// Provided sink models (example presets). Override via initSinksCard({models}).
const DEFAULT_SINK_MODELS = [
  { id: 'k3218-single', label: 'Kitchen 3218 Single Bowl', shape: 'rect', w: 21, h: 16, cornerR: 0.5 },
  { id: 'k3218-50-50', label: 'Kitchen 3218 50/50 Bowl', shape: 'rect', w: 32, h: 18, cornerR: 0.5 },
  { id: 'k3040-60-40', label: 'Kitchen 60/40 Bowl', shape: 'rect', w: 32, h: 18, cornerR: 0.5 },
  { id: 'oval-1714', label: 'Oval 1714 Vanity', shape: 'oval', w: 17, h: 14, cornerR: 0 },
  { id: 'rect-1813', label: 'Rectangle 1813 Vanity', shape: 'rect', w: 18, h: 13, cornerR: 0.25 },
];

// ===== Data model =====
// piece.sinks: Array<Sink>
// Sink = {
//   id: string,
//   type: 'model' | 'custom',
//   modelId?: string, // when type==='model'
//   shape: 'rect' | 'oval',
//   w: number, h: number, // in inches
//   cornerR: number, // 0..4 for rect, ignored for oval
//   side: 'front' | 'back' | 'left' | 'right', // which edge of the piece the sink is referenced to
//   centerline: number, // inches from reference border along the piece edge
//   setback: number, // distance from chosen edge to sink edge (default SINK_STANDARD_SETBACK)
//   faucets: number[]; // indices 0..8 representing which of the 9 positions are enabled
//   rotation: number // relative rotation (deg), typically 0; combined with piece.rotation in render
// }

export function migratePieceForSinks(piece) {
  if (!piece.sinks) piece.sinks = [];
  return piece;
}

// ===== UI: Sinks Card =====
export function initSinksCard({ uiMountEl, getSelectedPiece, onStateChange, models = DEFAULT_SINK_MODELS }) {
  const state = { models };
  const root = document.createElement('div');
  root.className = 'sinks-card';
  uiMountEl.appendChild(root);

  function renderCard() {
    const piece = getSelectedPiece();
    root.innerHTML = '';

    if (!piece) return; // nothing selected → no card shown (stays empty area)

    migratePieceForSinks(piece);

    if (piece.sinks.length === 0) {
      const addWrap = el('div', 'sinks-add-wrap');
      const btn = el('button', 'btn btn-primary', 'Add sink');
      btn.onclick = () => {
        if (piece.sinks.length >= MAX_SINKS_PER_PIECE) return;
        piece.sinks.push(createDefaultSink());
        onStateChange?.();
        refresh();
      };
      addWrap.appendChild(btn);
      root.appendChild(addWrap);
      return; // interface closed until a sink exists
    }

    // If there are sinks: full interface
    // Header + add button if fewer than 4
    const header = el('div', 'sinks-header');
    header.appendChild(el('div', 'sinks-title', 'Sinks'));
    if (piece.sinks.length < MAX_SINKS_PER_PIECE) {
      const add = el('button', 'btn btn-secondary', '+ Add sink');
      add.onclick = () => {
        piece.sinks.push(createDefaultSink());
        onStateChange?.();
        refresh();
      };
      header.appendChild(add);
    }
    root.appendChild(header);

    // Sink editors
    piece.sinks.forEach((sink, idx) => {
      root.appendChild(renderSinkEditor(piece, sink, idx));
    });
  }

  function renderSinkEditor(piece, sink, index) {
    const card = el('div', 'sink-editor');

    // Row 1: Model vs Custom selector
    const row1 = el('div', 'row');
    const typeSel = select([
      { v: 'model', t: 'Model' },
      { v: 'custom', t: 'Custom' },
    ], sink.type);
    typeSel.onchange = () => {
      sink.type = typeSel.value;
      if (sink.type === 'model') {
        // apply model defaults
        const m = state.models.find(m => m.id === sink.modelId) || state.models[0];
        applyModelToSink(sink, m);
      }
      onStateChange?.();
      refresh();
    };

    const modelSel = select(state.models.map(m => ({ v: m.id, t: m.label })), sink.modelId || state.models[0].id);
    modelSel.onchange = () => {
      sink.modelId = modelSel.value;
      const m = state.models.find(m => m.id === sink.modelId);
      applyModelToSink(sink, m);
      onStateChange?.();
      refresh();
    };

    row1.appendChild(labelWrap('Type', typeSel));
    row1.appendChild(labelWrap('Model', modelSel));
    card.appendChild(row1);

    // Custom interface (shown when type === 'custom')
    if (sink.type === 'custom') {
      const rowCustom = el('div', 'row');
      const shapeSel = select([
        { v: 'rect', t: 'Rectangle' },
        { v: 'oval', t: 'Oval' },
      ], sink.shape);
      shapeSel.onchange = () => { sink.shape = shapeSel.value; onStateChange?.(); };

      const wInput = numInput(sink.w, 0.1);
      wInput.oninput = () => { sink.w = toNum(wInput.value); onStateChange?.(); };
      const hInput = numInput(sink.h, 0.1);
      hInput.oninput = () => { sink.h = toNum(hInput.value); onStateChange?.(); };
      const rInput = numInput(sink.cornerR, 0.1, 0, 4);
      rInput.oninput = () => { sink.cornerR = clamp(toNum(rInput.value), 0, 4); onStateChange?.(); };

      rowCustom.appendChild(labelWrap('Shape', shapeSel));
      rowCustom.appendChild(labelWrap('Width (in)', wInput));
      rowCustom.appendChild(labelWrap('Height (in)', hInput));
      rowCustom.appendChild(labelWrap('Corner R (0–4")', rInput));
      card.appendChild(rowCustom);
    }

    // Row: Side + Centerline + Setback
    const row2 = el('div', 'row');
    const sideSel = select([
      { v: 'front', t: 'Front' },
      { v: 'back', t: 'Back' },
      { v: 'left', t: 'Left' },
      { v: 'right', t: 'Right' },
    ], sink.side || 'front');
    sideSel.onchange = () => { sink.side = sideSel.value; onStateChange?.(); };

    const clInput = numInput(sink.centerline || 0, 0.1);
    clInput.oninput = () => { sink.centerline = toNum(clInput.value); onStateChange?.(); };

    const setbackInput = numInput(sink.setback ?? SINK_STANDARD_SETBACK, 0.125);
    setbackInput.oninput = () => { sink.setback = Math.max(0, toNum(setbackInput.value)); onStateChange?.(); };

    row2.appendChild(labelWrap('Side', sideSel));
    row2.appendChild(labelWrap('Centerline (in)', clInput));
    row2.appendChild(labelWrap('Setback (in)', setbackInput));
    card.appendChild(row2);

    // Row: Faucet holes 9‑pack
    const row3 = el('div', 'row faucet-row');
    const rack = el('div', 'faucet-rack');
    for (let i = 0; i < 9; i++) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = sink.faucets?.includes(i) || false;
      cb.onchange = () => {
        const arr = new Set(sink.faucets || []);
        if (cb.checked) arr.add(i); else arr.delete(i);
        sink.faucets = [...arr].sort((a,b)=>a-b);
        onStateChange?.();
      };
      rack.appendChild(cb);
    }
    row3.appendChild(labelWrap('Faucet holes', rack));
    card.appendChild(row3);

    // Row: Rotate (optional) + Remove
    const row4 = el('div', 'row');
    const rotInput = numInput(sink.rotation || 0, 1);
    rotInput.oninput = () => { sink.rotation = toNum(rotInput.value); onStateChange?.(); };
    const del = el('button', 'btn btn-danger', 'Remove sink');
    del.onclick = () => {
      piece.sinks.splice(index, 1);
      onStateChange?.();
      refresh();
    };
    row4.appendChild(labelWrap('Rotation (°)', rotInput));
    row4.appendChild(el('div', 'grow')); // spacer
    row4.appendChild(del);
    card.appendChild(row4);

    return card;
  }

  function refresh() { renderCard(); }

  function createDefaultSink() {
    const m = state.models[0];
    return {
      id: 'sink_'+Math.random().toString(36).slice(2,9),
      type: 'model',
      modelId: m.id,
      shape: m.shape,
      w: m.w,
      h: m.h,
      cornerR: m.cornerR,
      side: 'front',
      centerline: 0,
      setback: SINK_STANDARD_SETBACK,
      faucets: [],
      rotation: 0,
    };
  }

  function applyModelToSink(sink, model) {
    if (!model) return;
    sink.modelId = model.id;
    sink.shape = model.shape;
    sink.w = model.w;
    sink.h = model.h;
    sink.cornerR = clamp(model.cornerR ?? 0, 0, 4);
  }

  // Utilities (UI)
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function labelWrap(label, node) {
    const wrap = el('label', 'field');
    const cap = el('div', 'field-label', label);
    wrap.appendChild(cap); wrap.appendChild(node);
    return wrap;
  }
  function select(options, value) {
    const s = document.createElement('select');
    options.forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.t; s.appendChild(opt); });
    if (value != null) s.value = String(value);
    return s;
  }
  function numInput(value, step=1, min=null, max=null) {
    const i = document.createElement('input');
    i.type = 'number'; i.value = String(value ?? 0); i.step = String(step);
    if (min!=null) i.min = String(min); if (max!=null) i.max = String(max);
    i.className = 'num'; return i;
  }
  function toNum(v){ const n = parseFloat(v); return isNaN(n)?0:n; }
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  // public API
  const api = { refresh, get root(){ return root; } };
  renderCard();
  return api;
}

// ===== Rendering: draw sinks + faucet holes onto SVG (no labels) =====
export function renderSinksForPiece({ svg, piece, scale=1 }) {
  if (!piece?.sinks?.length) return;

  // Container group for this piece's sinks
  let group = svg.querySelector(`#sinks-for-${piece.id}`);
  if (!group) {
    group = document.createElementNS('http://www.w3.org/2000/svg','g');
    group.setAttribute('id', `sinks-for-${piece.id}`);
    svg.appendChild(group);
  }
  group.innerHTML = '';

  piece.sinks.forEach((sink) => {
    const { cx, cy, angle, sinkRect } = sinkPoseOnPiece(piece, sink);

    // Make a subgroup to carry rotation + translation
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    const tr = `translate(${(piece.x + cx)*scale}, ${(piece.y + cy)*scale}) rotate(${angle})`;
    g.setAttribute('transform', tr);

    // Draw sink shape centered at (0,0) using local coords
    if (sink.shape === 'oval') {
      const rx = (sink.w/2)*scale; const ry = (sink.h/2)*scale;
      const e = svgEl('ellipse', { cx:0, cy:0, rx, ry, fill:'none', stroke:'#333', 'stroke-width':1 });
      g.appendChild(e);
    } else {
      const w2 = (sink.w/2)*scale; const h2 = (sink.h/2)*scale;
      const r = Math.min(sink.cornerR || 0, 4) * scale;
      const path = roundedRectPath(-w2, -h2, w2*2, h2*2, r);
      const p = svgEl('path', { d:path, fill:'none', stroke:'#333', 'stroke-width':1 });
      g.appendChild(p);
    }

    // Faucet holes (drawn behind sink by set back from the nearest sink edge)
    if (Array.isArray(sink.faucets) && sink.faucets.length) {
      // Find the edge normal vector pointing outward from sink to faucet line relative to side
      const holeOffset = holeOffsetFromSinkEdge(sink);
      // Lay out 9 positions horizontally (local coordinates), centered at 0
      const startIndex = -4; // positions -4..+4
      sink.faucets.forEach(idx => {
        const x = (startIndex + idx) * HOLE_SPACING * scale;
        const y = - (sink.h/2 + holeOffset) * scale; // above (negative y) relative to sink local coords
        const c = svgEl('circle', { cx:x, cy:y, r: HOLE_RADIUS*scale, fill:'none', stroke:'#333', 'stroke-width':1 });
        g.appendChild(c);
      });
    }

    group.appendChild(g);
  });
}

// Compute sink center (cx, cy) in piece-local coordinates (origin = piece top-left), then rotate with piece
function sinkPoseOnPiece(piece, sink){
  const side = sink.side || 'front';
  const setback = (sink.setback ?? SINK_STANDARD_SETBACK);

  // Centerline reference: measured from the X-reference border depending on side
  // • front/back → centerline along X from the LEFT border
  // • left/right → centerline along Y from the TOP border
  let cx, cy, angle = (piece.rotation||0) + (sink.rotation||0);

  if (side === 'front') {
    cx = sink.centerline; // from left
    cy = setback + sink.h/2; // from top edge inward
  } else if (side === 'back') {
    cx = sink.centerline; // from left
    cy = piece.height - (setback + sink.h/2); // from bottom edge inward
  } else if (side === 'left') {
    cx = setback + sink.h/2; // we treat sink.h as depth from the side edge when rotated 90
    cy = sink.centerline; // from top
    angle += 90;
  } else { // right
    cx = piece.width - (setback + sink.h/2);
    cy = sink.centerline; // from top
    angle += 90;
  }

  // Also compute a rect for reference if needed
  const sinkRect = { x: cx - sink.w/2, y: cy - sink.h/2, w: sink.w, h: sink.h };
  return { cx, cy, angle, sinkRect };
}

function holeOffsetFromSinkEdge(sink){
  // From sink edge to hole center
  return HOLE_BACKSET_FROM_SINK_EDGE;
}

// SVG helpers
function svgEl(tag, attrs){
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function roundedRectPath(x, y, w, h, r){
  if (r<=0) return `M${x},${y} h${w} v${h} h${-w} z`;
  r = Math.min(r, w/2, h/2);
  const x2 = x+w, y2 = y+h;
  return [
    `M${x+r},${y}`,
    `H${x2-r}`,
    `A${r},${r} 0 0 1 ${x2},${y+r}`,
    `V${y2-r}`,
    `A${r},${r} 0 0 1 ${x2-r},${y2}`,
    `H${x+r}`,
    `A${r},${r} 0 0 1 ${x},${y2-r}`,
    `V${y+r}`,
    `A${r},${r} 0 0 1 ${x+r},${y}`,
    'Z'
  ].join(' ');
}

/* ===== Minimal CSS you can drop into your stylesheet =====
.sinks-card { border:1px solid #ddd; border-radius:12px; padding:12px; margin-top:12px; background:#fafafa; }
.sinks-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.sinks-title{ font-weight:600; }
.sink-editor{ border:1px solid #e6e6e6; border-radius:10px; padding:10px; margin-bottom:10px; background:white; }
.row{ display:flex; gap:10px; flex-wrap:wrap; }
.field{ display:flex; flex-direction:column; gap:4px; min-width:120px; }
.field-label{ font-size:12px; color:#555; }
.num{ width:110px; }
.faucet-row .faucet-rack{ display:flex; gap:8px; align-items:center; }
.btn{ padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#f6f6f6; cursor:pointer; }
.btn-primary{ background:#1a73e8; color:white; border-color:#1a73e8; }
.btn-secondary{ background:#eef3ff; color:#1a52e8; border-color:#cdd6ff; }
.btn-danger{ background:#ffe9e9; color:#b20000; border-color:#ffcccc; }
.grow{ flex:1 1 auto; }
*/
