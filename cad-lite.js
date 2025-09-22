   (function(){
    function init(){
      // ------- State -------
      const state = {
        projectName: '',
        projectDate: '',
        notes: '',
        // multi-layout support
        layouts: [],
        active: 0,          // index into layouts[]
        selectedId: null,
        selectedIds: [],    // NEW: multi-selection
        lastSelIndex: -1,   // NEW: for Shift-range in the list
        drag: null,
        showDims: false
      };

      function isSelected(id){ return state.selectedIds.includes(id); }
      function setSelection(ids){
        state.selectedIds = Array.from(new Set(ids));
        state.selectedId = state.selectedIds[state.selectedIds.length - 1] || null; // keep old API working
      }
      function selectOnly(id){ setSelection([id]); }
      function toggleSelect(id){
        if(isSelected(id)) setSelection(state.selectedIds.filter(x=>x!==id));
        else setSelection([...state.selectedIds, id]);
      }
      function clearSelection(){ setSelection([]); }

      window.addEventListener('keydown', (e)=>{
        const ael = document.activeElement;
        const tag = (ael && ael.tagName || '').toLowerCase();
        if(tag==='input' || tag==='textarea' || tag==='select' || (ael && ael.isContentEditable)) return;

        // NEW: figure out targets (multi or single)
        const targets = state.selectedIds.length
          ? state.pieces.filter(p=>state.selectedIds.includes(p.id))
          : (state.selectedId ? [state.pieces.find(x=>x.id===state.selectedId)].filter(Boolean) : []);

        if(!targets.length) return;

        let dx=0, dy=0;
        const step = (e.shiftKey ? 4 : 1) * state.grid;
        if(e.key==='ArrowLeft')  dx = -step;
        else if(e.key==='ArrowRight') dx =  step;
        else if(e.key==='ArrowUp')    dy = -step;
        else if(e.key==='ArrowDown')  dy =  step;
        else return;

        e.preventDefault();

        targets.forEach(p=>{
          const rs = realSize(p);
          p.x = clamp(snap(p.x + dx, state.grid), 0, state.cw - rs.w);
          p.y = clamp(snap(p.y + dy, state.grid), 0, state.ch - rs.h);
        });
        draw(); scheduleSave();
      });


      // create first layout and map legacy props to "current layout"
      const uid = () => Math.random().toString(36).slice(2,9);
      function makeLayout(name){
        return { id: uid(), name: name || 'Layout 1', cw:180, ch:120, scale:6, grid:1, showGrid:true, pieces: [] };
      }
      state.layouts = [ makeLayout('Layout 1') ];
      const cur = () => state.layouts[state.active];
      // Map old properties to current layout so the rest of the code keeps working
      ['cw','ch','scale','grid','showGrid','pieces'].forEach(k=>{
        Object.defineProperty(state, k, {
          get(){ return cur()[k]; },
          set(v){ cur()[k] = v; }
        });
      });


      // ------- Elements -------
      const svg = document.getElementById('lc-svg');
      const meta = document.getElementById('lc-meta');
      const inCW = document.getElementById('lc-cw');
      const inCH = document.getElementById('lc-ch');
      const inGrid = document.getElementById('lc-grid');
      const inScale = document.getElementById('lc-scale');
      const lblScale = document.getElementById('lc-scale-label');
      const inShowDims = document.getElementById('lc-showdims');
      const layoutsEl  = document.getElementById('lc-layouts');
      const btnAddLayout = document.getElementById('lc-add-layout');
      const inNotes = document.getElementById('lc-notes');
      const btnExportPDF = document.getElementById('lc-export-pdf');
      const inShowGrid = document.getElementById('lc-showgrid');
      const btnSnapAll = document.getElementById('lc-snapall');
      const btnReset  = document.getElementById('lc-reset');
      const btnClearSel = document.getElementById('lc-clear-sel');

      const inspectorCard = document.getElementById('lc-inspector');

      const SINK_MODELS = {
        'SS_3218': {
          id: 'SS_3218',
          label: 'SS 3218',
          shape: 'rect',
          outerW: 31,
          outerH: 17,
          cornerR: 4,        // inches
        },
        'US_1714_OVAL': {
          id: 'US_1714_OVAL',
          label: 'US 1714 Oval',
          shape: 'oval',
          outerW: 17,
          outerH: 14,
          cornerR: 0,
        },
        'US_1813_RECT': {
          id: 'US_1813_RECT',
          label: 'US 1813 Rectangle',
          shape: 'rect',
          outerW: 18,
          outerH: 13,
          cornerR: 2,
        },
      };

      const FAUCET_HOLE_DIAMETER = 1.5;        // in
      const FAUCET_HOLE_RADIUS   = FAUCET_HOLE_DIAMETER / 2; // 0.75"
      const FAUCET_HOLE_BACKSET  = 2.5;        // distance from sink edge to hole center
      const FAUCET_HOLE_PITCH    = 2;          // center-to-center gap
      const MAX_SINKS_PER_PIECE  = 4;
      const DEFAULT_SINK_SETBACK = 3.125;      // front edge setback (piece front to sink front)
      
      // store the largest “selected” inspector height we've seen
      let inspectorLockH = 0;
      function lockInspectorHeight(px){
        if (!inspectorCard) return;
        const h = Math.max(0, Math.round(px||0));
        if (h > inspectorLockH){
          inspectorLockH = h;
          inspectorCard.style.minHeight = inspectorLockH + 'px';
        }
      }


      const svgNS = 'http://www.w3.org/2000/svg';
      let gGrid = document.getElementById('g-grid');
      let gPieces = document.getElementById('g-pieces');
      let gOverlay = document.getElementById('g-overlay');
      if(!gGrid){
        gGrid   = document.createElementNS(svgNS,'g'); gGrid.id='g-grid';
        gPieces = document.createElementNS(svgNS,'g'); gPieces.id='g-pieces';
        gOverlay= document.createElementNS(svgNS,'g'); gOverlay.id='g-overlay';
        gGrid.innerHTML = '';
        gPieces.innerHTML = '';
        svg.append(gGrid, gPieces, gOverlay);
      }

      function endDrag(){
        if(!state.drag) return;
        // snap to grid now (once)
        state.drag.group.forEach(gp=>{
          const piece = state.pieces.find(x=>x.id===gp.id);
          if(!piece) return;
          piece.x = snap(piece.x, state.grid);
          piece.y = snap(piece.y, state.grid);
        });
        state.drag = null;
        draw(); scheduleSave();
      }
      svg.addEventListener('pointerup', endDrag);
      svg.addEventListener('pointerleave', endDrag);


      const appRoot = document.querySelector('.lite-cad') || document.body;
      appRoot.addEventListener('input',  (e)=>{ if(e.target.id==='lc-import') return; scheduleSave(); }, {passive:true});
      appRoot.addEventListener('change', (e)=>{ if(e.target.id==='lc-import') return; scheduleSave(); }, {passive:true});


      const STARTER_LAYOUT = {
        project: { name: "Test", date: "2025-09-19" },
        canvas: { w: 180, h: 120 },
        grid: 1,
        scale: 6,
        showGrid: true,
        pieces: [
          { id:"pw7skui", name:"Kitchen Island", w:96, h:42, x:10, y:45, rotation:0, color:"#e0aeae", layer:1,  rTL:true,  rTR:true,  rBL:true,  rBR:true },
          { id:"lijhc17", name:"Range Left",     w:36, h:25.5, x:6,  y:9,  rotation:0, color:"#e0aeae", layer:3,  rTL:false, rTR:false, rBL:false, rBR:false },
          { id:"qk3rabq", name:"Range Right",    w:36, h:25.5, x:72, y:9,  rotation:0, color:"#e0aeae", layer:4,  rTL:false, rTR:false, rBL:false, rBR:false },
          { id:"umps9pz", name:"Backsplash",     w:36, h:4,    x:6,  y:4,  rotation:0, color:"#efd8d8", layer:5,  rTL:false, rTR:false, rBL:false, rBR:false },
          { id:"vgph990", name:"Backsplash",     w:36, h:4,    x:72, y:4,  rotation:0, color:"#efd8d8", layer:6,  rTL:false, rTR:false, rBL:false, rBR:false },
          { id:"hwtj1ol", name:"RANGE",          w:30, h:25.5, x:42, y:9,  rotation:0, color:"#ffffff", layer:7,  rTL:false, rTR:false, rBL:false, rBR:false },
          { id:"4kmg4v9", name:"Vanity",         w:31, h:22.5, x:127,y:10, rotation:0, color:"#d5f0f0", layer:8,  rTL:false, rTR:false, rBL:true,  rBR:false },
          { id:"rlc7ihx", name:"Backsplash",     w:31, h:4,    x:127,y:5,  rotation:0, color:"#d5f0f0", layer:9,  rTL:false, rTR:false, rBL:false, rBR:false },
          { id:"vz8r7lh", name:"Backsplash",     w:4,  h:22.5, x:159,y:10, rotation:0, color:"#d5f0f0", layer:10, rTL:false, rTR:false, rBL:false, rBR:false }
        ]
      };

      const list = document.getElementById('lc-list');
      const inspector = document.getElementById('lc-inspector');
      const btnAdd = document.getElementById('lc-add');

      const btnExportJSON = document.getElementById('lc-export-json');
      const btnExportPNG  = document.getElementById('lc-export-png');
      const btnExportSVG  = document.getElementById('lc-export-svg');
      const inImport = document.getElementById('lc-import');
      const btnImport = document.getElementById('lc-import-btn');
      const importName = document.getElementById('lc-import-name');
      const btnLoadStarter = document.getElementById('lc-load-starter');
      if (btnLoadStarter) {
        btnLoadStarter.addEventListener('click', (e) => { e.preventDefault(); loadLayout(STARTER_LAYOUT); scheduleSave(); });
      } 


      const inProject = document.getElementById('lc-project');
      const inDate = document.getElementById('lc-date');

      // --- Mobile layout reordering: move Import/Export after Canvas ---
      const mm = window.matchMedia('(max-width: 899px)');
      const col2 = document.querySelector('.lc-col:nth-child(2)');
      const col3 = document.querySelector('.lc-col:nth-child(3)');
      const canvasCard    = col3?.querySelector('.lc-card');               // the canvas section
      const inspectorPanel= col2?.querySelector('.lc-card:nth-child(1)');  // Inspector (outer card)
      const importCard    = col2?.querySelector('.lc-card:nth-child(2)');  // Import/Export

function ensureJsPDF(){
  return new Promise((resolve,reject)=>{
    if(window.jspdf && window.jspdf.jsPDF){ return resolve(window.jspdf.jsPDF); }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = ()=> resolve(window.jspdf.jsPDF);
    s.onerror = ()=> reject(new Error('Failed to load jsPDF'));
    document.head.appendChild(s);
  });
}

btnExportPDF && (btnExportPDF.onclick = async ()=>{
      if(!requireProjectName()) return;
      const serializer = new XMLSerializer();
      const src = serializer.serializeToString(svg);
      const img = new Image();
      const W = Number(svg.getAttribute('width')), H = Number(svg.getAttribute('height'));
      const canvas = document.createElement('canvas'); canvas.width=W; canvas.height=H;
      const ctx = canvas.getContext('2d');
      img.onload = async ()=>{
        ctx.drawImage(img,0,0);
        const dataURL = canvas.toDataURL('image/png');
        try{
          const jsPDF = await ensureJsPDF();
          const isLandscape = W>H;
          const doc = new jsPDF({ orientation: isLandscape?'landscape':'portrait', unit:'pt', format:'letter' });
          const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
          const margin = 36; // 0.5"
          const maxW = pageW - margin*2;
          // Header: Project / Date / Layout
          const title = (state.projectName||'Untitled Project');
          const date  = (state.projectDate||todayISO());
          const lname = (state.layouts[state.active]?.name)||'Layout 1';
          doc.setFont('helvetica','bold'); doc.setFontSize(14);
          doc.text(title, margin, margin);
          doc.setFont('helvetica','normal'); doc.setFontSize(11);
          doc.text(`Date: ${date}`, margin, margin+16);
          doc.text(`Layout: ${lname}`, margin, margin+32);
          // Image under the header
          const headerH = 32 + 8; // header lines + a little spacing
          const availH = pageH - margin*2 - headerH;
          const scale = Math.min(1, maxW / W, availH / H);
          const imgW = W*scale, imgH = H*scale;
          const imgY = margin + headerH;
          doc.addImage(dataURL, 'PNG', margin, imgY, imgW, imgH);

          const notes = (state.notes||'').trim();
          if(notes){
            const yStart = margin + imgH + 16;
            const lines = doc.splitTextToSize(`Notes: ${notes}`, pageW - margin*2);
            doc.text(lines, margin, yStart);
          }
          doc.save(`${fileBase()}.pdf`);
        }catch(err){
          alert('Could not export PDF (jsPDF failed to load). Try PNG/SVG instead.');
        }
      };
      img.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(src);
    });


      function placeForMobile(isMobile){
        if(!col2 || !col3 || !canvasCard || !inspectorPanel|| !importCard) return;

        if(isMobile){
          // 1) Ensure toolbar (settings) lives below the canvas
          const toolbar   = canvasCard.querySelector('.lc-toolbar');
          const canvasWrap= canvasCard.querySelector('.lc-canvas-wrap');
          if(toolbar && canvasWrap && toolbar.nextElementSibling !== null){
            canvasWrap.insertAdjacentElement('afterend', toolbar);
          }

          // 2) Move Import/Export card directly after the Canvas card
          col3.insertBefore(importCard, canvasCard.nextSibling);
        }else{
          // Restore desktop structure: toolbar above canvas, Import/Export back under Inspector
          const toolbar = canvasCard.querySelector('.lc-toolbar');
          const topRow  = canvasCard.querySelector('.lc-top');
          if(toolbar && topRow){
            topRow.insertAdjacentElement('beforebegin', toolbar);
          }
          col2.insertBefore(importCard, inspectorPanel.nextSibling);
        }
      }

      mm.addEventListener('change', e => placeForMobile(e.matches));
      placeForMobile(mm.matches); // run once on load


      // ------- Utils -------
      const clamp = (n,min,max) => Math.min(max, Math.max(min, n));
      const snap  = (n,step) => Math.round(n/step)*step;
      const i2p   = (inches) => inches*state.scale;
      const p2i   = (px) => px/state.scale;
      function svgPoint(evt){
        // convert client (page) coords to SVG coords
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX; pt.y = evt.clientY;
        const ctm = svg.getScreenCTM();
        if(!ctm) return { x: 0, y: 0 };
        const p = pt.matrixTransform(ctm.inverse());
        return { x: p.x, y: p.y };
      }
      const todayISO = ()=>{ const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; };
      const cleanName = (s)=> String(s||'').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim();
      const fileBase = ()=> `${cleanName(state.projectName||'Untitled').replace(/\s+/g,'_')}_${(state.projectDate||todayISO())}`;

      function syncToolbarFromLayout(){
        inCW.value = state.cw; inCH.value = state.ch; inGrid.value = state.grid;
        inScale.value = state.scale; lblScale.textContent = String(state.scale);
        inShowGrid.checked = state.showGrid;
      }

      function exportJSON(){
        return {
          project: { name: state.projectName.trim(), date: state.projectDate || todayISO(), notes: state.notes || '' },
          layoutName: cur().name,
          canvas: { w: state.cw, h: state.ch },
          grid: state.grid, scale: state.scale, showGrid: state.showGrid,
          pieces: state.pieces
        };
      }


      const SAVE_KEY = 'litecad:v2';
      function exportApp(){
        return {
          project: { name: state.projectName || '', date: state.projectDate || todayISO(), notes: state.notes || '' },
          layouts: state.layouts
        };
      }

      let saveTimer = null;
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{ try{
    localStorage.setItem(SAVE_KEY, JSON.stringify(exportApp()));
  }catch(_){} }, 400);
}

function restore(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);

    if(data.layouts && Array.isArray(data.layouts)){
      state.layouts = data.layouts.map(L => ({ ...L, id: L.id || uid() }));
      state.active = 0;
      state.projectName = data.project?.name || '';
      state.projectDate = data.project?.date || todayISO();
      state.notes = data.project?.notes || '';
      inProject.value = state.projectName;
      inDate.value = state.projectDate;
      if(inNotes) inNotes.value = state.notes;
      syncToolbarFromLayout();
      renderLayouts(); renderList(); updateInspector(); draw();
      return true;
    } else {
      // fallback: legacy single-layout file
      loadLayout(data); renderLayouts(); return true;
    }
  } catch(err){ return false; }
}


      window.addEventListener('beforeunload', ()=>{ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(exportApp())); }catch(_){} });


      // --- Text contrast helper ---
      function _hexToRgb(hex){
        const m = String(hex||'').trim().match(/^#?([a-f0-9]{3}|[a-f0-9]{6})$/i);
        if(!m) return {r:219,g:234,b:254}; // fallback
        let h = m[1].toLowerCase();
        if(h.length===3) h = h.split('').map(c=>c+c).join('');
        const n = parseInt(h,16);
        return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
      }
      function _srgbToLin(c){ c/=255; return (c<=0.03928)? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
      function _relLum({r,g,b}){ const R=_srgbToLin(r),G=_srgbToLin(g),B=_srgbToLin(b); return 0.2126*R+0.7152*G+0.0722*B; }
      function pickTextColor(bgHex){
        const L = _relLum(_hexToRgb(bgHex));
        const contrastWhite = (1.0 + 0.05) / (L + 0.05);
        const contrastBlack = (L + 0.05) / (0.012 + 0.05); // ~#111 luminance
        return (contrastWhite > contrastBlack) ? '#ffffff' : '#111111';
      }


      function realSize(p){
        const deg = Math.max(0, Math.min(90, Number(p.rotation||0)));
        const t = deg * Math.PI / 180;
        const W = p.w, H = p.h;
        // axis-aligned bounding box of a W×H rect rotated by t
        const bw = Math.abs(W * Math.cos(t)) + Math.abs(H * Math.sin(t));
        const bh = Math.abs(W * Math.sin(t)) + Math.abs(H * Math.cos(t));
        return { w: bw, h: bh };
      }

      function clampToCanvas(p){ const rs=realSize(p); p.x=clamp(p.x,0,state.cw-rs.w); p.y=clamp(p.y,0,state.ch-rs.h); }

      function roundedRectPath(x,y,w,h,r){
        const rtl=r.tl||0, rtr=r.tr||0, rbr=r.br||0, rbl=r.bl||0;
        return `M${x+rtl},${y} H${x+w-rtr} Q${x+w},${y} ${x+w},${y+rtr} V${y+h-rbr} Q${x+w},${y+h} ${x+w-rbr},${y+h} H${x+rbl} Q${x},${y+h} ${x},${y+h-rbl} V${y+rtl} Q${x},${y} ${x+rtl},${y} Z`;
      }

      // ------- Drawing -------
      function draw(){
        const Wpx = i2p(state.cw), Hpx = i2p(state.ch);
        svg.setAttribute('width', Wpx);
        svg.setAttribute('height', Hpx);
        svg.setAttribute('viewBox', `0 0 ${Wpx} ${Hpx}`);
        while(svg.firstChild) svg.removeChild(svg.firstChild);

        const border = document.createElementNS('http://www.w3.org/2000/svg','rect');
        border.setAttribute('x',0); border.setAttribute('y',0);
        border.setAttribute('width', Wpx); border.setAttribute('height', Hpx);
        border.setAttribute('fill','#fff'); border.setAttribute('stroke','#e5e7eb');
        svg.appendChild(border);

        if(state.showGrid){
          const g = document.createElementNS('http://www.w3.org/2000/svg','g');
          const stepPx = i2p(state.grid);
          for(let x=0; x<=Wpx+0.5; x+=stepPx){
            const v=document.createElementNS('http://www.w3.org/2000/svg','line');
            v.setAttribute('x1',x); v.setAttribute('y1',0); v.setAttribute('x2',x); v.setAttribute('y2',Hpx);
            v.setAttribute('stroke','#e5e7eb'); v.setAttribute('stroke-width', (x%(stepPx*6)===0)?1.25:0.5); v.setAttribute('opacity', (x%(stepPx*6)===0)?0.9:0.7);
            g.appendChild(v);
          }
          for(let y=0; y<=Hpx+0.5; y+=stepPx){
            const h=document.createElementNS('http://www.w3.org/2000/svg','line');
            h.setAttribute('x1',0); h.setAttribute('y1',y); h.setAttribute('x2',Wpx); h.setAttribute('y2',y);
            h.setAttribute('stroke','#e5e7eb'); h.setAttribute('stroke-width', (y%(stepPx*6)===0)?1.25:0.5); h.setAttribute('opacity', (y%(stepPx*6)===0)?0.9:0.7);
            g.appendChild(h);
          }
          svg.appendChild(g);
        }

        // sort by layer
        const sorted = [...state.pieces].sort((a,b)=> (a.layer||0) - (b.layer||0));

        sorted.forEach((p,idx)=>{
          const rs = realSize(p);
          const x = i2p(p.x), y=i2p(p.y), W=i2p(rs.w), H=i2p(rs.h);
          const fg = pickTextColor(p.color || '#ffffff'); // NEW
          const g = document.createElementNS('http://www.w3.org/2000/svg','g');
          g.setAttribute('data-id', p.id);
          g.style.cursor='move';

          const rIn = i2p(1); // 1 inch corner radius when enabled
          const r = { tl: p.rTL? rIn:0, tr: p.rTR? rIn:0, br: p.rBR? rIn:0, bl: p.rBL? rIn:0 };
            // --- rotation-aware drawing ---
          const rot = Math.max(0, Math.min(90, Number(p.rotation||0)));
          const W0 = i2p(p.w), H0 = i2p(p.h);     // the unrotated piece size in px
          const BW = W, BH = H;                   // rotated bbox size in px (already computed above)
          const cx = x + BW/2, cy = y + BH/2;     // center of the rotated bbox

          // child group that we rotate around the piece center
          const gg = document.createElementNS('http://www.w3.org/2000/svg','g');
          if (rot) gg.setAttribute('transform', `rotate(${rot}, ${cx}, ${cy})`);

          // draw the rectangle unrotated, centered at (cx,cy), then rotate gg
          const path = document.createElementNS('http://www.w3.org/2000/svg','path');
          path.setAttribute('d', roundedRectPath(cx - W0/2, cy - H0/2, W0, H0, r));
          path.setAttribute('fill', p.color || '#ffffff');
          path.setAttribute('stroke', '#94a3b8');
          path.setAttribute('stroke-width', '1');
          gg.appendChild(path);

          // selected outline (keep corners, do not scale stroke)
          if (isSelected(p.id)) {
            const outline = document.createElementNS(svgNS, 'path');
            outline.setAttribute('d', roundedRectPath(cx - W0/2, cy - H0/2, W0, H0, r));
            outline.setAttribute('fill', 'none');
            outline.setAttribute('stroke', '#0ea5e9');
            outline.setAttribute('stroke-width', '2');
            outline.setAttribute('vector-effect', 'non-scaling-stroke');
            outline.setAttribute('pointer-events', 'none');
            gg.appendChild(outline);
          }

          g.appendChild(gg); // append rotated geometry to the piece group




          const text = document.createElementNS('http://www.w3.org/2000/svg','text');
          text.setAttribute('x', x + W/2); 
          text.setAttribute('y', y + H/2 - 6);
          text.setAttribute('text-anchor','middle'); 
          text.setAttribute('font-size','12'); 
          text.setAttribute('fill',fg);
          const t1 = document.createElementNS('http://www.w3.org/2000/svg','tspan'); 
            t1.setAttribute('x', x + W/2); 
            t1.setAttribute('dy', 0); 
            t1.textContent = p.name || 'Piece';
          const t2 = document.createElementNS('http://www.w3.org/2000/svg','tspan'); 
            t2.setAttribute('x', x + W/2); 
            t2.setAttribute('dy', 14); 
            t2.textContent = `${p.w}" × ${p.h}"${(p.rotation?` · ${p.rotation}°`:``)}`;
         text.appendChild(t1);
         text.appendChild(t2);
          g.appendChild(text);
          if(state.showDims){
            const dimStroke = '#94a3b8';
            // width dimension (above piece)
            const y0 = Math.max(0, y - 12);
            const wLine = document.createElementNS('http://www.w3.org/2000/svg','line');
            wLine.setAttribute('x1', x); wLine.setAttribute('y1', y0);
            wLine.setAttribute('x2', x+W); wLine.setAttribute('y2', y0);
            wLine.setAttribute('stroke', dimStroke); wLine.setAttribute('vector-effect','non-scaling-stroke');
            const wT = document.createElementNS('http://www.w3.org/2000/svg','text');
            wT.setAttribute('x', x+W/2); wT.setAttribute('y', y0-4);
            wT.setAttribute('text-anchor','middle'); wT.setAttribute('font-size','12'); wT.setAttribute('fill','#111');
            wT.textContent = `${rs.w}"`;

            // ticks for width
            const wt1 = document.createElementNS('http://www.w3.org/2000/svg','line');
            wt1.setAttribute('x1',x); wt1.setAttribute('y1',y0-6); wt1.setAttribute('x2',x); wt1.setAttribute('y2',y0+6);
            wt1.setAttribute('stroke',dimStroke); wt1.setAttribute('vector-effect','non-scaling-stroke');
            const wt2 = document.createElementNS('http://www.w3.org/2000/svg','line');
            wt2.setAttribute('x1',x+W); wt2.setAttribute('y1',y0-6); wt2.setAttribute('x2',x+W); wt2.setAttribute('y2',y0+6);
            wt2.setAttribute('stroke',dimStroke); wt2.setAttribute('vector-effect','non-scaling-stroke');

            // height dimension (left of piece)
            const x0 = Math.max(0, x - 12);
            const hLine = document.createElementNS('http://www.w3.org/2000/svg','line');
            hLine.setAttribute('x1', x0); hLine.setAttribute('y1', y);
            hLine.setAttribute('x2', x0); hLine.setAttribute('y2', y+H);
            hLine.setAttribute('stroke', dimStroke); hLine.setAttribute('vector-effect','non-scaling-stroke');
            const hT = document.createElementNS('http://www.w3.org/2000/svg','text');
            hT.setAttribute('x', x0-4); hT.setAttribute('y', y+H/2);
            hT.setAttribute('text-anchor','end'); hT.setAttribute('dominant-baseline','middle');
            hT.setAttribute('font-size','12'); hT.setAttribute('fill','#111');
            hT.textContent = `${rs.h}"`;

            const ht1 = document.createElementNS('http://www.w3.org/2000/svg','line');
            ht1.setAttribute('x1',x0-6); ht1.setAttribute('y1',y); ht1.setAttribute('x2',x0+6); ht1.setAttribute('y2',y);
            ht1.setAttribute('stroke',dimStroke); ht1.setAttribute('vector-effect','non-scaling-stroke');
            const ht2 = document.createElementNS('http://www.w3.org/2000/svg','line');
            ht2.setAttribute('x1',x0-6); ht2.setAttribute('y1',y+H); ht2.setAttribute('x2',x0+6); ht2.setAttribute('y2',y+H);
            ht2.setAttribute('stroke',dimStroke); ht2.setAttribute('vector-effect','non-scaling-stroke');

            g.append(wLine, wt1, wt2, wT, hLine, ht1, ht2, hT);
          }


          // add the drag/selection handler
          g.addEventListener('pointerdown', (e)=>{
            const pt = svgPoint(e);                 // SVG px
            const startI = { x: p2i(pt.x), y: p2i(pt.y) }; // inches

            // selection: ctrl/cmd to toggle, otherwise single-select
            if(e.metaKey || e.ctrlKey){
              toggleSelect(p.id);
            }else{
              if(!isSelected(p.id)) selectOnly(p.id);
            }
            renderList(); updateInspector();

            // capture group
            const start = state.pieces
              .filter(x => isSelected(x.id))
              .map(x => ({ id:x.id, x0:x.x, y0:x.y, rs: realSize(x) }));

            // group bounds -> movement limits
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            start.forEach(gp => {
              minX = Math.min(minX, gp.x0);
              minY = Math.min(minY, gp.y0);
              maxX = Math.max(maxX, gp.x0 + gp.rs.w);
              maxY = Math.max(maxY, gp.y0 + gp.rs.h);
            });
            const limits = {
              dxMin: -minX,
              dxMax: state.cw - maxX,
              dyMin: -minY,
              dyMax: state.ch - maxY
            };

            state.drag = { startI, group: start, limits };
            g.setPointerCapture && g.setPointerCapture(e.pointerId);
            e.preventDefault();
          });

          // append the group *once* here, not inside the handler
          svg.appendChild(g);
        }); 

        meta.textContent = `Canvas: ${state.cw}" × ${state.ch}" · Grid ${state.grid}" · Scale ${state.scale}px/in`;
      }

      // ------- UI builders -------
      function colorStack(value, onChange){
        const wrap = document.createElement('div'); wrap.className='lc-color-stack';
        const input = document.createElement('input'); input.type='color'; input.className='lc-color-ghost'; input.value=value||'#DBEAFE';
        const sw = document.createElement('span'); sw.className='lc-swatch'; sw.style.setProperty('--c', value||'#DBEAFE');
        input.addEventListener('input', ()=>{ sw.style.setProperty('--c', input.value); onChange(input.value); });
        wrap.appendChild(input); wrap.appendChild(sw); return {wrap,input,sw};
      }

      function mkBtn(label, variant, onClick){ const b=document.createElement('button'); b.className='lc-btn sm '+(variant||''); b.textContent=label; b.onclick=onClick; return b; }

      function pieceItem(p, i){
        const div = document.createElement('div');
        div.className = 'lc-item nav' + (isSelected(p.id) ? ' selected' : '');

        // background/foreground from piece color
        const bg = p.color || '#DBEAFE';
        div.style.setProperty('--c', bg);
        div.style.setProperty('--fg', pickTextColor(bg));

        // clicking the row selects the piece
        div.addEventListener('click', (e)=>{
        // ignore clicks directly on the "Select" button if you still keep it
         if(e.target.closest('button')) return;
         
        const idx = state.pieces.indexOf(p);
        if(e.metaKey || e.ctrlKey){
          toggleSelect(p.id);
        }else if(e.shiftKey && state.lastSelIndex >= 0){
          const a = Math.min(state.lastSelIndex, idx);
          const b = Math.max(state.lastSelIndex, idx);
          const range = state.pieces.slice(a, b+1).map(x=>x.id);
          setSelection([...new Set([...state.selectedIds, ...range])]);
        }else{
          selectOnly(p.id);
          state.lastSelIndex = idx;
        }
        renderList(); updateInspector(); draw();
      });


        // left side: one-line name + dims
        const line = document.createElement('span');
        line.className = 'lc-line';
        line.innerHTML = `<strong>${p.name || 'Piece'}</strong> · ${p.w}" × ${p.h}"${p.rotation===90?' · 90°':''}`;
        div.appendChild(line);

        // right side: tiny duplicate/delete icons
        const actions = document.createElement('div');
        actions.style.display='flex'; actions.style.gap='6px';

        const btnDup = document.createElement('button');
        btnDup.className = 'lc-btn ghost lc-iconbtn';
        btnDup.title = 'Duplicate';
        btnDup.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24"><path d="M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M5 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btnDup.addEventListener('click', (e)=>{
          e.stopPropagation();
          const rs = realSize(p);
          const np = JSON.parse(JSON.stringify(p));
          np.id = uid(); np.name = (p.name||'Piece')+' Copy';
          np.x = clamp(snap(p.x + state.grid, state.grid), 0, state.cw - rs.w);
          np.y = clamp(snap(p.y + state.grid, state.grid), 0, state.ch - rs.h);
          state.pieces.push(np);
          state.selectedId = np.id;
          renderList(); updateInspector(); draw(); scheduleSave();
        });

        const btnDel = document.createElement('button');
        btnDel.className = 'lc-btn red lc-iconbtn';
        btnDel.title = 'Delete';
        btnDel.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btnDel.addEventListener('click', (e)=>{
          e.stopPropagation();
          const idx = state.pieces.findIndex(x=>x.id===p.id);
          if(idx>-1){
            state.pieces.splice(idx,1);
            setSelection([]);
            state.selectedId=null;
            renderList(); 
            updateInspector(); 
            draw(); 
            scheduleSave();
          }
        });

        actions.append(btnDup, btnDel);
        div.appendChild(actions);
        return div;
      }


function renderList(){
  list.classList.add('lc-nav'); 
  list.innerHTML = '';
  state.pieces.forEach((p,i)=> list.appendChild(pieceItem(p,i)));
  installPieceReorder();
}

// ------- Drag-to-reorder for Pieces -------
let listDrag = null;

function installPieceReorder(){
  if(!list) return;

  const THRESH = 4; // pixels before we consider it a drag

  list.addEventListener('pointerdown', (e)=>{
    const row = e.target.closest('.lc-item.nav');
    if(!row) return;
    if(e.target.closest('button, input, textarea')) return;

    const rows = Array.from(list.querySelectorAll('.lc-item.nav'));

    const index = rows.indexOf(row);
    if(index < 0) return;

    listDrag = { row, index, startY: e.clientY, moved:false, marker:null };
    row.setPointerCapture && row.setPointerCapture(e.pointerId);
  });

  list.addEventListener('pointermove', (e)=>{
    if(!listDrag) return;

    // only start a "real" drag after moving enough
    if(!listDrag.moved && Math.abs(e.clientY - listDrag.startY) < THRESH) return;

    if(!listDrag.moved){
      listDrag.moved = true;
      list.classList.add('reordering');
      listDrag.row.classList.add('dragging');
      listDrag.marker = document.createElement('div');
      listDrag.marker.className = 'lc-drop-marker';
      list.insertBefore(listDrag.marker, listDrag.row.nextSibling);
    }

    const rows = Array.from(list.querySelectorAll('.lc-item.nav')).filter(el=>el!==listDrag.row);
    let insertBefore = null;
    for(const child of rows){
      const r = child.getBoundingClientRect();
      if(e.clientY < r.top + r.height/2){ insertBefore = child; break; }
    }
    if(insertBefore) list.insertBefore(listDrag.marker, insertBefore);
    else list.appendChild(listDrag.marker);
  });

  list.addEventListener('pointerup', ()=>{
    if(!listDrag) return;
    const { row, marker, index: from, moved } = listDrag;

    list.classList.remove('reordering');
    row.classList.remove('dragging');

    // treat as a normal click if we never moved
    if(!moved){
      if(marker) marker.remove();
      listDrag = null;
      return;
    }

    const rows = Array.from(list.querySelectorAll('.lc-item.nav'));
    const after = marker.nextElementSibling && marker.nextElementSibling.classList.contains('lc-item') ? marker.nextElementSibling : null;
    let to = after ? rows.indexOf(after) : rows.length;
    if(to > from) to--; // account for removal

    marker.remove();
    listDrag = null;

    if(to === from || to < 0) return;

    const movedItem = state.pieces.splice(from, 1)[0];
    state.pieces.splice(to, 0, movedItem);
    // keep z-order matching list order (optional)
    state.pieces.forEach((p,i)=> p.layer = i);

    renderList(); updateInspector(); draw(); scheduleSave();
  });

  list.addEventListener('pointercancel', ()=>{
    if(!listDrag) return;
    if(listDrag.marker) listDrag.marker.remove();
    list.classList.remove('reordering');
    listDrag = null;
  });
}


function renderLayouts(){
  if(!layoutsEl) return;
  layoutsEl.innerHTML = '';
  state.layouts.forEach((L, idx)=>{
    const row = document.createElement('div');
    row.className = 'lc-item nav' + (idx===state.active ? ' selected' : '');
    row.style.setProperty('--c','#f3f4f6'); row.style.setProperty('--fg','#111');

    // clicking the row selects it (unless we clicked an input or button)
    row.addEventListener('click', (e)=>{
      if(e.target.closest('button, input, textarea')) return;
      state.active = idx; state.selectedId = null;
      syncToolbarFromLayout(); renderList(); updateInspector(); draw();
      renderLayouts(); scheduleSave();
    });

    // inline, editable layout name
    const nameWrap = document.createElement('div');
    nameWrap.style.display='flex'; nameWrap.style.alignItems='center'; nameWrap.style.gap='8px'; nameWrap.style.flex='1';
    const nameInput = document.createElement('input');
    nameInput.className = 'lc-input';
    nameInput.value = L.name || `Layout ${idx+1}`;
    nameInput.style.width='100%';
    nameInput.addEventListener('click', e => e.stopPropagation());
    nameInput.addEventListener('input', ()=>{ L.name = nameInput.value; scheduleSave(); });
    nameInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); nameInput.blur(); }});
    nameWrap.appendChild(nameInput);
    row.appendChild(nameWrap);

    // tiny icon buttons: Duplicate / Delete (with confirm)
    const actions = document.createElement('div');
    actions.style.display='flex'; actions.style.gap='6px';

    const btnDup = document.createElement('button');
    btnDup.className = 'lc-btn ghost lc-iconbtn'; // copy icon
    btnDup.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M5 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btnDup.title = 'Duplicate';
    btnDup.addEventListener('click', (e)=>{ 
      e.stopPropagation();
      const copy = JSON.parse(JSON.stringify(L));
      copy.id = uid(); copy.name = (L.name||`Layout ${idx+1}`)+' Copy';
      state.layouts.splice(idx+1, 0, copy);
      renderLayouts(); scheduleSave();
    });

    const btnDel = document.createElement('button');
    btnDel.className = 'lc-btn red lc-iconbtn'; // trash icon
    btnDel.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btnDel.title = 'Delete';
    btnDel.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(state.layouts.length<=1){ alert('Keep at least one layout.'); return; }
      if(!confirm('Are you sure you want to delete this layout?')) return;
      state.layouts.splice(idx,1);
      if(state.active>=state.layouts.length) state.active=state.layouts.length-1;
      state.selectedId=null;
      renderLayouts(); renderList(); updateInspector(); draw(); scheduleSave();
    });

    actions.append(btnDup, btnDel);
    row.appendChild(actions);
    layoutsEl.appendChild(row);
  });
}

if(btnAddLayout){
  btnAddLayout.onclick = ()=>{
    const L = makeLayout(`Layout ${state.layouts.length+1}`);
    state.layouts.push(L); state.active = state.layouts.length-1;
    renderLayouts(); renderList(); updateInspector(); draw(); syncToolbarFromLayout(); scheduleSave();
  };
}

      function cornerButton(pos, active){
      var b=document.createElement('button');
      b.className='lc-corner-btn pos-'+pos+(active?' active':'');
      b.innerHTML='<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M3 15V6a3 3 0 0 1 3-3h9" fill="none" stroke="#111" stroke-width="2"/></svg>';
      return b;
      }

      function updateInspector(){
        const p = state.pieces.find(x=>x.id===state.selectedId);
        if(!p){ inspector.className='lc-small'; inspector.textContent='Select a piece from the canvas or list.'; return; }
        inspector.className=''; inspector.innerHTML='';
        const wrap = document.createElement('div'); wrap.className='lc-item selected';

        const row1 = document.createElement('div'); row1.className='lc-row';
        const nameL = document.createElement('label'); nameL.className='lc-label'; nameL.textContent='Name';
        const nameI = document.createElement('input'); nameI.className='lc-input'; nameI.value=p.name||''; nameI.oninput=()=>{ p.name=nameI.value; renderList(); draw(); };
        nameL.appendChild(nameI);
        const colorL = document.createElement('label'); colorL.className='lc-label'; colorL.textContent='Color';
        const cs = colorStack(p.color, (val)=>{ p.color=val; renderList(); draw(); });
        colorL.appendChild(cs.wrap);
        row1.appendChild(nameL); row1.appendChild(colorL); wrap.appendChild(row1);

        const row2 = document.createElement('div'); row2.className='lc-row'; row2.style.marginTop='8px';
        row2.innerHTML = `
          <label class="lc-label">Width (in)<input id="insp-w" type="number" class="lc-input" step="0.25" value="${p.w}"></label>
          <label class="lc-label">Height (in)<input id="insp-h" type="number" class="lc-input" step="0.25" value="${p.h}"></label>`;
        wrap.appendChild(row2);

        // ==== Actions row: Backward / Forward (2-up) ====
        const row3 = document.createElement('div');
        row3.className = 'lc-row2';
        row3.style.marginTop = '8px';

        const bBack = mkBtn('Backward','ghost sm', ()=> {
          p.layer = (p.layer||0) - 1;
          renderList(); updateInspector(); draw();
        });
        const bFwd  = mkBtn('Forward','ghost sm', ()=> {
          p.layer = (p.layer||0) + 1;
          renderList(); updateInspector(); draw();
        });

        row3.append(bBack, bFwd);
        wrap.appendChild(row3);

       // ==== Rotation + Corner Radius row (2-up) ====
        const row4 = document.createElement('div');
        row4.className = 'lc-row2';
        row4.style.marginTop = '8px';

        // Left column: Rotation slider
        const rotCol = document.createElement('label');
        rotCol.className = 'lc-label';
        rotCol.innerHTML = `
          Rotation (°)
          <input id="insp-rot" type="range" min="0" max="90" step="1" class="lc-input" value="${p.rotation||0}">
        `;
        row4.appendChild(rotCol);

        // Right column: Corner radius buttons (existing UI)
        const cornersCol = document.createElement('div');

        const cornersTitle = document.createElement('div');
        cornersTitle.className='lc-label';
        cornersTitle.textContent='Corner Radius (toggle corners)';

        const grid = document.createElement('div');
        grid.className='lc-corner-grid';

        var bTL = cornerButton('tl', p.rTL);
        var bTR = cornerButton('tr', p.rTR);
        var bBL = cornerButton('bl', p.rBL);
        var bBR = cornerButton('br', p.rBR);
        function toggle(btn, key){
          return ()=>{ p[key]=!p[key]; btn.classList.toggle('active', p[key]); draw(); };
        }
        bTL.onclick = toggle(bTL,'rTL');
        bTR.onclick = toggle(bTR,'rTR');
        bBL.onclick = toggle(bBL,'rBL');
        bBR.onclick = toggle(bBR,'rBR');

        grid.appendChild(bTL); grid.appendChild(bTR);
        grid.appendChild(bBL); grid.appendChild(bBR);

        cornersCol.appendChild(cornersTitle);
        cornersCol.appendChild(grid);

        row4.appendChild(cornersCol);
        wrap.appendChild(row4);

        // Bind rotation input
        const rotInput = wrap.querySelector('#insp-rot');
        rotInput.oninput = (e)=>{
          p.rotation = Math.max(0, Math.min(90, Number(e.target.value)||0));
          clampToCanvas(p);
          draw();
        };

        const inW = wrap.querySelector('#insp-w');
        const inH = wrap.querySelector('#insp-h');
        inW.onchange = e => { p.w = Math.max(0.25, Number(e.target.value||0)); clampToCanvas(p); renderList(); draw(); };
        inH.onchange = e => { p.h = Math.max(0.25, Number(e.target.value||0)); clampToCanvas(p); renderList(); draw(); };

        // Actions row (tiny icon buttons)
        const actions = document.createElement('div');
        actions.style.display='flex'; actions.style.gap='6px';

        const btnDupI = document.createElement('button');
        btnDupI.className = 'lc-btn ghost lc-iconbtn';
        btnDupI.title = 'Duplicate';
        btnDupI.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24"><path d="M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M5 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btnDupI.onclick = (e)=>{
          e.preventDefault();
          const rs = realSize(p);
          const np = JSON.parse(JSON.stringify(p));
          np.id = uid(); np.name = (p.name||'Piece')+' Copy';
          np.x = clamp(snap(p.x + state.grid, state.grid), 0, state.cw - rs.w);
          np.y = clamp(snap(p.y + state.grid, state.grid), 0, state.ch - rs.h);
          state.pieces.push(np);
          state.selectedId = np.id;
          renderList(); updateInspector(); draw(); scheduleSave();
        };

        const btnDelI = document.createElement('button');
        btnDelI.className = 'lc-btn red lc-iconbtn';
        btnDelI.title = 'Delete';
        btnDelI.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btnDelI.onclick = (e)=>{
          e.preventDefault();
          const idx = state.pieces.findIndex(x=>x.id===p.id);
          if(idx>-1){
            state.pieces.splice(idx,1);
            setSelection([]);
            state.selectedId = null;
            renderList(); 
            updateInspector(); 
            draw(); 
            scheduleSave();
          }
        };

        actions.append(btnDupI, btnDelI);
        wrap.appendChild(actions);

        inspector.appendChild(wrap);

        // lock the inspector height based on the populated content (only when there is a selection)
        if (p){
          // wait a tick so the DOM lays out, then measure
          requestAnimationFrame(()=>{
            lockInspectorHeight(inspector.scrollHeight);
          });
        }


      
      }

      // ------- Canvas interactions -------
      svg.addEventListener('pointermove', (e) => {
      if (!state.drag) return;
      const pt = svgPoint(e);
      const curI = { x: p2i(pt.x), y: p2i(pt.y) };

      const rawDx = curI.x - state.drag.startI.x;
      const rawDy = curI.y - state.drag.startI.y;
      const { dxMin, dxMax, dyMin, dyMax } = state.drag.limits;

      // clamp the whole group's delta so no member crosses the canvas edge
      const dx = Math.max(dxMin, Math.min(dxMax, rawDx));
      const dy = Math.max(dyMin, Math.min(dyMax, rawDy));

      // OPTIONAL: end the drag immediately when a limit is hit
      // const END_ON_LIMIT = true;
      // if (END_ON_LIMIT && (dx !== rawDx || dy !== rawDy)) { endDrag(); return; }

      state.drag.group.forEach(gp => {
        const piece = state.pieces.find(x => x.id === gp.id);
        if (!piece) return;
        piece.x = gp.x0 + dx;
        piece.y = gp.y0 + dy;
      });

      draw(); // smooth (no snapping here)
    });

      // --- Deselect all when clicking blank canvas (no drag) ---
      // Place this AFTER the pointermove handler and AFTER your endDrag wiring.
      let blankDown = null;
      const CLICK_THRESH = 4; // px of wiggle allowed and still treat as a click

      // Track a potential blank-canvas click only if the pointer starts on empty SVG
      svg.addEventListener('pointerdown', (e)=>{
        // if the event started on a piece group, ignore (we'll be dragging/selecting that piece)
        if (e.target.closest('g[data-id]')) { blankDown = null; return; }
        blankDown = { x: e.clientX, y: e.clientY };
      });

      // Cancel the "blank click" if the pointer moves too much (user is panning/dragging)
      svg.addEventListener('pointermove', (e)=>{
        if (!blankDown) return;
        if (Math.abs(e.clientX - blankDown.x) > CLICK_THRESH ||
            Math.abs(e.clientY - blankDown.y) > CLICK_THRESH) {
          blankDown = null;
        }
      });

      // On release, if we started on blank space and didn't drag, clear the selection
      svg.addEventListener('pointerup', ()=>{
        if (!blankDown) return;           // didn’t start on blank space
        if (state.drag) { blankDown = null; return; } // a piece drag was in progress—ignore
        clearSelection();
        renderList(); updateInspector(); draw();
        blankDown = null;
      });

      // Safety: leaving the svg cancels any pending blank click
      svg.addEventListener('pointerleave', ()=>{
        blankDown = null;
      });


      // ------- Top toolbar events -------
      const applyScale = (val) => {
        state.scale = Number(val);
        lblScale.textContent = String(state.scale);
        draw();
      };
      ['input','change'].forEach(evt =>
        inScale.addEventListener(evt, e => applyScale(e.target.value), { passive: true })
      );
      inCW.onchange = e => { state.cw = Math.max(12, Number(e.target.value||0)); state.pieces.forEach(clampToCanvas); draw(); };
      inCH.onchange = e => { state.ch = Math.max(12, Number(e.target.value||0)); state.pieces.forEach(clampToCanvas); draw(); };
      inGrid.onchange = e => { state.grid = Math.max(0.25, Number(e.target.value||0)); draw(); };
      inShowGrid.onchange = e => { state.showGrid = !!e.target.checked; draw(); };
      inShowDims.onchange = e => { state.showDims = !!e.target.checked; draw(); scheduleSave(); };
      btnSnapAll.onclick = () => {
        state.pieces = state.pieces.map(p=>{
          const rs = realSize(p);
          return { ...p,
            x: clamp(snap(p.x,state.grid),0,state.cw-rs.w),
            y: clamp(snap(p.y,state.grid),0,state.ch-rs.h)
          };
        });
        draw();
      };

      btnClearSel && (btnClearSel.onclick = ()=>{
        clearSelection();
        renderList(); updateInspector(); draw();
      });

      // ------- Project fields -------
      inDate.value = todayISO(); state.projectDate = inDate.value;
      inProject.oninput = ()=> state.projectName = inProject.value;
      inDate.onchange = ()=> state.projectDate = inDate.value || todayISO();
      inNotes && (inNotes.oninput = ()=> { state.notes = inNotes.value; scheduleSave(); });
      if(inNotes) inNotes.value = state.notes || '';  

      // ------- Pieces -------
      btnAdd.onclick = () => {
        const idx = state.pieces.length; const top = Math.max(0,...state.pieces.map(x=>x.layer||0))+1;
        const p = { id: uid(), name: `Piece ${idx+1}`, w:24, h:12, x:0, y:0, rotation:0, color:'#ffffff', layer: top, rTL:false, rTR:false, rBL:false, rBR:false };
        clampToCanvas(p); state.pieces.push(p); state.selectedId=p.id; renderList(); updateInspector(); draw(); scheduleSave();
      };

      function duplicatePiece(p){
        const top=Math.max(0,...state.pieces.map(x=>x.layer||0))+1; 
        const rs = realSize(p);
        const d={...p, id: uid(), name: p.name+' Copy', x:clamp(p.x+state.grid,0,state.cw-rs.w), y:clamp(p.y+state.grid,0,state.ch-rs.h), layer:top};
        state.pieces.push(d); state.selectedId=d.id; renderList(); updateInspector(); draw();
      }

      // ------- Import / Export -------
      const requireProjectName = () => {
        if(!state.projectName || !state.projectName.trim()){
          alert('Please enter a Project Name (top-left) before exporting.');
          inProject && inProject.focus();
          return false;
        }
        return true;
      };

      btnImport.onclick = ()=> inImport.click();
      function loadLayout(parsed){
        if(parsed.project && parsed.project.name){ state.projectName = parsed.project.name; inProject.value = state.projectName; }
        if(parsed.project && parsed.project.date){ state.projectDate = parsed.project.date; inDate.value = state.projectDate; }
        if(parsed.project && typeof parsed.project.notes === 'string'){ state.notes = parsed.project.notes; if(inNotes) inNotes.value = state.notes; }
        if(parsed.canvas){ state.cw = Number(parsed.canvas.w)||state.cw; state.ch = Number(parsed.canvas.h)||state.ch; inCW.value=state.cw; inCH.value=state.ch; }
        if(parsed.grid){ state.grid = Number(parsed.grid)||state.grid; inGrid.value = state.grid; }
        if(parsed.scale){ state.scale = Number(parsed.scale)||state.scale; inScale.value=state.scale; lblScale.textContent=String(state.scale); }
        if(typeof parsed.showGrid==='boolean'){ state.showGrid = parsed.showGrid; inShowGrid.checked = state.showGrid; }
        if(Array.isArray(parsed.pieces)){
          state.pieces = parsed.pieces.map(q=>({
            id: uid(),
            name: q.name || 'Piece',
            w: Number(q.w)||1, h: Number(q.h)||1,
            x: Number(q.x)||0, y: Number(q.y)||0,
            rotation: (q.rotation===90?90:0),
            color: q.color || '#ffffff',
            layer: Number(q.layer)||0,
            rTL: !!q.rTL, rTR: !!q.rTR, rBL: !!q.rBL, rBR: !!q.rBR
          }));
        }
        state.selectedId = null;
        renderList(); updateInspector(); draw();
      }
      
      inImport.onchange = (e)=>{
        const file = e.target.files && e.target.files[0];
        if(!file) return;

        // show the chosen file name under the buttons
        if (importName) importName.textContent = file.name;

        const reader = new FileReader();
        reader.onload = () => {
          try{
            const parsed = JSON.parse(String(reader.result||''));
            loadLayout(parsed);                // your existing loader
            scheduleSave();                    // keep autosave state fresh
          }catch(err){
            alert('Failed to parse JSON');
          }
          e.target.value='';                   // allow re-choosing same file later
        };
        reader.readAsText(file);
      };

      btnReset && (btnReset.onclick = ()=>{
        if(!confirm('Reset everything? This will delete all layouts and pieces and clear project name/date.')) return;

        // Clear project meta
        state.projectName=''; state.projectDate=''; state.notes='';
        inProject.value=''; inDate.value=''; if(inNotes) inNotes.value='';

        // Reset to a single empty layout
        state.layouts = [ makeLayout('Layout 1') ];
        state.active = 0; state.selectedId = null;

        syncToolbarFromLayout();
        renderLayouts(); renderList(); updateInspector(); draw();

        try{ localStorage.removeItem(SAVE_KEY); }catch(_){}
        scheduleSave();
      });


      btnExportJSON.onclick = () => {
        if(!requireProjectName()) return;
      const data = exportJSON();        const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
        const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${fileBase()}.json`; a.click(); URL.revokeObjectURL(url);
      };

      btnExportSVG.onclick = () => {
        if(!requireProjectName()) return;
        const serializer = new XMLSerializer();
        const src = serializer.serializeToString(svg);
        const blob = new Blob([src], {type:'image/svg+xml'});
        const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${fileBase()}.svg`; a.click(); URL.revokeObjectURL(url);
      };

      btnExportPNG.onclick = () => {
        if(!requireProjectName()) return;
        const serializer = new XMLSerializer();
        const src = serializer.serializeToString(svg);
        const img = new Image();
        const W = svg.getAttribute('width'), H = svg.getAttribute('height');
        const canvas = document.createElement('canvas'); canvas.width=Number(W); canvas.height=Number(H);
        const ctx = canvas.getContext('2d');
        img.onload = ()=>{ ctx.drawImage(img,0,0); canvas.toBlob(b=>{ const url=URL.createObjectURL(b); const a=document.createElement('a'); a.href=url; a.download=`${fileBase()}.png`; a.click(); URL.revokeObjectURL(url); },'image/png'); };
        img.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(src);
      };

      // ------- Init -------
      inProject.value = state.projectName; inDate.value = state.projectDate || todayISO();
      syncToolbarFromLayout();
      renderLayouts();
      if(!restore()){
        // first-time load
        draw(); renderList(); updateInspector();
      }
      } // <-- end of init()

      // Run after DOM is fully ready (Squarespace can defer/relocate scripts)
      if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', init);
      }else{
      init();
      }
      })();