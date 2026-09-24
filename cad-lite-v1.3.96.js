   (function(){
    function init(){
      // ------- State -------
      const state = {
        projectName: '',
        projectDate: '',
        notes: '',
        // multi-layout support
        layouts: [],
        active: 0,
        selectedId: null,
        selectedIds: [],
        lastSelIndex: -1,
        drag: null,
        pieceSnap: true,
        showDims: false,        // per-piece dims
        showSinkCenterlines: false, // automatic sink CL dimensions
        showManualDims: true,   // NEW: manual dims visibility
        showEdgeProfiles: true,  // NEW: edge profiles visibility
        showPieceFills: true,    // master display switch; individual piece fill settings stay untouched
        showSlabMaterial: true,   // independently show/hide slab imagery
        workspace: 'layout',      // layout = installed drawing, slab = fabrication placement
        showNotes: true,         // note visibility defaults on and is persisted
        showLines: true,         // free Lines + Note leaders visibility
        dimTool: false,
        noteTool: false,
        lineTool: false,
        selectedLineId: null,
        selectedNoteId: null,
        showLabels: true,
        showSplashLabels: false,
        showSplashDims: false,
        showSplashLabelDims: false,
        showLabelDims: true,
        showRadiusLabels: true,
        workspaceViews: null,
        dimPrecision: 16,
        dimFormat: 'fraction',
        selectedDimId: null
      };

      // Each canvas remembers its own VIEW visibility/display choices.
      // Number format, zoom, canvas size and theme stay shared.
      const WORKSPACE_VIEW_KEYS=[
        'showGrid','showDims','showSinkCenterlines','showManualDims','showEdgeProfiles',
        'showPieceFills','showSlabMaterial','showNotes','showLines','showLabels',
        'showSplashLabels','showSplashDims','showSplashLabelDims','showLabelDims',
        'showRadiusLabels'
      ];

      function captureWorkspaceViewState(){
        const out={};
        WORKSPACE_VIEW_KEYS.forEach(key=>{out[key]=!!state[key];});
        return out;
      }

      function ensureWorkspaceViewStates(){
        if(!state.workspaceViews||typeof state.workspaceViews!=='object'){
          const seed=captureWorkspaceViewState();
          state.workspaceViews={layout:{...seed},slab:{...seed}};
        }else{
          const seed=captureWorkspaceViewState();
          ['layout','slab'].forEach(mode=>{
            const src=state.workspaceViews[mode]&&typeof state.workspaceViews[mode]==='object'
              ? state.workspaceViews[mode]
              : {};
            state.workspaceViews[mode]={...seed,...src};
          });
        }
        return state.workspaceViews;
      }

      function saveCurrentWorkspaceViewState(){
        const views=ensureWorkspaceViewStates();
        const mode=state.workspace==='slab'?'slab':'layout';
        views[mode]=captureWorkspaceViewState();
      }

      function loadWorkspaceViewState(mode){
        const views=ensureWorkspaceViewStates();
        const key=mode==='slab'?'slab':'layout';
        const saved=views[key]||{};
        WORKSPACE_VIEW_KEYS.forEach(prop=>{
          if(prop in saved)state[prop]=!!saved[prop];
        });
      }

      // Sink-side semantics from v1.3.47 onward:
      // FRONT = bottom / standing edge, BACK = top / wall edge.
      const SINK_SIDE_CONVENTION='front-bottom-v1';
      function migrateSinkSideConvention(layouts,sourceConvention){
        if(sourceConvention===SINK_SIDE_CONVENTION)return false;
        let changed=false;
        (Array.isArray(layouts)?layouts:[]).forEach(layout=>{
          (Array.isArray(layout?.pieces)?layout.pieces:[]).forEach(piece=>{
            (Array.isArray(piece?.sinks)?piece.sinks:[]).forEach(sink=>{
              if(sink.side==='front'){sink.side='back';changed=true;}
              else if(sink.side==='back'){sink.side='front';changed=true;}
            });
          });
        });
        return changed;
      }



      // Squarespace gallery page that holds your curated slab images
      const SLAB_COLLECTION_PATH = '/stone-colors';

      // Downscale a dataURL to fit within maxDim, re-encode as JPEG to save space.
      function downscaleDataURL(srcDataURL, maxDim = 1600, quality = 0.82){
        return new Promise((resolve, reject)=>{
          const img = new Image();
          img.onload = () => {
            const { naturalWidth: w, naturalHeight: h } = img;
            const scale = Math.min(1, maxDim / Math.max(w, h));
            const W = Math.max(1, Math.round(w * scale));
            const H = Math.max(1, Math.round(h * scale));
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, W, H);
            // JPEG shrinks a lot compared to PNG photos
            const out = c.toDataURL('image/jpeg', quality);
            resolve(out);
          };
          img.onerror = reject;
          img.src = srcDataURL;
        });
      }


      // ---- Slab Overlay (photo underlay scaled to real inches) ----
      state.overlay = state.overlay || {
        visible: false,
        name: '',
        dataURL: '',          // the image to draw
        natW: 0, natH: 0,     // natural pixel size (from Image)
        slabW: 126,           // inches; user-entered slab width
        slabH: 63,            // inches; user-entered slab height
        x: 0, y: 0,           // top-left, inches (position on canvas)
        opacity: 1
      };

      // ===== HELPERS GO HERE!! =====

      // === Header offset helper (Squarespace) ===
      function setHeaderOffsetVar() {
        // Try the common Squarespace header nodes
        const header =
          document.querySelector('[data-animation-role="header"]') ||
          document.querySelector('.Header') ||
          document.querySelector('header');

        const h = header ? Math.round(header.getBoundingClientRect().height) : 0;
        document.documentElement.style.setProperty('--site-header-h', h + 'px');
      }

      // Debounce (so we don't thrash on scroll/resize)
      let _hoffTimer;
      function _debouncedHeaderOffset() {
        clearTimeout(_hoffTimer);
        _hoffTimer = setTimeout(setHeaderOffsetVar, 80);
      }

      // Run on load and as layout changes
      window.addEventListener('DOMContentLoaded', setHeaderOffsetVar);
      window.addEventListener('resize', _debouncedHeaderOffset);
      window.addEventListener('scroll', _debouncedHeaderOffset);

      // If Squarespace manipulates the header after load, watch mutations
      const hdrRoot = document.querySelector('body');
      if (hdrRoot && window.MutationObserver) {
        const mo = new MutationObserver(_debouncedHeaderOffset);
        mo.observe(hdrRoot, { childList: true, subtree: true, attributes: true });
      }


      // ---- PDF helper: load jsPDF on demand ----
      function ensureJsPDF(){
        return new Promise((resolve, reject)=>{
          if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
          s.onload  = ()=> resolve(window.jspdf.jsPDF);
          s.onerror = ()=> reject(new Error('Failed to load jsPDF'));
          document.head.appendChild(s);
        });
      }

      // ---- Export ALL layouts to one PDF (includes Project Name/Date/Notes) ----
      async function exportAllLayoutsToPDF(){
        const jsPDF = await ensureJsPDF();

        const layouts = state.layouts || [];
        if (!layouts.length){
          alert('No layouts to export.');
          return;
        }

        // snapshot current view to restore later
        const active0 = state.active;
        const sel0    = state.selectedId;

        // sanitize helpers
        const safe = s => String(s || '').trim();
        const fileSafe = s => safe(s).replace(/[^\w\-]+/g, '_');

        const projectName = safe(state.projectName) || 'Project';
        const projectDate = safe(state.projectDate) || todayISO();
        const projectNotes= safe(state.notes);

        let doc = null;
        const pageFormat = 'letter'; // or 'a4'
        const unit       = 'pt';
        const margin     = 36;       // 0.5"
        const lineGap    = 4;        // spacing between header lines

        for (let i = 0; i < layouts.length; i++){
          // switch to layout i and render current canvas as-is
          state.active = i;
          syncToolbarFromLayout?.();
          draw();

          // serialize SVG
          const serializer = new XMLSerializer();
          const src = serializer.serializeToString(svg);

          const W = +svg.getAttribute('width');   // px
          const H = +svg.getAttribute('height');  // px

          // rasterize to reduce PDF size and include overlays
          const canvas = document.createElement('canvas');
          canvas.width  = W; canvas.height = H;
          const ctx = canvas.getContext('2d');
          await new Promise(res=>{
            const img = new Image();
            img.onload = ()=>{ ctx.drawImage(img, 0, 0); res(); };
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
          });
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

          // best orientation for the page
          const orientation = (W >= H) ? 'landscape' : 'portrait';

          if (!doc){
            doc = new jsPDF({ orientation, unit, format: pageFormat, compress: true });
          } else {
            doc.addPage(pageFormat, orientation);
          }

          const pageW = doc.internal.pageSize.getWidth();
          const pageH = doc.internal.pageSize.getHeight();

          // ----- Header (Project + Date + Notes + Layout name) -----
          const headerX = margin;
          let headerY   = margin;

          // Top line: Project — Date
          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          doc.text(`${projectName} — ${projectDate}`, headerX, headerY);
          headerY += 12 + lineGap;

          // Layout name line
          doc.setFont(undefined, 'normal');
          doc.text(`Layout: ${safe(layouts[i].name) || `Layout ${i+1}`}`, headerX, headerY);
          headerY += 12 + lineGap;

          // Notes (wrapped, optional)
          let headerH = headerY - margin;
          if (projectNotes){
            doc.setFontSize(10);
            const wrapW = pageW - margin*2;
            const lines = doc.splitTextToSize(projectNotes, wrapW);
            doc.text(lines, headerX, headerY);
            // estimate height from lines (approx 12pt per line)
            headerH += lines.length * 12 + lineGap;
            headerY += lines.length * 12 + lineGap;
          }

          // ----- Image fit -----
          const maxW  = pageW - margin*2;
          const maxH  = pageH - headerY - margin; // below the header
          const scale = Math.min(maxW / W, maxH / H);
          const imgW  = W * scale;
          const imgH  = H * scale;
          const x     = margin + (maxW - imgW)/2;
          const y     = headerY + (maxH - imgH)/2;

          doc.addImage(dataUrl, 'JPEG', x, y, imgW, imgH);
        }

        // restore original view
        state.active     = active0;
        state.selectedId = sel0;
        syncToolbarFromLayout?.();
        draw();
        renderLayouts?.();
        renderList?.();
        updateInspector?.();
        sinksUI?.refresh?.();
        syncClipTop?.();

        // Download
        const filename = `${fileSafe(projectName)}_${fileSafe(projectDate)}_AllLayouts.pdf`;
        doc.save(filename);
      }



      // ===== Per-layout overlay helpers (place above init) =====
      function activeLayout(){ return state.layouts?.[state.active] || null; }
      function ensureOverlaysOnLayout(L){
        if (!L) return null;
        if (!Array.isArray(L.overlays)) L.overlays = [];
        if (typeof L.ovSel !== 'number') L.ovSel = (L.overlays.length ? 0 : -1);
        L.showOverlays = true;
        L.overlayClip = true;
        const minSlabW=Math.max(300,Number(state.cw)||0);
        const minSlabH=Math.max(150,Number(state.ch)||0);
        if(!Number.isFinite(Number(L.slabCW)))L.slabCW=minSlabW;
        if(!Number.isFinite(Number(L.slabCH)))L.slabCH=minSlabH;
        L.slabCW=Math.max(minSlabW,Number(L.slabCW)||minSlabW);
        L.slabCH=Math.max(minSlabH,Number(L.slabCH)||minSlabH);
        if(Array.isArray(L.overlays)){
          L.overlays.forEach(o=>{
            L.slabCW=Math.max(L.slabCW,(Number(o?.x)||0)+(Number(o?.slabW)||0)+6);
            L.slabCH=Math.max(L.slabCH,(Number(o?.y)||0)+(Number(o?.slabH)||0)+6);
          });
        }
        return L;
      }
      const slabCanvasW=()=>Number(ensureOverlaysOnLayout(activeLayout())?.slabCW)||Math.max(300,state.cw);
      const slabCanvasH=()=>Number(ensureOverlaysOnLayout(activeLayout())?.slabCH)||Math.max(150,state.ch);
      function overlays(){ const L = ensureOverlaysOnLayout(activeLayout()); return L ? L.overlays : []; }
      function currentOverlay(){
        const L = ensureOverlaysOnLayout(activeLayout());
        if (!L || L.ovSel < 0) return null;
        return L.overlays[L.ovSel] || null;
      }
      function selectOverlay(i){
        const L = ensureOverlaysOnLayout(activeLayout());
        if (!L) return;
        state.selectedDimId=null;
        state.selectedLineId=null;
        state.selectedNoteId=null;
        if(typeof setSelection==='function')setSelection([]);
        L.ovSel = (i>=0 && i < L.overlays.length) ? i : -1;
        renderOverlayList?.();
        syncOverlayUI?.();
        updateInspector?.();
      }

      function clampOverlayToCanvas(o){
        if(!o)return o;
        const w=Math.max(1,Number(o.slabW)||1);
        const h=Math.max(1,Number(o.slabH)||1);
        const maxX=Math.max(0,slabCanvasW()-w);
        const maxY=Math.max(0,slabCanvasH()-h);
        o.x=round3(clamp(Number(o.x)||0,0,maxX));
        o.y=round3(clamp(Number(o.y)||0,0,maxY));
        return o;
      }

      // ===== Momentary / locked canvas tools =================================
      // Held tools disappear on keyup. Locked tools are the discoverable
      // button-driven version of the same interaction and exit with Escape.
      const momentaryToolState={held:null,key:null,locked:null};
      let finishActiveOverlayCanvasDrag=()=>{};

      const activeMomentaryTool=()=>momentaryToolState.held||momentaryToolState.locked;

      function isTypingTarget(target=document.activeElement){
        if(!(target instanceof Element))return false;
        const tag=(target.tagName||'').toLowerCase();
        return tag==='input'||tag==='textarea'||tag==='select'||target.isContentEditable;
      }

      function syncMomentaryToolUI(){
        const root=document.querySelector('.lite-cad');
        if(!root)return;
        const slabWorkspace=state.workspace==='slab';
        const tool=activeMomentaryTool();
        root.classList.toggle('lc-momentary-overlay',tool==='overlay');
        root.classList.toggle('lc-momentary-splash',!slabWorkspace&&(tool==='splash'||tool==='splashAll'));
        root.classList.toggle('lc-momentary-radius',!slabWorkspace&&(tool==='radius'||tool==='radiusAll'));
        root.dataset.momentaryTool=tool||'';

        document.querySelectorAll('.lc-add-splash-action').forEach(btn=>{
          const locked=!slabWorkspace&&momentaryToolState.locked==='splash';
          btn.disabled=slabWorkspace;
          btn.classList.toggle('lc-workspace-hidden',slabWorkspace);
          btn.classList.toggle('is-active',!slabWorkspace&&tool==='splash');
          btn.setAttribute('aria-pressed',String(locked));
          btn.textContent=locked?'Splash Tool: On · Enter':'+ Add Splash';
          btn.title=slabWorkspace
            ? 'Add Splash is available in DESIGN.'
            : 'Lock Add Splash mode. Click a piece edge to create a 4" splash. Hold S for momentary mode. Enter or a blank-canvas click exits; Escape also exits outside native fullscreen.';
        });

        document.querySelectorAll('.lc-radius-label-action').forEach(btn=>{
          const locked=!slabWorkspace&&momentaryToolState.locked==='radius';
          const radiusActive=!slabWorkspace&&(tool==='radius'||tool==='radiusAll');
          btn.disabled=slabWorkspace;
          btn.classList.toggle('is-active',radiusActive);
          btn.setAttribute('aria-pressed',String(locked));
          btn.innerHTML=tool==='radiusAll'
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M7 5h12v12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Radius Label: All</span>'
            : ((locked||tool==='radius')
              ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M7 5h12v12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Radius Label: On · Enter</span>'
              : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M7 5h12v12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Label Radius</span>');
          btn.title=slabWorkspace
            ? 'Radius labels are available in DESIGN.'
            : 'Click to lock Radius Label Mode for the selected piece. Hold R for the selected piece; hold Shift+R for all countertop pieces. Enter or blank canvas exits locked mode.';
        });
      }

      function setMomentaryTool(tool,key){
        if(state.workspace==='slab'&&(tool==='splash'||tool==='splashAll'||tool==='radius'||tool==='radiusAll'))return;
        if(state.workspace!=='slab'&&tool==='overlay')return;
        if(momentaryToolState.held===tool)return;
        if(momentaryToolState.held)return;
        if(momentaryToolState.locked && momentaryToolState.locked!==tool)return;
        momentaryToolState.held=tool;
        momentaryToolState.key=key;
        syncMomentaryToolUI();
        draw?.();
      }

      function releaseMomentaryTool(key=null){
        if(!momentaryToolState.held)return;
        if(key && momentaryToolState.key!==key)return;
        const previous=momentaryToolState.held;
        momentaryToolState.held=null;
        momentaryToolState.key=null;
        if(previous==='overlay')finishActiveOverlayCanvasDrag?.();
        syncMomentaryToolUI();
        draw?.();
      }

      function toggleLockedTool(tool){
        if(state.workspace==='slab'&&(tool==='splash'||tool==='splashAll'||tool==='radius'||tool==='radiusAll'))return;
        if(state.workspace!=='slab'&&tool==='overlay')return;
        momentaryToolState.locked=momentaryToolState.locked===tool?null:tool;
        if(momentaryToolState.locked && momentaryToolState.held && momentaryToolState.held!==tool){
          releaseMomentaryTool();
        }
        syncMomentaryToolUI();
        draw?.();
      }

      function clearLockedTool(tool=null){
        if(!momentaryToolState.locked)return false;
        if(tool && momentaryToolState.locked!==tool)return false;
        momentaryToolState.locked=null;
        syncMomentaryToolUI();
        draw?.();
        return true;
      }

      function cancelPlacementTools({redraw=true}={}){
        const hadMomentary=!!(momentaryToolState.held||momentaryToolState.locked);
        if(momentaryToolState.held)releaseMomentaryTool();
        momentaryToolState.locked=null;
        state.dimTool=false;
        state.noteTool=false;
        state.lineTool=false;
        if(typeof dimTempStart!=='undefined')dimTempStart=null;
        if(typeof lineTempStart!=='undefined')lineTempStart=null;
        syncMomentaryToolUI?.();
        syncDimToolUI?.();
        syncNoteToolUI?.();
        syncLineToolUI?.();
        if(redraw&&hadMomentary)draw?.();
        return hadMomentary;
      }

      const momentaryKeyMap=new Map([
        ['o','overlay'],
        ['s','splash'],
        ['r','radius']
      ]);

      window.addEventListener('keydown',e=>{
        if(e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;
        if(isTypingTarget(e.target)||isTypingTarget())return;
        const key=String(e.key||'').toLowerCase();
        let tool=momentaryKeyMap.get(key);
        if(key==='s'&&e.shiftKey)tool='splashAll';
        if(key==='r'&&e.shiftKey)tool='radiusAll';
        if(!tool)return;
        e.preventDefault();
        setMomentaryTool(tool,key);
      });

      window.addEventListener('keyup',e=>{
        const key=String(e.key||'').toLowerCase();
        if(momentaryToolState.key===key)releaseMomentaryTool(key);
      });

      window.addEventListener('blur',()=>releaseMomentaryTool());
      document.addEventListener('visibilitychange',()=>{
        if(document.hidden)releaseMomentaryTool();
      });

      // Robust Squarespace page/section → [{name,url}]
      async function fetchSquarespaceSlabs(collectionPath = SLAB_COLLECTION_PATH) {
        const base = new URL(collectionPath, location.origin);
        const pageSize = 20;
        const out = [];

        // helper: normalize image items
        const pickItems = (items) => {
          const rows = [];
          for (const it of items || []) {
            const name =
              it?.title ||
              it?.heading ||
              it?.seoTitle ||
              it?.captionPlain ||
              (it?.metadata && it.metadata.title) ||
              'Untitled Slab';

            const rawUrl =
              it?.assetUrl ||
              it?.imageUrl ||
              it?.mediaUrl ||
              (it?.asset && it.asset.url) ||
              (it?.image && (it.image.assetUrl || it.image.url)) ||
              it?.posterImageUrl ||
              it?.thumbUrl ||
              null;

            if (rawUrl) {
              const u = String(rawUrl);
              rows.push({
                name: String(name),
                url: u + (u.includes('?') ? '&' : '?') + 'format=1500w'
              });
            }
          }
          return rows;
        };

        // helper: extract <img> from an HTML string
        const extractFromHtml = (html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const imgs = [...doc.querySelectorAll(
            'img[data-src], img[data-image], img[data-image-dimensions], .gallery-item img, img.sqs-image, img'
          )];
          const results = [];
          for (const img of imgs) {
            const raw = img.getAttribute('data-src') || img.getAttribute('src') || '';
            if (!raw) continue;
            if (/\.(svg|gif)$/i.test(raw)) continue; // skip icons/spacers

            // name: prefer alt, else filename
            const alt = (img.getAttribute('alt') || '').trim();
            const fileName = raw.split('/').pop()?.split('?')[0] || '';
            const baseName = decodeURIComponent(fileName.replace(/\.[a-z0-9]+$/i, ''));
            const name = alt || baseName || 'Untitled Slab';

            const abs = raw.startsWith('http') ? raw : new URL(raw, location.origin).href;
            results.push({ name, url: abs + (abs.includes('?') ? '&' : '?') + 'format=1500w' });
          }
          // de-dup by URL
          const seen = new Set();
          return results.filter(r => (seen.has(r.url) ? false : (seen.add(r.url), true)));
        };

        // Pass 1: JSON endpoint (?format=json) — try items[] AND mainContent
        let offset = 0;
        while (true) {
          const url = new URL(base.href);
          url.searchParams.set('format', 'json');
          url.searchParams.set('offset', String(offset));
          url.searchParams.set('_', Date.now().toString()); // avoid cache quirks

          const res = await fetch(url.href, { cache: 'no-store' });
          if (!res.ok) break;
          const data = await res.json();

          // Try collection-like shapes first
          let items = [];
          if (Array.isArray(data.items)) items = data.items;
          else if (Array.isArray(data.collection?.items)) items = data.collection.items;
          else if (Array.isArray(data.items?.map?.(x => x.item))) items = data.items.map(x => x.item);

          const picked = pickItems(items);
          out.push(...picked);

          // Also parse page HTML if present
          if (data.mainContent && typeof data.mainContent === 'string') {
            const rows = extractFromHtml(data.mainContent);
            out.push(...rows);
          }

          // Stop paginating if it isn't a true collection or we didn't get a full page
          if (!Array.isArray(items) || items.length < pageSize) break;
          offset += pageSize;
        }

        if (out.length) {
          console.info('[Slab Library] Loaded', out.length, 'items from JSON/mainContent at', base.href);
          return out;
        }

        // Pass 2: Fallback — fetch rendered HTML and parse <img>
        try {
          const htmlRes = await fetch(base.href, { cache: 'no-store' });
          if (htmlRes.ok) {
            const html = await htmlRes.text();
            const rows = extractFromHtml(html);
            if (rows.length) {
              console.info('[Slab Library] Loaded', rows.length, 'items from rendered HTML at', base.href);
              return rows;
            }
          }
        } catch (e) {
          console.warn('[Slab Library] HTML fallback failed:', e);
        }

        console.warn('[Slab Library] No images found at', base.href, '— ensure the page actually contains image blocks or a gallery/section.');
        return [];
      }


      // Elements
      const slabModal = document.getElementById('slabModal');
      const slabGrid = document.getElementById('slabGrid');
      const slabSearch = document.getElementById('slabSearch');
      const slabInsertBtn = document.getElementById('slabInsert');
      const slabCount = document.getElementById('slabCount');
      const openLibBtn = document.getElementById('ov-lib-photo');
      const togEdges   = document.getElementById('lc-toggle-edges');

      let slabCache = [];      // [{name, url}]
      let slabFiltered = [];   // current filter result
      let slabSelectedIndex = -1;

      // Open/close
      function openSlabModal() {
        slabModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        // First-time load
        if (!slabCache.length) loadSlabLibrary().catch(err => {
          console.error(err);
          alert('Could not load slab library.');
          closeSlabModal();
        });
        // Focus search
        setTimeout(() => slabSearch?.focus(), 0);
      }
      function closeSlabModal() {
        slabModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        slabClearSelection();
      }

      // Loader used by the "Choose from Library" button
      async function loadSlabLibrary() {
        slabCache = await fetchSquarespaceSlabs(SLAB_COLLECTION_PATH);
        applyFilter(''); // re-renders the grid
      }


      // Render
      function applyFilter(q) {
        const term = (q || '').trim().toLowerCase();
        slabFiltered = term
          ? slabCache.filter(s => s.name.toLowerCase().includes(term))
          : slabCache.slice();

        slabGrid.innerHTML = '';
        slabFiltered.forEach((s, i) => {
          const card = document.createElement('div');
          card.className = 'slab-card';
          card.dataset.index = String(i);
          card.tabIndex = 0;

          const wrap = document.createElement('div');
          wrap.className = 'slab-card__imgwrap';
          const img = new Image();
          img.loading = 'lazy';
          img.decoding = 'async';
          img.src = s.url;
          img.alt = s.name;
          wrap.appendChild(img);

          const name = document.createElement('div');
          name.className = 'slab-card__name';
          name.textContent = s.name;

          card.appendChild(wrap);
          card.appendChild(name);
          slabGrid.appendChild(card);
        });

        slabCount.textContent = `${slabFiltered.length} item${slabFiltered.length === 1 ? '' : 's'}`;
        slabClearSelection();
      }

      // Selection helpers
      function slabClearSelection() {
        slabSelectedIndex = -1;
        [...slabGrid.children].forEach(el => el.classList.remove('is-selected'));
        slabInsertBtn.disabled = true;
      }
      function selectIndex(idx, scrollIntoView = false) {
        if (idx < 0 || idx >= slabFiltered.length) return;
        slabSelectedIndex = idx;
        [...slabGrid.children].forEach(el => el.classList.remove('is-selected'));
        const card = slabGrid.children[idx];
        if (card) {
          card.classList.add('is-selected');
          slabInsertBtn.disabled = false;
          if (scrollIntoView) card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
      function moveSelection(delta) {
        const len = slabFiltered.length;
        if (!len) return;
        const next = slabSelectedIndex < 0 ? 0 : Math.max(0, Math.min(len - 1, slabSelectedIndex + delta));
        selectIndex(next, true);
      }

      // Insert into overlays
      function insertSelected() {
        if (slabSelectedIndex < 0) return;
        const { url, name } = slabFiltered[slabSelectedIndex];
        closeSlabModal();
        openLibrarySlabForImport(url,name);
      }

      // Wire up open
      openLibBtn?.addEventListener('click', openSlabModal);

      // Close handlers
      slabModal.addEventListener('click', (e) => {
        const target = e.target;
        if (target.matches('[data-close]')) closeSlabModal();
      });

      // Search (debounced)
      let searchTimer = null;
      slabSearch?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => applyFilter(e.target.value), 120);
      });

      // Grid click / keyboard
      slabGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.slab-card');
        if (!card) return;
        selectIndex(Number(card.dataset.index));
      });

      slabGrid.addEventListener('dblclick', (e) => {
        const card = e.target.closest('.slab-card');
        if (!card) return;
        selectIndex(Number(card.dataset.index));
        insertSelected();
      });

      slabGrid.addEventListener('keydown', (e) => {
        if (!slabFiltered.length) return;
        switch (e.key) {
          case 'ArrowRight': e.preventDefault(); moveSelection(+1); break;
          case 'ArrowLeft':  e.preventDefault(); moveSelection(-1); break;
          case 'ArrowDown':  e.preventDefault(); moveSelection(+4); break; // approx row jump
          case 'ArrowUp':    e.preventDefault(); moveSelection(-4); break;
          case 'Enter':      e.preventDefault(); insertSelected(); break;
        }
      });

      // Global keys
      document.addEventListener('keydown', (e) => {
        if (slabModal.getAttribute('aria-hidden') === 'true') return;
        if (e.key === 'Escape') closeSlabModal();
      });

      // Footer buttons
      slabInsertBtn.addEventListener('click', insertSelected);

      // ---- Safe overlay adder (uses your existing overlay stack if present) ----
      function addOverlaySafe(url, name = 'Overlay') {
        if (typeof addOverlay === 'function') {
          addOverlay(url, name);
          return;
        }
        // fallback if your app uses a different overlay path
        const img = new Image();
        img.src = url;
        img.onload = () => {
          // Expecting these in your app; adjust if needed:
          window.overlays = window.overlays || [];
          window.overlays.push({ name, url, img, visible: true, x: 0, y: 0, w: 126, h: 63, opacity: 0.75 });
          if (typeof renderOverlayList === 'function') renderOverlayList();
          if (typeof drawCanvas === 'function') drawCanvas();
        };
      }


      // Slab inventory ------------------------------------------------------------
      const MAX_SLABS_PER_LAYOUT=12;
      const SLAB_GUTTER=6;

      function slabRectsOverlap(a,b,gap=0){
        return !(
          a.x+a.w+gap<=b.x ||
          b.x+b.w+gap<=a.x ||
          a.y+a.h+gap<=b.y ||
          b.y+b.h+gap<=a.y
        );
      }

      function findOpenSlabPosition(w,h,ignoreId=null){
        const L=ensureOverlaysOnLayout(activeLayout());
        const width=Math.max(1,Number(w)||126);
        const height=Math.max(1,Number(h)||63);
        const existing=(L?.overlays||[])
          .filter(o=>o?.id!==ignoreId)
          .map(o=>({x:Number(o.x)||0,y:Number(o.y)||0,w:Number(o.slabW)||1,h:Number(o.slabH)||1}));

        let cw=slabCanvasW(),ch=slabCanvasH();
        const candidates=[{x:SLAB_GUTTER,y:SLAB_GUTTER}];
        existing.forEach(r=>{
          candidates.push({x:r.x+r.w+SLAB_GUTTER,y:r.y});
          candidates.push({x:r.x,y:r.y+r.h+SLAB_GUTTER});
        });
        candidates.sort((a,b)=>a.x-b.x||a.y-b.y);

        const fits=pos=>{
          const rect={x:pos.x,y:pos.y,w:width,h:height};
          return pos.x>=0&&pos.y>=0&&pos.x+width<=cw&&pos.y+height<=ch &&
            !existing.some(other=>slabRectsOverlap(rect,other,1));
        };

        let found=candidates.find(fits);
        if(!found){
          // Scan in 6" increments before expanding the staging area.
          for(let x=SLAB_GUTTER;x+width<=cw&&!found;x+=SLAB_GUTTER){
            for(let y=SLAB_GUTTER;y+height<=ch;y+=SLAB_GUTTER){
              const pos={x,y};
              if(fits(pos)){found=pos;break;}
            }
          }
        }
        if(!found){
          // Add another row and grow only the SLAB workspace, never DESIGN.
          const bottom=existing.reduce((m,r)=>Math.max(m,r.y+r.h),SLAB_GUTTER);
          found={x:SLAB_GUTTER,y:bottom+SLAB_GUTTER};
          L.slabCH=Math.max(ch,found.y+height+SLAB_GUTTER);
          if(found.x+width+SLAB_GUTTER>cw)L.slabCW=found.x+width+SLAB_GUTTER;
        }
        return {x:round3(found.x),y:round3(found.y)};
      }

      function addOverlayFromDataURL(name,dataURL,natW,natH,options={}){
        const L=ensureOverlaysOnLayout(activeLayout());
        if(!L)return null;
        if((L.overlays?.length||0)>=MAX_SLABS_PER_LAYOUT)return null;

        const slabW=Math.max(1,Number(options.slabW)||126);
        const slabH=Math.max(1,Number(options.slabH)||63);
        const pos=findOpenSlabPosition(slabW,slabH);
        const o={
          id:uid(),
          name:String(name||'Slab').trim()||'Slab',
          dataURL:dataURL||'',
          natW:Number(natW)||0,
          natH:Number(natH)||0,
          slabW,slabH,
          x:pos.x,y:pos.y,
          opacity:options.opacity==null?1:Math.max(.1,Math.min(1,Number(options.opacity)||1)),
          visible:true
        };
        L.overlays.push(o);
        L.slabCW=Math.max(slabCanvasW(),o.x+o.slabW+SLAB_GUTTER);
        L.slabCH=Math.max(slabCanvasH(),o.y+o.slabH+SLAB_GUTTER);

        state.selectedDimId=null;
        state.selectedLineId=null;
        state.selectedNoteId=null;
        if(typeof setSelection==='function')setSelection([]);
        L.ovSel=L.overlays.length-1;
        setCanvasWorkspace('slab');
        renderOverlayList();
        syncOverlayUI();
        draw();
        updateInspector?.();
        scheduleSave();
        pushHistory();
        return o;
      }

      function duplicateSlab(index){
        const L=ensureOverlaysOnLayout(activeLayout());
        const src=L?.overlays?.[index];
        if(!src||(L.overlays?.length||0)>=MAX_SLABS_PER_LAYOUT)return;
        const pos=findOpenSlabPosition(src.slabW,src.slabH);
        const copy={
          ...src,
          id:uid(),
          name:(String(src.name||'Slab').replace(/\s+Copy(?:\s+\d+)?$/,'')+' Copy').trim(),
          x:pos.x,
          y:pos.y,
          visible:true
        };
        L.overlays.push(copy);
        L.ovSel=L.overlays.length-1;
        renderOverlayList();syncOverlayUI();updateInspector?.();draw();scheduleSave();pushHistory();
      }

      // Add Slab modal: crop image first, then assign real slab dimensions.
      let slabImportUI=null;
      let slabImportState=null;

      function ensureSlabImportUI(){
        if(slabImportUI)return slabImportUI;

        const modal=document.createElement('div');
        modal.className='lc-slab-import-modal';
        modal.hidden=true;
        modal.innerHTML=`
          <div class="lc-slab-import-backdrop" data-slab-import-close></div>
          <div class="lc-slab-import-dialog" role="dialog" aria-modal="true" aria-labelledby="lc-slab-import-title">
            <div class="lc-slab-import-head">
              <div>
                <strong id="lc-slab-import-title">Add Slab Image</strong>
                <div class="lc-small">Drag across the image to set the crop. Draw again to replace it.</div>
              </div>
              <button type="button" class="lc-btn ghost lc-iconbtn" data-slab-import-close aria-label="Close">×</button>
            </div>
            <div class="lc-slab-import-body">
              <div class="lc-slab-crop-stage">
                <canvas class="lc-slab-crop-canvas" width="760" height="430"></canvas>
                <div class="lc-slab-crop-hint">Drag to crop</div>
              </div>
              <div class="lc-slab-import-fields">
                <label class="lc-label">Slab Name<input class="lc-input" type="text" data-slab-name></label>
                <div class="lc-slab-dimension-grid">
                  <label class="lc-label">Width (in)<input class="lc-input" type="number" min="1" step=".125" value="126" data-slab-width></label>
                  <label class="lc-label">Height (in)<input class="lc-input" type="number" min="1" step=".125" value="63" data-slab-height></label>
                </div>
                <div class="lc-slab-import-meta"></div>
                <button type="button" class="lc-btn ghost sm" data-slab-reset-crop>Reset Crop</button>
              </div>
            </div>
            <div class="lc-slab-import-foot">
              <button type="button" class="lc-btn ghost" data-slab-import-close>Cancel</button>
              <button type="button" class="lc-btn alt" data-slab-import-commit>Add Slab</button>
            </div>
          </div>`;
        document.body.appendChild(modal);

        const canvas=modal.querySelector('.lc-slab-crop-canvas');
        const ctx=canvas.getContext('2d');
        const nameInput=modal.querySelector('[data-slab-name]');
        const widthInput=modal.querySelector('[data-slab-width]');
        const heightInput=modal.querySelector('[data-slab-height]');
        const meta=modal.querySelector('.lc-slab-import-meta');
        const hint=modal.querySelector('.lc-slab-crop-hint');
        const commit=modal.querySelector('[data-slab-import-commit]');

        const close=()=>{
          modal.hidden=true;
          slabImportState=null;
        };

        const render=()=>{
          const s=slabImportState;
          ctx.clearRect(0,0,canvas.width,canvas.height);
          if(!s?.img)return;
          const scale=Math.min(canvas.width/s.img.naturalWidth,canvas.height/s.img.naturalHeight);
          const drawW=s.img.naturalWidth*scale,drawH=s.img.naturalHeight*scale;
          const ox=(canvas.width-drawW)/2,oy=(canvas.height-drawH)/2;
          s.view={scale,ox,oy,drawW,drawH};
          ctx.drawImage(s.img,ox,oy,drawW,drawH);

          const c=s.crop;
          if(c){
            const x=ox+c.x*scale,y=oy+c.y*scale,w=c.w*scale,h=c.h*scale;
            ctx.save();
            ctx.fillStyle='rgba(0,0,0,.42)';
            ctx.fillRect(ox,oy,drawW,Math.max(0,y-oy));
            ctx.fillRect(ox,y,Math.max(0,x-ox),h);
            ctx.fillRect(x+w,y,Math.max(0,ox+drawW-(x+w)),h);
            ctx.fillRect(ox,y+h,drawW,Math.max(0,oy+drawH-(y+h)));
            ctx.strokeStyle='#0ea5e9';
            ctx.lineWidth=2;
            ctx.strokeRect(x+.5,y+.5,Math.max(0,w-1),Math.max(0,h-1));
            ctx.restore();
          }
          hint.hidden=!!s.dragging;
          meta.textContent=c
            ? `Crop: ${Math.round(c.w)} × ${Math.round(c.h)} px · Source: ${s.img.naturalWidth} × ${s.img.naturalHeight} px`
            : '';
        };

        const pointerToSource=e=>{
          const s=slabImportState;
          if(!s?.view)return null;
          const rect=canvas.getBoundingClientRect();
          const px=(e.clientX-rect.left)*(canvas.width/Math.max(1,rect.width));
          const py=(e.clientY-rect.top)*(canvas.height/Math.max(1,rect.height));
          const x=clamp((px-s.view.ox)/s.view.scale,0,s.img.naturalWidth);
          const y=clamp((py-s.view.oy)/s.view.scale,0,s.img.naturalHeight);
          return {x,y};
        };

        canvas.addEventListener('pointerdown',e=>{
          if(!slabImportState?.img)return;
          const p=pointerToSource(e);
          slabImportState.dragStart=p;
          slabImportState.dragging=true;
          slabImportState.crop={x:p.x,y:p.y,w:1,h:1};
          canvas.setPointerCapture?.(e.pointerId);
          render();
        });
        canvas.addEventListener('pointermove',e=>{
          const s=slabImportState;
          if(!s?.dragging||!s.dragStart)return;
          const p=pointerToSource(e),a=s.dragStart;
          s.crop={
            x:Math.min(a.x,p.x),
            y:Math.min(a.y,p.y),
            w:Math.max(1,Math.abs(p.x-a.x)),
            h:Math.max(1,Math.abs(p.y-a.y))
          };
          render();
        });
        const endCrop=e=>{
          const s=slabImportState;
          if(!s?.dragging)return;
          s.dragging=false;
          if(s.crop.w<5||s.crop.h<5){
            s.crop={x:0,y:0,w:s.img.naturalWidth,h:s.img.naturalHeight};
          }
          try{canvas.releasePointerCapture?.(e.pointerId);}catch(_){}
          render();
        };
        canvas.addEventListener('pointerup',endCrop);
        canvas.addEventListener('pointercancel',endCrop);

        modal.querySelector('[data-slab-reset-crop]').onclick=()=>{
          const s=slabImportState;
          if(!s?.img)return;
          s.crop={x:0,y:0,w:s.img.naturalWidth,h:s.img.naturalHeight};
          render();
        };
        modal.querySelectorAll('[data-slab-import-close]').forEach(btn=>btn.addEventListener('click',close));

        commit.onclick=()=>{
          const s=slabImportState;
          if(!s?.img||!s.crop)return;
          const slabW=Math.max(1,Number(widthInput.value)||126);
          const slabH=Math.max(1,Number(heightInput.value)||63);
          const crop=s.crop;
          const scale=Math.min(1,1600/Math.max(crop.w,crop.h));
          const out=document.createElement('canvas');
          out.width=Math.max(1,Math.round(crop.w*scale));
          out.height=Math.max(1,Math.round(crop.h*scale));
          const octx=out.getContext('2d');
          octx.drawImage(s.img,crop.x,crop.y,crop.w,crop.h,0,0,out.width,out.height);
          let result;
          try{
            result=out.toDataURL('image/jpeg',.86);
          }catch(err){
            console.warn('Could not encode cropped slab; using source image.',err);
            result=s.source;
          }
          addOverlayFromDataURL(nameInput.value||s.name||'Slab',result,out.width,out.height,{slabW,slabH});
          close();
        };

        slabImportUI={modal,canvas,nameInput,widthInput,heightInput,meta,commit,render,close};
        return slabImportUI;
      }

      function openSlabImportSource(source,name='Slab'){
        const ui=ensureSlabImportUI();
        const img=new Image();
        if(!String(source||'').startsWith('data:'))img.crossOrigin='anonymous';
        img.onload=()=>{
          slabImportState={
            source,
            name,
            img,
            crop:{x:0,y:0,w:img.naturalWidth,h:img.naturalHeight},
            dragging:false
          };
          ui.nameInput.value=String(name||'Slab').replace(/\.[a-z0-9]+$/i,'');
          ui.widthInput.value='126';
          ui.heightInput.value='63';
          ui.modal.hidden=false;
          ui.render();
        };
        img.onerror=()=>alert('That slab image could not be loaded.');
        img.src=source;
      }

      function loadOverlayFromFileToLayout(file){
        if(!file)return;
        const reader=new FileReader();
        reader.onload=()=>openSlabImportSource(String(reader.result||''),file.name||'Slab');
        reader.readAsDataURL(file);
      }

      async function openLibrarySlabForImport(url,name){
        try{
          const response=await fetch(url,{credentials:'same-origin'});
          if(!response.ok)throw new Error('Image request failed');
          const blob=await response.blob();
          const reader=new FileReader();
          reader.onload=()=>openSlabImportSource(String(reader.result||''),name||'Slab');
          reader.readAsDataURL(blob);
        }catch(err){
          console.warn('Library slab fetch fell back to direct image URL.',err);
          openSlabImportSource(url,name||'Slab');
        }
      }

      function overlayPresetToLayout(kind='white'){
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = 400;
        const ctx = canvas.getContext('2d');
        const base = {white:'#f7f7f7', gray:'#d9dde2', black:'#121315'}[kind] || '#f7f7f7';
        ctx.fillStyle = base; ctx.fillRect(0,0,canvas.width,canvas.height);
        const dots = kind==='black' ? '#2a2b2e' : (kind==='gray' ? '#b7bdc6' : '#dcdcdc');
        for (let i=0;i<8000;i++){
          ctx.fillStyle = dots;
          const x = Math.random()*canvas.width, y = Math.random()*canvas.height, s = Math.random()*1.2;
          ctx.fillRect(x,y,s,s);
        }
        addOverlayFromDataURL(`Preset: ${kind}`, canvas.toDataURL('image/png'), canvas.width, canvas.height);
      }

      // Overlay list UI
        function renderOverlayList(){
      const list = document.getElementById('ov-list');
      const hint = document.getElementById('ov-add-hint');
      const btnAdd = document.getElementById('ov-add-photo');
      const btnAddMenu = document.getElementById('lc-overlay-add-menu-btn');
      if (!list) return;

      const L = ensureOverlaysOnLayout(activeLayout());
      const arr = L?.overlays || [];
      const sel = L?.ovSel ?? -1;
      syncOverlayVisibilityEye?.();
      syncViewMenuUI?.();
      const overlayTitle=document.getElementById('lc-overlays-title');
      if(overlayTitle)overlayTitle.textContent=`Slabs (${arr.length})`;

      // Enforce/reflect limit
      const atLimit=arr.length>=MAX_SLABS_PER_LAYOUT;
      if(btnAdd)btnAdd.disabled=atLimit;
      if(btnAddMenu){
        btnAddMenu.disabled=atLimit;
        btnAddMenu.title=atLimit?`Limit ${MAX_SLABS_PER_LAYOUT} slabs per layout reached.`:'Add slab';
        if(atLimit)btnAddMenu.setAttribute('aria-expanded','false');
      }
      if(hint)hint.textContent=atLimit?`Limit ${MAX_SLABS_PER_LAYOUT} slabs per layout reached.`:'';

      list.innerHTML = '';
      if (!arr.length){
        list.innerHTML = '<div class="lc-small lc-overlay-empty">No slabs.</div>';
        return;
      }

      // Small helpers
      const basename = (s)=> String(s||'').split(/[\\/]/).pop();

      const mkIcon = (d)=> {
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('class','lc-icon'); svg.setAttribute('viewBox','0 0 24 24');
        const path = document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d', d); path.setAttribute('fill','none'); path.setAttribute('stroke','currentColor'); path.setAttribute('stroke-width','2'); path.setAttribute('stroke-linecap','round'); path.setAttribute('stroke-linejoin','round');
        svg.appendChild(path);
        return svg;
      };
      const ICON_EYE     = 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
      const ICON_EYE_OFF = 'M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.57 20.57 0 0 1 5.06-5.94M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-5.12M1 1l22 22';
      const ICON_TRASH   = 'M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 11H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z';
      const ICON_COPY    = 'M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3M5 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z';
      const ICON_EDIT    = 'M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4';

      arr.forEach((o, idx)=>{
        const row = document.createElement('div');
        row.className = 'lc-ov-row' + (idx===sel ? ' selected' : '');
        row.dataset.index = idx;

        // Eye button (tiny)
        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'lc-btn ghost xs lc-iconbtn ov-eye lc-overlay-eye-action';
        eye.title = o.visible ? 'Hide overlay' : 'Show overlay';
        eye.appendChild(mkIcon(o.visible ? ICON_EYE : ICON_EYE_OFF));

        // Name (file name shown; full name in tooltip)
        const name = document.createElement('div');
        name.className = 'ov-name';
        name.textContent = basename(o.name || `Slab ${idx+1}`);
        name.title = o.name || `Slab ${idx+1}`;

        // Right-side actions: visibility, rename, duplicate, delete.
        const actions=document.createElement('div');
        actions.className='ov-actions';

        const rename=document.createElement('button');
        rename.type='button';
        rename.className='lc-btn ghost xs lc-iconbtn lc-rename-btn';
        rename.title='Rename slab';
        rename.appendChild(mkIcon(ICON_EDIT));
        rename.onclick=e=>{
          e.preventDefault();e.stopPropagation();
          beginListRename(name,o,`Slab ${idx+1}`,renderOverlayList);
        };

        const duplicate=document.createElement('button');
        duplicate.type='button';
        duplicate.className='lc-btn ghost xs lc-iconbtn lc-slab-duplicate';
        duplicate.title='Duplicate slab';
        duplicate.appendChild(mkIcon(ICON_COPY));
        duplicate.disabled=arr.length>=MAX_SLABS_PER_LAYOUT;
        duplicate.onclick=e=>{
          e.preventDefault();e.stopPropagation();
          duplicateSlab(idx);
        };

        const del=document.createElement('button');
        del.type='button';
        del.className='lc-btn red xs lc-iconbtn ov-del lc-delete-btn';
        del.title='Delete slab';
        const trash=mkIcon(ICON_TRASH);
        const trashPath=trash.querySelector('path');
        if(trashPath){trashPath.setAttribute('fill','currentColor');trashPath.setAttribute('stroke','none');}
        del.appendChild(trash);
        actions.append(eye,rename,duplicate,del);

        // Click row to select (like Sinks); ignore clicks on the buttons themselves
        row.addEventListener('click', (e)=>{
          if ((e.target).closest('button')) return;
          selectOverlay(idx);
          renderOverlayList(); // refresh selected style
        });

        // Show/Hide
        eye.addEventListener('click', (e)=>{
          e.preventDefault(); e.stopPropagation();
          o.visible = !o.visible;
          draw(); scheduleSave(); pushHistory();
          renderOverlayList();  // rebuild icon/title
          syncOverlayUI?.();
          if(idx===L.ovSel)updateInspector?.();
        });

        // Delete
        del.addEventListener('click', (e)=>{
          e.preventDefault(); e.stopPropagation();
          arr.splice(idx,1);
          if (L.ovSel >= arr.length) L.ovSel = arr.length - 1;
          draw(); scheduleSave(); pushHistory();
          renderOverlayList();
          syncOverlayUI?.();
          updateInspector?.();
        });

        row.append(name, actions);
        list.appendChild(row);
      });
    }



      function isSelected(id){ return state.selectedIds.includes(id); }
      function setSelection(ids){
        state.selectedIds = Array.from(new Set(ids));
        state.selectedId = state.selectedIds[state.selectedIds.length - 1] || null; // keep old API working
      }
      function clearOverlaySelection(){
        const L=ensureOverlaysOnLayout(activeLayout());
        if(L)L.ovSel=-1;
      }
      function selectOnly(id){
        state.selectedDimId=null; state.selectedLineId=null; state.selectedNoteId=null;
        clearOverlaySelection();
        setSelection([id]);
      }
      function toggleSelect(id){
        state.selectedDimId=null; state.selectedLineId=null; state.selectedNoteId=null;
        clearOverlaySelection();
        if(isSelected(id)) setSelection(state.selectedIds.filter(x=>x!==id));
        else setSelection([...state.selectedIds, id]);
      }
      function clearSelection(){ setSelection([]); clearOverlaySelection(); }

      // 1) Manual dimension deletion
      window.addEventListener('keydown', (e) => {
        const ael = document.activeElement;
        const tag = (ael && ael.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (ael && ael.isContentEditable)) return;

        if (e.key !== 'Delete' && e.key !== 'Backspace') return;

        const L = cur();
        if (!L || !Array.isArray(L.dims)) return;
        if (!state.selectedDimId) return;

        const idx = L.dims.findIndex(d => d.id === state.selectedDimId);
        if (idx === -1) return;

        L.dims.splice(idx, 1);
        state.selectedDimId = null;

        draw();
        renderDimList();
        updateInspector();
        scheduleSave();
        pushHistory();

        e.preventDefault();
      });


      // Delete/Backspace removes the selected note.
      window.addEventListener('keydown', (e) => {
        const ael=document.activeElement;
        const tag=(ael&&ael.tagName||'').toLowerCase();
        if(tag==='input'||tag==='textarea'||tag==='select'||(ael&&ael.isContentEditable))return;
        if(e.key!=='Delete'&&e.key!=='Backspace')return;
        if(!state.selectedNoteId)return;
        const L=cur();
        if(!L||!Array.isArray(L.notes))return;
        const noteId=state.selectedNoteId;
        if(!deleteNoteAndLeaders(noteId,L))return;
        renderNoteList();renderLineList();draw();scheduleSave();pushHistory();updateInspector();
        e.preventDefault();
      });

      // Delete/Backspace removes selected countertop piece(s).
      window.addEventListener('keydown', (e) => {
        const ael=document.activeElement;
        const tag=(ael&&ael.tagName||'').toLowerCase();
        if(tag==='input'||tag==='textarea'||tag==='select'||(ael&&ael.isContentEditable))return;
        if(e.key!=='Delete'&&e.key!=='Backspace')return;
        // Let selected dimensions/lines/notes use their own delete handlers.
        if(state.selectedDimId||state.selectedLineId||state.selectedNoteId)return;
        const ids=state.selectedIds.length?[...state.selectedIds]:(state.selectedId?[state.selectedId]:[]);
        if(!ids.length)return;
        const before=state.pieces.length;
        ids.forEach(detachSplashChildren);
        state.pieces=state.pieces.filter(piece=>!ids.includes(piece.id));
        if(state.pieces.length===before)return;
        clearSelection();
        renderList();updateInspector();sinksUI?.refresh?.();draw();scheduleSave();pushHistory();
        e.preventDefault();
      });

      // Batch 1: keyboard + selection polish.
      window.addEventListener('keydown', (e) => {
        const ael=document.activeElement;
        const tag=(ael&&ael.tagName||'').toLowerCase();
        if(tag==='input'||tag==='textarea'||tag==='select'||(ael&&ael.isContentEditable))return;
        if(e.ctrlKey||e.metaKey||e.altKey)return;

        if(e.key==='Enter'){
          const hadMomentary=!!activeMomentaryTool?.();
          const hadTool=!!(state.dimTool||state.noteTool||state.lineTool);
          if(hadMomentary||hadTool){
            cancelPlacementTools({redraw:true});
            e.preventDefault();
            e.stopImmediatePropagation?.();
            return;
          }
        }

        if(e.key==='Escape'){
          const hadMomentary=!!activeMomentaryTool?.();
          const hadTool=!!(state.dimTool||state.noteTool||state.lineTool);
          if(hadMomentary||hadTool){
            cancelPlacementTools({redraw:true});
            e.preventDefault();
            e.stopImmediatePropagation?.();
            return;
          }
          if(theaterMode&&!document.fullscreenElement){
            setTheaterMode?.(false);
            e.preventDefault();
            e.stopImmediatePropagation?.();
            return;
          }
          clearSelection();state.selectedDimId=null;state.selectedLineId=null;state.selectedNoteId=null;
          renderList();renderDimList();renderNoteList();renderLineList();updateInspector();sinksUI?.refresh?.();draw();
          e.preventDefault();return;
        }

        const k=(e.key||'').toLowerCase();
        if(k==='p'){
          state.dimTool=false;state.lineTool=false;state.noteTool=false;
          dimTempStart=null;lineTempStart=null;
          syncDimToolUI?.();syncNoteToolUI?.();syncLineToolUI?.();
          document.getElementById('lc-add')?.click();
          e.preventDefault();
          return;
        }
        if(k!=='d'&&k!=='l'&&k!=='n')return;
        state.dimTool=k==='d';state.lineTool=k==='l';state.noteTool=k==='n';
        dimTempStart=null;lineTempStart=null;
        syncDimToolUI?.();syncNoteToolUI?.();syncLineToolUI?.();
        e.preventDefault();
      });

      // Ctrl/Cmd+A selects all countertop pieces.
      window.addEventListener('keydown',(e)=>{
        const ael=document.activeElement,tag=(ael&&ael.tagName||'').toLowerCase();
        if(tag==='input'||tag==='textarea'||tag==='select'||(ael&&ael.isContentEditable))return;
        if(!(e.ctrlKey||e.metaKey)||e.altKey||(e.key||'').toLowerCase()!=='a')return;
        state.selectedDimId=null;
        state.selectedLineId=null;
        state.selectedNoteId=null;
        clearOverlaySelection();
        setSelection(state.pieces.map(p=>p.id));
        state.lastSelIndex=state.pieces.length-1;
        renderList();renderDimList();renderLineList();renderNoteList();updateInspector();sinksUI?.refresh?.();draw();syncTopBar?.();
        e.preventDefault();
      });

      // Ctrl/Cmd+D duplicates the active canvas entity selection.
      // Pieces support multi-select; annotation/overlay selections are single-active by design.
      window.addEventListener('keydown',(e)=>{
        const ael=document.activeElement,tag=(ael&&ael.tagName||'').toLowerCase();
        if(tag==='input'||tag==='textarea'||tag==='select'||(ael&&ael.isContentEditable))return;
        if(!(e.ctrlKey||e.metaKey)||e.altKey||(e.key||'').toLowerCase()!=='d')return;

        const L=cur();
        if(!L)return;

        const step=Math.max(0.001,Math.abs(Number(state.grid)||1));
        const offsetForBounds=(min,max,limit)=>{
          let d=step;
          if(max+d>limit)d=-step;
          if(min+d<0||max+d>limit)d=0;
          return d;
        };
        const shiftedSegmentCopy=(src)=>{
          const copy=JSON.parse(JSON.stringify(src));
          copy.id=uid();
          const minX=Math.min(Number(src.x1)||0,Number(src.x2)||0);
          const maxX=Math.max(Number(src.x1)||0,Number(src.x2)||0);
          const minY=Math.min(Number(src.y1)||0,Number(src.y2)||0);
          const maxY=Math.max(Number(src.y1)||0,Number(src.y2)||0);
          const dx=offsetForBounds(minX,maxX,state.cw);
          const dy=offsetForBounds(minY,maxY,state.ch);
          copy.x1=round3((Number(src.x1)||0)+dx);
          copy.y1=round3((Number(src.y1)||0)+dy);
          copy.x2=round3((Number(src.x2)||0)+dx);
          copy.y2=round3((Number(src.y2)||0)+dy);
          return copy;
        };

        let duplicated=false;

        // Manual dimension
        if(state.selectedDimId&&Array.isArray(L.dims)){
          const src=L.dims.find(d=>d.id===state.selectedDimId);
          if(src){
            const nd=shiftedSegmentCopy(src);
            nd.name=(src.name||'Dimension')+' Copy';
            L.dims.push(nd);
            clearSelection();
            state.selectedDimId=nd.id;
            state.selectedLineId=null;
            state.selectedNoteId=null;
            duplicated=true;
          }
        }
        // Free line / detached note leader
        else if(state.selectedLineId&&Array.isArray(L.lines)){
          const src=L.lines.find(lineObj=>lineObj.id===state.selectedLineId);
          if(src){
            const nl=shiftedSegmentCopy(src);
            nl.name=(src.name||'Line')+' Copy';
            // A line copied by itself becomes independent instead of creating
            // a second live attachment to the original Note.
            delete nl.attachedNoteId;
            delete nl.attachedEnd;
            L.lines.push(nl);
            clearSelection();
            state.selectedDimId=null;
            state.selectedLineId=nl.id;
            state.selectedNoteId=null;
            duplicated=true;
          }
        }
        // Note (including any attached leader line)
        else if(state.selectedNoteId&&Array.isArray(L.notes)){
          const src=L.notes.find(note=>note.id===state.selectedNoteId);
          if(src){
            const nn=JSON.parse(JSON.stringify(src));
            nn.id=uid();
            const dx=offsetForBounds(Number(src.x)||0,Number(src.x)||0,state.cw);
            const dy=offsetForBounds(Number(src.y)||0,Number(src.y)||0,state.ch);
            nn.x=round3((Number(src.x)||0)+dx);
            nn.y=round3((Number(src.y)||0)+dy);

            const leaderCopies=noteLeadersFor(src.id,L).map(lineObj=>{
              const nl=JSON.parse(JSON.stringify(lineObj));
              nl.id=uid();
              nl.attachedNoteId=nn.id;
              nl.x1=round3((Number(lineObj.x1)||0)+dx);
              nl.y1=round3((Number(lineObj.y1)||0)+dy);
              nl.x2=round3((Number(lineObj.x2)||0)+dx);
              nl.y2=round3((Number(lineObj.y2)||0)+dy);
              return nl;
            });

            L.notes.push(nn);
            if(!Array.isArray(L.lines))L.lines=[];
            L.lines.push(...leaderCopies);
            clearSelection();
            state.selectedDimId=null;
            state.selectedLineId=null;
            state.selectedNoteId=nn.id;
            duplicated=true;
          }
        }
        // Slab overlay (still respects the two-overlay-per-layout limit)
        else{
          const OL=ensureOverlaysOnLayout(activeLayout());
          const overlaySelected=OL&&OL.ovSel>=0&&OL.ovSel<OL.overlays.length;
          if(overlaySelected){
            if(OL.overlays.length<2){
              const src=OL.overlays[OL.ovSel];
              const no=JSON.parse(JSON.stringify(src));
              no.id=uid();
              no.name=(src.name||'Overlay')+' Copy';
              no.x=round3((Number(src.x)||0)+step);
              no.y=round3((Number(src.y)||0)+step);
              clampOverlayToCanvas(no);
              OL.overlays.push(no);
              state.selectedDimId=null;
              state.selectedLineId=null;
              state.selectedNoteId=null;
              setSelection([]);
              OL.ovSel=OL.overlays.length-1;
              duplicated=true;
            }
          }else{
            // Countertop piece(s)
            const ids=state.selectedIds.length?[...state.selectedIds]:(state.selectedId?[state.selectedId]:[]);
            const originals=state.pieces.filter(p=>ids.includes(p.id));
            if(originals.length){
              const newIds=[];
              originals.forEach(p=>{
                const rs=realSize(p),np=JSON.parse(JSON.stringify(p));
                np.id=uid();
                const sourceWasSplash=isBacksplashPiece(p);
                np.name=sourceWasSplash?'Splash':(p.name||'Piece')+' Copy';
                if(sourceWasSplash){
                  np.pieceType='backsplash';
                  np.tags=Array.from(new Set([...(Array.isArray(np.tags)?np.tags:[]),'backsplash']));
                  delete np.attachment;
                }
                np.x=clamp(snap(p.x+state.grid,state.grid),0,state.cw-rs.w);
                np.y=clamp(snap(p.y+state.grid,state.grid),0,state.ch-rs.h);
                const srcSlab=ensureSlabPlacement(p);
                np.slabPlacement={x:srcSlab.x+state.grid,y:srcSlab.y+state.grid,rotation:srcSlab.rotation};
                clampSlabPlacement(np);
                np.layer=Math.max(0,...state.pieces.map(x=>x.layer||0))+1;
                state.pieces.push(np);
                newIds.push(np.id);
              });
              state.selectedDimId=null;
              state.selectedLineId=null;
              state.selectedNoteId=null;
              clearOverlaySelection();
              setSelection(newIds);
              state.lastSelIndex=state.pieces.length-1;
              duplicated=true;
            }
          }
        }

        if(!duplicated)return;

        renderList();
        renderDimList();
        renderLineList();
        renderNoteList();
        renderOverlayList?.();
        syncOverlayUI?.();
        updateInspector();
        sinksUI?.refresh?.();
        draw();
        scheduleSave();
        pushHistory();
        e.preventDefault();
      });

      // 2) Arrow keys move selected pieces
      window.addEventListener('keydown', (e) => {
        const ael = document.activeElement;
        const tag = (ael && ael.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (ael && ael.isContentEditable)) return;

        const targets = state.selectedIds.length
          ? state.pieces.filter(p => state.selectedIds.includes(p.id))
          : (state.selectedId ? [state.pieces.find(x => x.id === state.selectedId)].filter(Boolean) : []);

        if (!targets.length) return;

        let dx = 0, dy = 0;
        // Arrow = one grid step; Shift+Arrow = four grid steps.
        const step = (e.shiftKey ? 4 : 1) * state.grid;
        if (e.key === 'ArrowLeft')      dx = -step;
        else if (e.key === 'ArrowRight') dx = step;
        else if (e.key === 'ArrowUp')    dy = -step;
        else if (e.key === 'ArrowDown')  dy = step;
        else return;

        e.preventDefault();

        if(state.workspace==='slab'){
          targets.forEach(p=>{
            const sp=ensureSlabPlacement(p);
            const rs=slabRealSize(p);
            sp.x=clamp(snap(sp.x+dx,state.grid),0,state.cw-rs.w);
            sp.y=clamp(snap(sp.y+dy,state.grid),0,state.ch-rs.h);
          });
        }else{
          const targetIds=new Set(targets.map(p=>p.id));
          targets.forEach(p=>{
            if(isLinkedSplash(p)&&isSplashSnappedToParent(p)&&!targetIds.has(p.attachment.parentPieceId)){
              p.attachment.snapped=false;
            }
          });
          targets.forEach(p=>{
            const rs=realSize(p);
            p.x=clamp(snap(p.x+dx,state.grid),0,state.cw-rs.w);
            p.y=clamp(snap(p.y+dy,state.grid),0,state.ch-rs.h);
          });
        }
        draw();
        scheduleSave();
      });

      // 3) Keyup commit for history
      window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          scheduleSave();
          pushHistory();
          syncTopBar?.();
        }
      });



    // Keyboard shortcuts: Undo/Redo  (Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z)
    window.addEventListener('keydown', (e) => {
      // Don’t hijack keys while typing in inputs
      const ael = document.activeElement;
      const tag = (ael && ael.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (ael && ael.isContentEditable)) return;

      if (!e.ctrlKey && !e.metaKey) return; // require Ctrl/Cmd
      const k = (e.key || '').toLowerCase();

      // Undo: Ctrl/Cmd+Z (no Shift)
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (typeof canUndo === 'function' && canUndo()) undo();
        return;
      }

      // Redo: Ctrl/Cmd+Y  OR  Ctrl/Cmd+Shift+Z
      if ((k === 'y') || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        if (typeof canRedo === 'function' && canRedo()) redo();
        return;
      }
    });


      // create first layout and map legacy props to "current layout"
      const uid = () => Math.random().toString(36).slice(2,9);
      function makeLayout(name){
        return { 
          id: uid(),
          name: name || 'Layout 1',
          cw:180,
          ch:120,
          scale:6,
          grid:1,
          showGrid:true,
          pieces: [],
          dims: [],        // << manual dimension lines
          notes: [],       // canvas text annotations
          lines: [],       // free canvas drawing lines
          showManualDims: true  
        };
      }

      state.layouts = [ makeLayout('Layout 1') ];
      const cur = () => {
        const L = state.layouts[state.active];
        if (!L) return null;
        if (!Array.isArray(L.dims)) L.dims = [];
        if (!Array.isArray(L.lines)) L.lines = [];
        return L;
      };

      // Map old properties to current layout so the rest of the code keeps working
      ['cw','ch','scale','grid','showGrid','pieces'].forEach(k=>{
        Object.defineProperty(state, k, {
          get(){ return cur()[k]; },
          set(v){ cur()[k] = v; }
        });
      });

      // ==== Robust short-link wiring (works even if the button is added later) ====
      window.SHARE_SERVICE_ORIGIN = 'https://copy-share-link.netlify.app';

      // Make shareShort global and resilient
      window.shareShort = window.shareShort || async function shareShort() {
        try {
          if (typeof getSnapshot !== 'function') throw new Error('getSnapshot() not found');
          const snapshot = getSnapshot();

          const res = await fetch(`${window.SHARE_SERVICE_ORIGIN}/api/share`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ snapshot })
          });
          if (!res.ok) throw new Error(`Share failed: ${res.status}`);
          const { id, url } = await res.json();

          // Copy and reflect ?id in the URL (optional)
          try { await navigator.clipboard.writeText(url); } catch {}
          const u = new URL(location.href); u.searchParams.set('id', id);
          window.history.replaceState(null, '', u.toString());

          alert('Short link copied:\n' + url);
        } catch (e) {
          console.warn('[shareShort] error:', e);
          alert('Could not create share link.');
        }
      };

      // Neutralize any legacy inline handler and route to short links
      window.copyShareLink = function(ev) {
        try { ev && ev.preventDefault && ev.preventDefault(); } catch {}
        return window.shareShort();
      };

      // Event delegation: fires even if the button is inserted later
      document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('#copy-share-link');
        if (!btn) return;
        console.log('[copy-share-link] click'); // sanity log
        e.preventDefault();
        window.shareShort();
      }, { passive: false });

      // Safety: ensure the button isn’t disabled by CSS pointer-events
      const style = document.createElement('style');
      style.textContent = `#copy-share-link { pointer-events:auto; }`;
      document.head.appendChild(style);


      // ------- Elements -------
      const svg = document.getElementById('lc-svg');
      const meta = document.getElementById('lc-meta');
      const inCW = document.getElementById('lc-cw');
      const inCH = document.getElementById('lc-ch');
      const inGrid = document.getElementById('lc-grid');
      const inScale = document.getElementById('lc-scale');
      const lblScale = document.getElementById('lc-scale-label');
      const layoutsEl  = document.getElementById('lc-layouts');
      const btnAddLayout = document.getElementById('lc-add-layout');
      const inNotes = document.getElementById('lc-notes');
      const btnExportPDF = document.getElementById('lc-export-pdf');
      const btnSnapAll = document.getElementById('lc-snapall');
      const btnReset  = document.getElementById('lc-reset');
      const btnClearSel = document.getElementById('lc-clear-sel');

      const inspectorCard = document.getElementById('lc-inspector');

      const btnUndoTop  = document.getElementById('lc-undo');
      const btnRedoTop  = document.getElementById('lc-redo');
      let historyReady=false;
      let syncEditMenuState=()=>{};

      const toolbarIcon=(pathD)=>'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="'+pathD+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      // Keep toolbar menus/flyouts inside the visible viewport. Submenus prefer
      // their natural side but flip automatically when that side has less room.
      const fitFloatingMenuToViewport=(panel,anchor,{submenu=false,gap=4}={})=>{
        if(!panel||panel.hidden)return;
        const pad=8;
        panel.style.setProperty('position','fixed','important');
        panel.style.setProperty('right','auto','important');
        panel.style.setProperty('bottom','auto','important');
        panel.style.setProperty('max-width',`calc(100vw - ${pad*2}px)`,'important');
        panel.style.setProperty('max-height',`calc(100vh - ${pad*2}px)`,'important');
        panel.style.setProperty('overflow-y','auto','important');
        panel.style.setProperty('overscroll-behavior','contain','important');
        panel.style.setProperty('z-index','2000','important');

        const rect=(anchor||panel.parentElement)?.getBoundingClientRect?.();
        if(!rect)return;
        const vw=Math.max(1,window.innerWidth||document.documentElement.clientWidth||1);
        const vh=Math.max(1,window.innerHeight||document.documentElement.clientHeight||1);
        const w=Math.min(panel.offsetWidth||280,Math.max(1,vw-pad*2));
        const h=Math.min(panel.offsetHeight||0,Math.max(1,vh-pad*2));

        let left;
        let top;
        if(submenu){
          const roomRight=vw-pad-rect.right;
          const roomLeft=rect.left-pad;
          const openRight=roomRight>=w+gap || roomRight>=roomLeft;
          left=openRight ? rect.right+gap : rect.left-w-gap;
          top=rect.top-4;
        }else{
          left=rect.right-w;
          top=rect.bottom+6;
        }

        left=Math.max(pad,Math.min(left,vw-pad-w));
        top=Math.max(pad,Math.min(top,vh-pad-h));
        panel.style.setProperty('left',Math.round(left)+'px','important');
        panel.style.setProperty('top',Math.round(top)+'px','important');
      };

      const topToolbar=btnUndoTop?.closest('.lc-toolbar');
      const primaryToolHost=btnUndoTop?.closest('.lc-2x2');
      if(primaryToolHost)primaryToolHost.classList.add('lc-primary-tools');

      if(btnUndoTop){
        btnUndoTop.innerHTML=toolbarIcon('M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6');
        btnUndoTop.title='Undo (Ctrl+Z)';
        btnUndoTop.setAttribute('aria-label','Undo');
        btnUndoTop.className='lc-btn ghost lc-iconbtn lc-toolbar-icon';
      }
      if(btnRedoTop){
        btnRedoTop.innerHTML=toolbarIcon('m15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6');
        btnRedoTop.title='Redo (Ctrl+Y)';
        btnRedoTop.setAttribute('aria-label','Redo');
        btnRedoTop.className='lc-btn ghost lc-iconbtn lc-toolbar-icon';
      }

      function syncCanvasContext(){
        const projectEl=document.getElementById('lc-toolbar-project');
        const layoutEl=document.getElementById('lc-toolbar-layout');
        if(projectEl)projectEl.textContent=(state.projectName||'Untitled Project').trim()||'Untitled Project';
        const L=state.layouts?.[state.active];
        if(layoutEl)layoutEl.textContent=L?.name||`Layout ${(state.active||0)+1}`;
      }

      if(topToolbar&&!document.getElementById('lc-toolbar-context')){
        const context=document.createElement('div');
        context.id='lc-toolbar-context';
        context.className='lc-toolbar-context';
        const project=document.createElement('div');
        project.id='lc-toolbar-project';
        project.className='lc-toolbar-project';
        const layout=document.createElement('div');
        layout.id='lc-toolbar-layout';
        layout.className='lc-toolbar-layout';
        context.append(project,layout);
        topToolbar.prepend(context);
        syncCanvasContext();
      }
      if(btnClearSel){
        const ctl=btnClearSel.closest?.('.lc-ctl');
        if(ctl)ctl.style.display='none'; else btnClearSel.style.display='none';
      }

      const togLabels   = document.getElementById('lc-toggle-labels');
      const togDims     = document.getElementById('lc-toggle-dims');
      const togManualDims  = document.getElementById('lc-toggle-manual-dims'); 
      const togGrid     = document.getElementById('lc-toggle-grid');
      const btnDimTool = document.getElementById('lc-dim-tool');
      const btnNoteTool=document.createElement('button');
      btnNoteTool.className='lc-btn ghost big'; btnNoteTool.type='button'; btnNoteTool.id='lc-note-tool';
      // Use the known-visible spacer in the existing toggle grid.
      const toggleGrid=togGrid?.closest('.lc-2x2');
      const toggleSpacer=toggleGrid ? Array.from(toggleGrid.children).find(el=>el.classList?.contains('lc-ctl') && !el.querySelector('button')) : null;
      const toolHost=btnDimTool?.closest('.lc-ctl'); if(toolHost)toolHost.appendChild(btnNoteTool); else btnDimTool?.parentElement?.appendChild(btnNoteTool);
      function syncNoteToolUI(){const on=!!state.noteTool;btnNoteTool.textContent=on?'Note Tool: On':'Note Tool: Off';btnNoteTool.classList.toggle('alt',on);btnNoteTool.classList.toggle('ghost',!on);btnNoteTool.style.background=on?'#e5e7eb':'#fff';btnNoteTool.style.color='#111';syncCanvasToolCursor();}
      btnNoteTool.onclick=()=>{state.noteTool=!state.noteTool;if(state.noteTool){state.dimTool=false;state.lineTool=false;syncDimToolUI?.();syncLineToolUI?.();}syncNoteToolUI();}; syncNoteToolUI();
      const btnLineTool=document.createElement('button');
      btnLineTool.className='lc-btn ghost big'; btnLineTool.type='button'; btnLineTool.id='lc-line-tool';
      if(toolHost)toolHost.appendChild(btnLineTool); else btnDimTool?.parentElement?.appendChild(btnLineTool);
      function syncLineToolUI(){const on=!!state.lineTool;btnLineTool.textContent=on?'Line Tool: On':'Line Tool: Off';btnLineTool.classList.toggle('alt',on);btnLineTool.classList.toggle('ghost',!on);btnLineTool.style.background=on?'#e5e7eb':'#fff';btnLineTool.style.color='#111';syncCanvasToolCursor();}
      btnLineTool.onclick=()=>{state.lineTool=!state.lineTool;if(state.lineTool){state.dimTool=false;state.noteTool=false;syncDimToolUI?.();syncNoteToolUI();}if(!state.lineTool)lineTempStart=null;syncLineToolUI();}; syncLineToolUI();

      // Drawing tools now live in the Notes / Dimensions / Lines list headers.
      // Keep these controls in the DOM for the existing tool logic, but remove them from the top toolbar.
      [btnDimTool,btnNoteTool,btnLineTool].forEach(btn=>{
        if(!btn)return;
        btn.style.display='none';
      });
      if(toolHost)toolHost.style.display='none';

      const activateDimTool=()=>{
        if(state.workspace==='slab')return;
        state.dimTool=true;state.noteTool=false;state.lineTool=false;
        dimTempStart=null;lineTempStart=null;state.selectedDimId=null;
        syncDimToolUI?.();syncNoteToolUI?.();syncLineToolUI?.();
      };
      const activateNoteTool=()=>{
        if(state.workspace==='slab')return;
        state.noteTool=true;state.dimTool=false;state.lineTool=false;
        dimTempStart=null;lineTempStart=null;
        syncDimToolUI?.();syncNoteToolUI?.();syncLineToolUI?.();
      };
      const activateLineTool=()=>{
        if(state.workspace==='slab')return;
        state.lineTool=true;state.dimTool=false;state.noteTool=false;
        dimTempStart=null;lineTempStart=null;
        syncDimToolUI?.();syncNoteToolUI?.();syncLineToolUI?.();
      };

      // VIEW menu: keep display controls together and leave the toolbar for working tools.
      const showNotesHost=togGrid?.closest('.lc-2x2');
      const viewChecks=new Map();
      let viewFormatSelect=null;
      let viewPrecisionSelect=null;
      const viewPieceDisplayButtons=new Map();
      const viewWorkspaceButtons=new Map();
      let viewWorkspaceSectionIcon=null;
      const viewThemeButtons=new Map();

      const pieceDisplayMode=()=>state.showSlabMaterial?'slab':(state.showPieceFills===false?'empty':'color');
      const setPieceDisplayMode=(mode,{history=true}={})=>{
        const next=['color','slab','empty'].includes(mode)?mode:'color';
        state.showPieceFills=next==='color';
        state.showSlabMaterial=next==='slab';
        saveCurrentWorkspaceViewState?.();
        syncPieceFillUI?.();
        syncViewMenuUI?.();
        draw?.();
        scheduleSave?.();
        if(history)pushHistory?.();
        syncTopBar?.();
      };

      const workspaceCommandAllowed=el=>{
        const required=el?.dataset?.workspaceRequired;
        if(!required)return true;
        return required==='slab' ? state.workspace==='slab' : state.workspace!=='slab';
      };
      const syncWorkspaceCommandAvailability=(scope=document)=>{
        scope.querySelectorAll?.('[data-workspace-required]').forEach(el=>{
          const ok=workspaceCommandAllowed(el);
          const required=el.dataset.workspaceRequired;
          el.classList.toggle('is-workspace-disabled',!ok);
          el.setAttribute('aria-disabled',String(!ok));
          el.title=ok
            ? (el.dataset.workspaceTitle||'')
            : `Switch to ${required==='slab'?'SLAB':'DESIGN'} tab`;
        });
      };
      const markWorkspaceCommand=(el,required,title='')=>{
        if(!el)return el;
        el.dataset.workspaceRequired=required;
        el.dataset.workspaceTitle=title;
        syncWorkspaceCommandAvailability(el.parentElement||document);
        return el;
      };
      let viewCWInput=null;
      let viewCHInput=null;
      let viewGridInput=null;
      let viewZoomInput=null;

      const zoomMin=Number(inScale?.min)||4;
      const zoomMax=Number(inScale?.max)||24;
      const zoomStep=Number(inScale?.step)||1;
      let btnZoomOut=null;
      let btnZoomIn=null;

      const THEME_KEY='litecad:theme';
      const themeMedia=window.matchMedia?.('(prefers-color-scheme: dark)')||null;
      let themeMode='light';
      try{
        const savedTheme=localStorage.getItem(THEME_KEY);
        if(['light','dark','system'].includes(savedTheme))themeMode=savedTheme;
      }catch(_){}

      const resolvedTheme=()=>themeMode==='system'
        ? (themeMedia?.matches?'dark':'light')
        : themeMode;

      function applyThemePreference(mode,{persist=true}={}){
        themeMode=['light','dark','system'].includes(mode)?mode:'system';
        const root=document.querySelector('.lite-cad');
        const resolved=resolvedTheme();
        if(root){
          root.classList.toggle('lc-theme-dark',resolved==='dark');
          root.classList.toggle('lc-theme-light',resolved==='light');
          root.dataset.themeMode=themeMode;
          root.dataset.themeResolved=resolved;
        }
        viewThemeButtons.forEach((btn,key)=>{
          const selected=key===themeMode;
          btn.classList.toggle('is-selected',selected);
          btn.setAttribute('aria-pressed',String(selected));
        });
        if(persist){
          try{localStorage.setItem(THEME_KEY,themeMode);}catch(_){}
        }
      }

      const handleSystemThemeChange=()=>{
        if(themeMode==='system')applyThemePreference('system',{persist:false});
      };
      if(themeMedia?.addEventListener)themeMedia.addEventListener('change',handleSystemThemeChange);
      else if(themeMedia?.addListener)themeMedia.addListener(handleSystemThemeChange);
      applyThemePreference(themeMode,{persist:false});

      const viewHost=document.createElement('div');
      viewHost.className='lc-ctl';
      viewHost.style.position='relative';
      viewHost.style.zIndex='30';

      const btnView=document.createElement('button');
      btnView.type='button';
      btnView.className='lc-btn ghost big';
      btnView.id='lc-view-menu-btn';
      btnView.textContent='VIEW ▾';
      btnView.setAttribute('aria-haspopup','menu');
      btnView.setAttribute('aria-expanded','false');

      const viewMenu=document.createElement('div');
      viewMenu.id='lc-view-menu';
      viewMenu.className='lc-toolbar-menu lc-view-menu';
      viewMenu.hidden=true;
      viewMenu.setAttribute('role','menu');
      Object.assign(viewMenu.style,{
        position:'absolute',
        top:'calc(100% + 6px)',
        right:'0',
        width:'250px',
        maxWidth:'min(250px, 88vw)',
        padding:'8px',
        border:'1px solid #d1d5db',
        borderRadius:'8px',
        background:'#fff',
        boxShadow:'0 10px 28px rgba(0,0,0,.14)',
        textAlign:'left'
      });

      let viewMenuMount=viewMenu;

      const addViewGroup=(label)=>{
        const h=document.createElement('div');
        h.textContent=label;
        h.style.fontSize='11px';
        h.style.fontWeight='700';
        h.style.letterSpacing='.04em';
        h.style.textTransform='uppercase';
        h.style.opacity='.55';
        h.style.padding='7px 7px 4px';
        viewMenuMount.appendChild(h);
      };

      const addViewToggle=(label,key)=>{
        const row=document.createElement('label');
        row.className='lc-menu-toggle-row';
        row.style.display='flex';
        row.style.alignItems='center';
        row.style.gap='9px';
        row.style.padding='6px 7px';
        row.style.borderRadius='6px';
        row.style.cursor='pointer';
        row.onmouseenter=()=>row.style.background='#f3f4f6';
        row.onmouseleave=()=>row.style.background='transparent';

        const cb=document.createElement('input');
        cb.type='checkbox';
        cb.checked=!!state[key];
        cb.onchange=()=>{
          state[key]=!!cb.checked;
          saveCurrentWorkspaceViewState?.();
          draw();
          scheduleSave?.();
          pushHistory();
          syncTopBar?.();
          syncListVisibilityEyes?.();
          syncPieceFillUI?.();
          if(key==='showSinkCenterlines')syncSinkCenterlineVisibilityUI?.();
        };

        const text=document.createElement('span');
        text.textContent=label;
        text.style.fontSize='13px';
        row.append(cb,text);
        viewChecks.set(key,cb);
        viewMenuMount.appendChild(row);
      };

      const addViewAction=(label,onClick,{icon='',shortcut=''}={})=>{
        const row=document.createElement('button');
        row.type='button';
        row.className='lc-btn ghost lc-menu-command';
        row.style.display='flex';
        row.style.alignItems='center';
        row.style.width='100%';
        row.style.justifyContent='flex-start';
        row.style.padding='7px';
        row.style.border='0';
        row.style.background='transparent';
        row.style.fontSize='13px';
        row.style.cursor='pointer';

        const iconEl=document.createElement('span');
        iconEl.className='lc-menu-icon';
        if(icon)iconEl.innerHTML=toolbarIcon(icon);
        const text=document.createElement('span');
        text.className='lc-menu-label';
        text.textContent=label;
        text.title=label;
        const key=document.createElement('span');
        key.className='lc-menu-shortcut';
        key.textContent=shortcut;
        if(shortcut)row.classList.add('lc-menu-has-shortcut');
        row.append(iconEl,text,key);

        row.onmouseenter=()=>{row.style.background='#f3f4f6';closeViewSubmenus?.();};
        row.onmouseleave=()=>row.style.background='transparent';
        row.onclick=()=>{
          onClick();
          syncViewMenuUI?.();
        };
        viewMenuMount.appendChild(row);
        return row;
      };

      let overlayVisibilityViewCheck=null;
      const addLayoutViewToggle=(label,getValue,onChange)=>{
        const row=document.createElement('label');
        row.className='lc-menu-toggle-row';
        row.style.display='flex';
        row.style.alignItems='center';
        row.style.gap='9px';
        row.style.padding='6px 7px';
        row.style.borderRadius='6px';
        row.style.cursor='pointer';
        row.onmouseenter=()=>row.style.background='#f3f4f6';
        row.onmouseleave=()=>row.style.background='transparent';
        const cb=document.createElement('input');
        cb.type='checkbox';
        cb.checked=!!getValue();
        cb.onchange=()=>{
          onChange(!!cb.checked);
          syncViewMenuUI?.();
        };
        const text=document.createElement('span');
        text.textContent=label;
        text.style.fontSize='13px';
        row.append(cb,text);
        viewMenuMount.appendChild(row);
        return cb;
      };

      const addViewNumber=(label,{min=null,max=null,step='any',suffix=''}={},onChange)=>{
        const row=document.createElement('label');
        row.className='lc-view-number-row';
        row.style.display='grid';
        row.style.gridTemplateColumns='minmax(0,1fr) 84px 36px';
        row.style.alignItems='center';
        row.style.columnGap='5px';
        row.style.padding='6px 7px';

        const text=document.createElement('span');
        text.className='lc-view-number-label';
        text.textContent=label;
        text.style.fontSize='13px';

        const input=document.createElement('input');
        input.type='number';
        input.className='lc-input lc-view-number-input';
        input.style.width='84px';
        if(min!=null)input.min=String(min);
        if(max!=null)input.max=String(max);
        input.step=String(step);
        input.onchange=()=>onChange(input.value);

        const unit=document.createElement('span');
        unit.className='lc-view-number-unit';
        unit.textContent=suffix||'';

        row.append(text,input,unit);
        viewMenuMount.appendChild(row);
        return input;
      };

      const addViewSelect=(label,options,onChange)=>{
        const row=document.createElement('label');
        row.style.display='grid';
        row.style.gridTemplateColumns='1fr auto';
        row.style.alignItems='center';
        row.style.gap='10px';
        row.style.padding='6px 7px';

        const text=document.createElement('span');
        text.textContent=label;
        text.style.fontSize='13px';

        const sel=document.createElement('select');
        sel.className='lc-input';
        sel.style.minWidth='105px';
        options.forEach(([value,textValue])=>{
          const o=document.createElement('option');
          o.value=String(value);o.textContent=textValue;sel.appendChild(o);
        });
        sel.onchange=()=>onChange(sel.value);
        row.append(text,sel);
        viewMenuMount.appendChild(row);
        return sel;
      };

      const workspaceViewIconPaths={
        layout:'M4 5h16v14H4zM7 9h10M7 13h7',
        slab:'M4 5h16v14H4zM6 15c4-6 6 2 12-6M6 11c3-3 6 1 12-3'
      };
      const viewMenuIconPaths={
        Canvas:'M4 5h16v14H4zM8 5v14M16 5v14',
        Pieces:'M5 6h14v12H5zM8 9h8v6H8z',
        Overlays:'M5 5h12v12H5zM8 8h12v12H8z',
        Annotations:'M5 18 18 5M7 5h10M5 7v10',
        Theme:'M12 3a9 9 0 1 0 9 9c-2.2 1.4-4.5 2.1-6.8 2.1A9 9 0 0 1 12 3Z',
        'Number Format':'M6 7h5M6 12h12M6 17h8',
        Workspace:workspaceViewIconPaths.layout
      };
      const viewSubmenus=[];
      const closeViewSubmenus=()=>{
        viewSubmenus.forEach(panel=>panel.hidden=true);
      };
      const addViewSubmenu=(label,build)=>{
        const wrap=document.createElement('div');
        wrap.style.position='relative';
        wrap.classList.add('lc-view-submenu-wrap');
        wrap.dataset.viewSection=label.toLowerCase().replace(/\s+/g,'-');

        const row=document.createElement('button');
        row.type='button';
        row.className='lc-btn ghost lc-menu-command lc-menu-submenu-row';
        row.style.display='flex';
        row.style.alignItems='center';
        row.style.justifyContent='space-between';
        row.style.width='100%';
        row.style.padding='7px';
        row.style.border='0';
        row.style.background='transparent';
        row.style.fontSize='13px';
        row.style.cursor='pointer';

        const icon=document.createElement('span');
        icon.className='lc-menu-icon';
        const iconPath=viewMenuIconPaths[label]||'';
        if(iconPath)icon.innerHTML=toolbarIcon(iconPath);
        const text=document.createElement('span');
        text.className='lc-menu-label';
        text.textContent=label;
        const arrow=document.createElement('span');
        arrow.className='lc-menu-chevron';
        arrow.textContent='›';
        arrow.style.fontSize='18px';
        arrow.style.lineHeight='1';
        row.append(icon,text,arrow);

        const panel=document.createElement('div');
        panel.hidden=true;
        panel.className='lc-view-submenu lc-toolbar-menu';
        Object.assign(panel.style,{
          position:'absolute',
          right:'calc(100% - 3px)',
          top:'-8px',
          width:'250px',
          maxWidth:'min(250px, 82vw)',
          padding:'8px',
          border:'1px solid #d1d5db',
          borderRadius:'8px',
          background:'#fff',
          boxShadow:'0 10px 28px rgba(0,0,0,.14)',
          zIndex:'2'
        });
        viewSubmenus.push(panel);

        const open=()=>{
          if(!workspaceCommandAllowed(wrap))return;
          viewSubmenus.forEach(other=>{if(other!==panel)other.hidden=true;});
          panel.hidden=false;
          requestAnimationFrame(()=>fitFloatingMenuToViewport(panel,row,{submenu:true}));
        };
        wrap.addEventListener('pointerenter',open);
        row.onclick=e=>{
          e.preventDefault();e.stopPropagation();
          if(!workspaceCommandAllowed(wrap))return;
          panel.hidden=!panel.hidden;
          if(!panel.hidden)open();
        };

        wrap.append(row,panel);
        viewMenu.appendChild(wrap);

        const previousMount=viewMenuMount;
        viewMenuMount=panel;
        build();
        viewMenuMount=previousMount;
        return panel;
      };

      addViewSubmenu('Pieces',()=>{
      addViewGroup('Display');
      const displayRow=document.createElement('div');
      displayRow.className='lc-theme-choice-row lc-piece-display-choice-row';
      const displayChoices=[
        ['color','Color','M5 5h14v14H5z'],
        ['slab','Slab','M5 5h14v14H5zM7 15c3-5 5 2 10-5M7 11c3-3 5 1 10-3'],
        ['empty','Empty','M5 5h14v14H5z']
      ];
      displayChoices.forEach(([mode,label,path])=>{
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='lc-theme-choice lc-piece-display-choice';
        btn.title=label+' piece display';
        btn.setAttribute('aria-label',label+' piece display');
        btn.innerHTML=toolbarIcon(path)+'<span>'+label+'</span>';
        if(mode==='color')btn.querySelector('svg path')?.setAttribute('fill','currentColor');
        if(mode==='empty'){
          const pathEl=btn.querySelector('svg path');
          pathEl?.setAttribute('fill','none');
          pathEl?.setAttribute('stroke','currentColor');
          pathEl?.setAttribute('stroke-width','1.8');
        }
        if(mode==='slab'){
          const paths=btn.querySelectorAll('svg path');
          paths[0]?.setAttribute('fill','none');
          paths[0]?.setAttribute('stroke','currentColor');
          paths[0]?.setAttribute('stroke-width','1.4');
          paths.forEach((p,i)=>{if(i>0){p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.3');}});
        }
        btn.onclick=e=>{e.preventDefault();e.stopPropagation();setPieceDisplayMode(mode);};
        viewPieceDisplayButtons.set(mode,btn);
        displayRow.appendChild(btn);
      });
      viewMenuMount.appendChild(displayRow);

      addViewGroup('Labels');
      addViewToggle('Piece Labels','showLabels');
      addViewToggle('Piece Label Dims','showLabelDims');
      addViewToggle('Piece Dims','showDims');

      addViewGroup('Splashes');
      addViewToggle('Splash Labels','showSplashLabels');
      addViewToggle('Splash Label Dims','showSplashLabelDims');
      addViewToggle('Splash Dims','showSplashDims');

      addViewGroup('Details');
      addViewToggle('Sink Centerlines','showSinkCenterlines');
      addViewToggle('Edge Profiles','showEdgeProfiles');
      });

      const workspaceViewPanel=addViewSubmenu('Workspace',()=>{
        const row=document.createElement('div');
        row.className='lc-theme-choice-row lc-workspace-choice-row';
        const choices=[
          ['layout','Design',workspaceViewIconPaths.layout],
          ['slab','Slab',workspaceViewIconPaths.slab]
        ];
        choices.forEach(([mode,label,path])=>{
          const btn=document.createElement('button');
          btn.type='button';
          btn.className='lc-theme-choice lc-workspace-choice';
          btn.title=label+' workspace';
          btn.setAttribute('aria-label',label+' workspace');
          btn.innerHTML=toolbarIcon(path)+'<span>'+label+'</span>';
          btn.onclick=e=>{e.preventDefault();e.stopPropagation();setCanvasWorkspace(mode);};
          viewWorkspaceButtons.set(mode,btn);
          row.appendChild(btn);
        });
        viewMenuMount.appendChild(row);
      });
      viewWorkspaceSectionIcon=workspaceViewPanel?.parentElement?.querySelector(':scope > .lc-menu-submenu-row .lc-menu-icon')||null;

      const annotationsViewPanel=addViewSubmenu('Annotations',()=>{
      addViewToggle('Manual Dims','showManualDims');
      addViewToggle('Lines','showLines');
      addViewToggle('Notes','showNotes');
      addViewToggle('Radius Labels','showRadiusLabels');
      });
      markWorkspaceCommand(annotationsViewPanel?.parentElement,'design','Annotations');

      addViewSubmenu('Canvas',()=>{
      viewCWInput=addViewNumber('Width',{min:12,step:1,suffix:'in'},value=>{
        const next=Math.max(12,Number(value)||state.cw);
        if(next===state.cw){syncViewMenuUI();return;}
        state.cw=next;
        state.pieces.forEach(p=>{clampToCanvas(p);clampSlabPlacement(p);});
        draw();scheduleSave();pushHistory();syncToolbarFromLayout?.();
      });
      viewCHInput=addViewNumber('Height',{min:12,step:1,suffix:'in'},value=>{
        const next=Math.max(12,Number(value)||state.ch);
        if(next===state.ch){syncViewMenuUI();return;}
        state.ch=next;
        state.pieces.forEach(p=>{clampToCanvas(p);clampSlabPlacement(p);});
        draw();scheduleSave();pushHistory();syncToolbarFromLayout?.();
      });
      viewGridInput=addViewNumber('Grid Size',{min:0.25,step:0.25,suffix:'in'},value=>{
        const next=Math.max(0.25,Number(value)||state.grid);
        if(next===state.grid){syncViewMenuUI();return;}
        state.grid=next;
        draw();scheduleSave();pushHistory();syncToolbarFromLayout?.();
      });
      viewZoomInput=addViewNumber('Zoom',{min:zoomMin,max:zoomMax,step:zoomStep,suffix:'px/in'},value=>{
        const next=clamp(Number(value)||state.scale,zoomMin,zoomMax);
        setCanvasZoom(next);
      });
      addViewToggle('Grid','showGrid');
      });

      addViewSubmenu('Theme',()=>{
        const row=document.createElement('div');
        row.className='lc-theme-choice-row';

        const choices=[
          ['light','Light','M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Zm0-2v2M12 21v2M1 12h2M21 12h2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M19.8 4.2l-1.4 1.4M5.6 18.4l-1.4 1.4'],
          ['dark','Dark','M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5A9 9 0 1 0 20.5 14.3Z'],
          ['system','System','M4 5h16v12H4zM8 21h8M12 17v4']
        ];

        choices.forEach(([mode,label,path])=>{
          const btn=document.createElement('button');
          btn.type='button';
          btn.className='lc-theme-choice';
          btn.title=label+' theme';
          btn.setAttribute('aria-label',label+' theme');
          btn.innerHTML=toolbarIcon(path)+'<span>'+label+'</span>';
          btn.onclick=e=>{
            e.preventDefault();
            e.stopPropagation();
            applyThemePreference(mode);
          };
          viewThemeButtons.set(mode,btn);
          row.appendChild(btn);
        });

        viewMenuMount.appendChild(row);
        applyThemePreference(themeMode,{persist:false});
      });

      addViewSubmenu('Number Format',()=>{
      viewFormatSelect=addViewSelect('Format',[['fraction','Fraction'],['decimal','Decimal']],value=>{
        state.dimFormat=value==='decimal'?'decimal':'fraction';
        draw();scheduleSave?.();pushHistory();syncViewMenuUI();
      });
      viewPrecisionSelect=addViewSelect('Precision',[[1,'1"'],[2,'1/2"'],[4,'1/4"'],[8,'1/8"'],[16,'1/16"']],value=>{
        state.dimPrecision=Number(value)||16;
        draw();scheduleSave?.();pushHistory();syncViewMenuUI();
      });
      });

      // Keep Workspace initialized early, but display it last in VIEW.
      const workspaceViewWrap=workspaceViewPanel?.parentElement||null;
      if(workspaceViewWrap)viewMenu.appendChild(workspaceViewWrap);

      const setCanvasZoom=(value)=>{
        const next=clamp(Number(value)||state.scale,zoomMin,zoomMax);
        if(next===state.scale){
          syncViewMenuUI?.();
          return;
        }
        state.scale=next;
        if(inScale)inScale.value=String(next);
        if(lblScale)lblScale.textContent=String(next);
        draw();
        scheduleSave?.();
        pushHistory();
        syncTopBar?.();
      };

      function syncViewMenuUI(){
        // Keep this independent of the sidebar list controls: VIEW is created
        // earlier in init, while the Notes/Dimensions/Lines controls are wired later.
        viewChecks.forEach((cb,key)=>{cb.checked=!!state[key];});
        if(viewCWInput)viewCWInput.value=String(state.cw);
        if(viewCHInput)viewCHInput.value=String(state.ch);
        if(viewGridInput)viewGridInput.value=String(state.grid);
        if(viewZoomInput)viewZoomInput.value=String(state.scale);
        if(viewFormatSelect)viewFormatSelect.value=state.dimFormat==='decimal'?'decimal':'fraction';
        if(viewPrecisionSelect)viewPrecisionSelect.value=String(state.dimPrecision||16);
        const displayMode=pieceDisplayMode();
        viewPieceDisplayButtons.forEach((btn,key)=>{
          const selected=key===displayMode;
          btn.classList.toggle('is-selected',selected);
          btn.setAttribute('aria-pressed',String(selected));
        });
        const workspaceMode=state.workspace==='slab'?'slab':'layout';
        viewWorkspaceButtons.forEach((btn,key)=>{
          const selected=key===workspaceMode;
          btn.classList.toggle('is-selected',selected);
          btn.setAttribute('aria-pressed',String(selected));
        });
        if(viewWorkspaceSectionIcon){
          viewWorkspaceSectionIcon.innerHTML=toolbarIcon(workspaceViewIconPaths[workspaceMode]);
          viewWorkspaceSectionIcon.title=workspaceMode==='slab'?'Current workspace: SLAB':'Current workspace: DESIGN';
        }
        syncWorkspaceCommandAvailability(document);
        viewThemeButtons.forEach((btn,key)=>{
          const selected=key===themeMode;
          btn.classList.toggle('is-selected',selected);
          btn.setAttribute('aria-pressed',String(selected));
        });
        const activeOverlayLayout=ensureOverlaysOnLayout(activeLayout());
        if(overlayVisibilityViewCheck){
          overlayVisibilityViewCheck.checked=activeOverlayLayout?.showOverlays!==false;
        }
        if(btnZoomOut){
          btnZoomOut.disabled=state.scale<=zoomMin;
          btnZoomOut.title=`Zoom Out (${state.scale} → ${Math.max(zoomMin,state.scale-zoomStep)} px/in)`;
        }
        if(btnZoomIn){
          btnZoomIn.disabled=state.scale>=zoomMax;
          btnZoomIn.title=`Zoom In (${state.scale} → ${Math.min(zoomMax,state.scale+zoomStep)} px/in)`;
        }
      }

      function syncShowNotesUI(){syncViewMenuUI();}
      function syncShowLinesUI(){syncViewMenuUI();}
      function syncLabelDimsUI(){syncViewMenuUI();}
      function syncSinkCenterlinesUI(){syncViewMenuUI();syncSinkCenterlineVisibilityUI();}

      const setViewMenuOpen=(open)=>{
        viewMenu.hidden=!open;
        if(!open)closeViewSubmenus();
        btnView.setAttribute('aria-expanded',String(open));
        btnView.textContent=open?'VIEW ▴':'VIEW ▾';
        if(open)requestAnimationFrame(()=>fitFloatingMenuToViewport(viewMenu,btnView));
      };
      btnView.onclick=e=>{
        e.preventDefault();e.stopPropagation();
        toolbarMenus?.forEach?.(item=>item.setOpen(false));
        setViewMenuOpen(viewMenu.hidden);
      };
      viewMenu.addEventListener('click',e=>e.stopPropagation());
      document.addEventListener('pointerdown',e=>{
        if(!viewHost.contains(e.target))setViewMenuOpen(false);
      });
      document.addEventListener('keydown',e=>{
        if(e.key==='Escape'&&!viewMenu.hidden){
          setViewMenuOpen(false);
          e.preventDefault();
          e.stopPropagation();
        }
      });

      viewHost.append(btnView,viewMenu);
      if(showNotesHost)showNotesHost.appendChild(viewHost);

      const zoomHost=document.createElement('div');
      zoomHost.className='lc-ctl lc-toolbar-zoom';
      zoomHost.style.display='flex';
      zoomHost.style.flexDirection='row';
      zoomHost.style.alignItems='center';
      zoomHost.style.gap='2px';

      const zoomIcon=(sign)=>`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M15.2 15.2 21 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="${sign==='plus'?'M7.5 10.5h6M10.5 7.5v6':'M7.5 10.5h6'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`;

      btnZoomOut=document.createElement('button');
      btnZoomOut.type='button';
      btnZoomOut.className='lc-btn ghost lc-iconbtn lc-toolbar-icon';
      btnZoomOut.innerHTML=zoomIcon('minus');
      btnZoomOut.setAttribute('aria-label','Zoom Out');
      btnZoomOut.onclick=()=>setCanvasZoom(state.scale-zoomStep);

      btnZoomIn=document.createElement('button');
      btnZoomIn.type='button';
      btnZoomIn.className='lc-btn ghost lc-iconbtn lc-toolbar-icon';
      btnZoomIn.innerHTML=zoomIcon('plus');
      btnZoomIn.setAttribute('aria-label','Zoom In');
      btnZoomIn.onclick=()=>setCanvasZoom(state.scale+zoomStep);

      zoomHost.append(btnZoomOut,btnZoomIn);
      if(primaryToolHost)primaryToolHost.appendChild(zoomHost);
      else if(showNotesHost)showNotesHost.appendChild(zoomHost);

      const toolbarMenus=[];
      const makeToolbarDropdown=(label)=>{
        const host=document.createElement('div');
        host.className='lc-ctl';
        host.style.position='relative';
        host.style.zIndex='29';

        const button=document.createElement('button');
        button.type='button';
        button.className='lc-btn ghost big';
        button.textContent=label+' ▾';
        button.setAttribute('aria-haspopup','menu');
        button.setAttribute('aria-expanded','false');

        const menu=document.createElement('div');
        menu.className='lc-toolbar-menu';
        menu.hidden=true;
        menu.setAttribute('role','menu');
        Object.assign(menu.style,{
          position:'absolute',
          top:'calc(100% + 6px)',
          right:'0',
          width:'220px',
          maxWidth:'min(220px, 88vw)',
          padding:'8px',
          border:'1px solid #d1d5db',
          borderRadius:'8px',
          background:'#fff',
          boxShadow:'0 10px 28px rgba(0,0,0,.14)',
          textAlign:'left'
        });

        const setOpen=open=>{
          if(open)setViewMenuOpen(false);
          toolbarMenus.forEach(item=>{
            if(item.menu!==menu){
              item.menu.hidden=true;
              item.button.setAttribute('aria-expanded','false');
              item.button.textContent=item.label+' ▾';
            }
          });
          if(!open)menu.querySelectorAll('.lc-toolbar-submenu').forEach(panel=>panel.hidden=true);
          menu.hidden=!open;
          button.setAttribute('aria-expanded',String(open));
          button.textContent=label+(open?' ▴':' ▾');
          if(open)requestAnimationFrame(()=>fitFloatingMenuToViewport(menu,button));
        };

        button.onclick=e=>{e.preventDefault();e.stopPropagation();setOpen(menu.hidden);};
        menu.addEventListener('click',e=>e.stopPropagation());
        host.append(button,menu);
        toolbarMenus.push({label,host,button,menu,setOpen});
        return {host,button,menu,setOpen};
      };

      const addToolbarMenuAction=(menu,label,onClick,{icon='',shortcut=''}={})=>{
        const item=document.createElement('button');
        item.type='button';
        item.className='lc-btn ghost lc-menu-command';

        const iconEl=document.createElement('span');
        iconEl.className='lc-menu-icon';
        if(icon)iconEl.innerHTML=toolbarIcon(icon);
        const text=document.createElement('span');
        text.className='lc-menu-label';
        text.textContent=label;
        text.title=label;
        const key=document.createElement('span');
        key.className='lc-menu-shortcut';
        key.textContent=shortcut;
        if(shortcut)item.classList.add('lc-menu-has-shortcut');
        item.append(iconEl,text,key);

        Object.assign(item.style,{
          display:'grid',
          width:'100%',
          padding:'7px',
          border:'0',
          background:'transparent',
          textAlign:'left',
          fontSize:'13px',
          cursor:'pointer'
        });
        item.onmouseenter=()=>{if(!item.disabled)item.style.background='#f3f4f6';};
        item.onmouseleave=()=>item.style.background='transparent';
        item.onclick=()=>{
          if(item.disabled||!workspaceCommandAllowed(item))return;
          onClick();
          toolbarMenus.forEach(entry=>entry.setOpen(false));
        };
        menu.appendChild(item);
        return item;
      };

      const addToolbarMenuSeparator=(menu)=>{
        const sep=document.createElement('div');
        sep.className='lc-menu-separator';
        menu.appendChild(sep);
        return sep;
      };

      const addToolbarSubmenu=(menu,label,{icon=''}={})=>{
        const host=document.createElement('div');
        host.className='lc-menu-submenu-host';

        const row=document.createElement('button');
        row.type='button';
        row.className='lc-btn ghost lc-menu-command lc-menu-submenu-row';

        const iconEl=document.createElement('span');
        iconEl.className='lc-menu-icon';
        if(icon)iconEl.innerHTML=toolbarIcon(icon);

        const text=document.createElement('span');
        text.className='lc-menu-label';
        text.textContent=label;
        text.title=label;

        const arrow=document.createElement('span');
        arrow.className='lc-menu-chevron';
        arrow.textContent='›';

        row.append(iconEl,text,arrow);

        const panel=document.createElement('div');
        panel.className='lc-toolbar-menu lc-toolbar-submenu';
        panel.hidden=true;
        panel.setAttribute('role','menu');

        const open=()=>{
          if(!workspaceCommandAllowed(host))return;
          menu.querySelectorAll(':scope > .lc-menu-submenu-host > .lc-toolbar-submenu').forEach(other=>{
            if(other!==panel)other.hidden=true;
          });
          panel.hidden=false;
          requestAnimationFrame(()=>fitFloatingMenuToViewport(panel,row,{submenu:true}));
        };

        host.addEventListener('pointerenter',open);
        host.addEventListener('pointerleave',()=>{panel.hidden=true;});
        row.addEventListener('click',e=>{
          e.preventDefault();
          e.stopPropagation();
          if(!workspaceCommandAllowed(host))return;
          panel.hidden=!panel.hidden;
          if(!panel.hidden)open();
        });

        host.append(row,panel);
        menu.appendChild(host);
        return panel;
      };

      const dispatchCadKey=(key,opts={})=>{
        window.dispatchEvent(new KeyboardEvent('keydown',{
          key,
          ctrlKey:!!opts.ctrlKey,
          metaKey:!!opts.metaKey,
          shiftKey:!!opts.shiftKey,
          bubbles:true,
          cancelable:true
        }));
      };

      const hasAnyCanvasSelection=()=>{
        const L=ensureOverlaysOnLayout(activeLayout());
        return !!(
          state.selectedDimId ||
          state.selectedLineId ||
          state.selectedNoteId ||
          state.selectedIds?.length ||
          state.selectedId ||
          (L && L.ovSel>=0 && L.ovSel<(L.overlays?.length||0))
        );
      };

      const canDuplicateActive=()=>{
        const L=ensureOverlaysOnLayout(activeLayout());
        const overlaySelected=L && L.ovSel>=0 && L.ovSel<(L.overlays?.length||0);
        if(overlaySelected)return (L.overlays?.length||0)<MAX_SLABS_PER_LAYOUT;
        return hasAnyCanvasSelection();
      };

      const deleteActiveFromMenu=()=>{
        const L=ensureOverlaysOnLayout(activeLayout());
        const overlaySelected=L && L.ovSel>=0 && L.ovSel<(L.overlays?.length||0);
        if(overlaySelected){
          L.overlays.splice(L.ovSel,1);
          if(L.ovSel>=L.overlays.length)L.ovSel=L.overlays.length-1;
          renderOverlayList?.();
          syncOverlayUI?.();
          updateInspector?.();
          draw();
          scheduleSave?.();
          pushHistory();
          syncTopBar?.();
          return;
        }
        dispatchCadKey('Delete');
      };

      const ICON_MENU={
        undo:'M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6',
        redo:'m15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6',
        duplicate:'M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M5 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
        trash:'M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5',
        selectAll:'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8h8v8H8z',
        deselect:'M5 5l14 14M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4',
        piece:'M5 6h14v12H5z',
        quickLayout:'M4 5h16v14H4zM8 9h8M8 13h8M8 17h5',
        galley:'M4 5h16v5H4zM4 14h16v5H4z',
        lKitchen:'M4 5h16v5H9v9H4z',
        uKitchen:'M4 5h5v9h6V5h5v14h-5v-1H9v1H4z',
        island:'M4 7h16v10H4z',
        singleVanity:'M4 7h16v10H4zM10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
        doubleVanity:'M3 7h18v10H3zM6 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M14 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
        note:'M6 5h12v11H9l-3 3z',
        dimension:'M4 12h16M4 9v6M20 9v6',
        line:'M5 19 19 5',
        upload:'M12 16V5M8 9l4-4 4 4M5 19h14',
        library:'M4 5h16v14H4zM7 15l3-3 3 3 2-2 3 3',
        import:'M12 5v11M8 12l4 4 4-4M5 19h14',
        pdf:'M5 3h10l4 4v14H5zM15 3v5h5',
        image:'M4 5h16v14H4zM7 15l3-3 3 3 2-2 3 3',
        code:'M8 8 4 12l4 4M16 8l4 4-4 4',
        share:'M9 12a3 3 0 0 0 3 3h4a3 3 0 0 0 0-6h-2M15 12a3 3 0 0 0-3-3H8a3 3 0 0 0 0 6h2',
        guide:'M7 4h10v16H7zM9 8h6M9 12h6M9 16h4M9 4V2h6v2'
      };

      const editDropdown=makeToolbarDropdown('EDIT');
      const editUndo=addToolbarMenuAction(editDropdown.menu,'Undo',()=>{if(canUndo())undo();},{icon:ICON_MENU.undo,shortcut:'Ctrl+Z'});
      const editRedo=addToolbarMenuAction(editDropdown.menu,'Redo',()=>{if(canRedo())redo();},{icon:ICON_MENU.redo,shortcut:'Ctrl+Y'});
      addToolbarMenuSeparator(editDropdown.menu);
      const editDuplicate=addToolbarMenuAction(editDropdown.menu,'Duplicate',()=>dispatchCadKey('d',{ctrlKey:true}),{icon:ICON_MENU.duplicate,shortcut:'Ctrl+D'});
      const editDelete=addToolbarMenuAction(editDropdown.menu,'Delete',deleteActiveFromMenu,{icon:ICON_MENU.trash,shortcut:'Del'});
      addToolbarMenuSeparator(editDropdown.menu);
      const editSelectAll=addToolbarMenuAction(editDropdown.menu,'Select All Pieces',()=>{
        state.selectedDimId=null;
        state.selectedLineId=null;
        state.selectedNoteId=null;
        clearOverlaySelection();
        setSelection(state.pieces.map(p=>p.id));
        state.lastSelIndex=state.pieces.length-1;
        renderList();renderDimList();renderLineList();renderNoteList();updateInspector();sinksUI?.refresh?.();draw();syncTopBar?.();
      },{icon:ICON_MENU.selectAll,shortcut:'Ctrl+A'});
      const editDeselect=addToolbarMenuAction(editDropdown.menu,'Deselect',()=>{
        clearSelection();
        state.selectedDimId=null;
        state.selectedLineId=null;
        state.selectedNoteId=null;
        renderList();renderDimList();renderLineList();renderNoteList();updateInspector();sinksUI?.refresh?.();draw();syncTopBar?.();
      },{icon:ICON_MENU.deselect,shortcut:'Esc'});
      addToolbarMenuSeparator(editDropdown.menu);
      addToolbarMenuAction(editDropdown.menu,'Snap All Pieces to Grid',()=>{
        state.pieces = state.pieces.map(p=>{
          const rs=realSize(p);
          return {
            ...p,
            x:clamp(snap(p.x,state.grid),0,state.cw-rs.w),
            y:clamp(snap(p.y,state.grid),0,state.ch-rs.h)
          };
        });
        draw();scheduleSave();pushHistory();syncTopBar?.();
      },{icon:'M5 7h14M7 5v14M17 5v14M5 17h14'});

      syncEditMenuState=()=>{
        if(!historyReady)return;
        editUndo.disabled=!canUndo();
        editRedo.disabled=!canRedo();
        editDuplicate.disabled=!canDuplicateActive();
        editDelete.disabled=!hasAnyCanvasSelection();
        editSelectAll.disabled=!state.pieces.length;
        editDeselect.disabled=!hasAnyCanvasSelection();
      };
      const baseEditSetOpen=editDropdown.setOpen;
      editDropdown.setOpen=open=>{if(open)syncEditMenuState();baseEditSetOpen(open);};
      editDropdown.button.onclick=e=>{e.preventDefault();e.stopPropagation();editDropdown.setOpen(editDropdown.menu.hidden);};
      if(viewHost?.parentElement)viewHost.insertAdjacentElement('beforebegin',editDropdown.host);
      else if(showNotesHost)showNotesHost.appendChild(editDropdown.host);

      const QUICK_LAYOUT_PRESETS={
        galley:{
          label:'Galley Kitchen',
          pieces:[
            {name:'Galley Run A',w:96,h:25.5,x:0,y:0},
            {name:'Galley Run B',w:96,h:25.5,x:0,y:67.5}
          ]
        },
        lKitchen:{
          label:'L-Kitchen',
          pieces:[
            {name:'L Main Run',w:96,h:25.5,x:0,y:0},
            {name:'L Return',w:25.5,h:60,x:70.5,y:25.5}
          ]
        },
        uKitchen:{
          label:'U-Kitchen',
          pieces:[
            {name:'U Back Run',w:96,h:25.5,x:0,y:0},
            {name:'U Left Return',w:25.5,h:72,x:0,y:25.5},
            {name:'U Right Return',w:25.5,h:72,x:70.5,y:25.5}
          ]
        },
        island:{
          label:'Kitchen Island',
          pieces:[{name:'Kitchen Island',w:96,h:42,x:0,y:0}]
        },
        singleVanity:{
          label:'Single Vanity',
          pieces:[{
            name:'Single Vanity',w:36,h:22,x:0,y:0,
            sinks:[{centerline:18}]
          }]
        },
        doubleVanity:{
          label:'Double Vanity',
          pieces:[{
            name:'Double Vanity',w:72,h:22,x:0,y:0,
            sinks:[{centerline:54},{centerline:18}]
          }]
        }
      };

      const makeQuickVanitySink=(spec={})=>({
        id:uid(),
        name:String(spec.name||''),
        type:'model',
        modelId:'rect-1813',
        shape:'rect',
        w:18,
        h:13,
        cornerR:.25,
        side:'front',
        centerline:Number(spec.centerline)||18,
        setback:SINK_STANDARD_SETBACK,
        faucets:[4],
        faucetSetback:DEFAULT_FAUCET_SETBACK,
        faucetHoleDiameter:DEFAULT_FAUCET_HOLE_DIAMETER,
        faucetHoleSpacing:DEFAULT_FAUCET_SPACING,
        rotation:0
      });

      const makeQuickLayoutPiece=(spec,layer,x,y)=>({
        id:uid(),
        name:spec.name,
        w:Number(spec.w)||24,
        h:Number(spec.h)||12,
        x,
        y,
        rotation:0,
        slabPlacement:{x:round3(x),y:round3(y),rotation:0},
        color:'#ffffff',
        layer,
        rTL:false,
        rTR:false,
        rBL:false,
        rBR:false,
        cornerRadii:{tl:0,tr:0,br:0,bl:0},
        pieceSeams:[],
        sinks:Array.isArray(spec.sinks)?spec.sinks.map(makeQuickVanitySink):[],
        edgeProfiles:{top:'none',right:'none',bottom:'none',left:'none'}
      });

      const insertQuickLayout=(key)=>{
        const preset=QUICK_LAYOUT_PRESETS[key];
        if(!preset?.pieces?.length)return;

        const minX=Math.min(...preset.pieces.map(p=>Number(p.x)||0));
        const minY=Math.min(...preset.pieces.map(p=>Number(p.y)||0));
        const maxX=Math.max(...preset.pieces.map(p=>(Number(p.x)||0)+(Number(p.w)||0)));
        const maxY=Math.max(...preset.pieces.map(p=>(Number(p.y)||0)+(Number(p.h)||0)));
        const groupW=maxX-minX;
        const groupH=maxY-minY;
        const grid=Math.max(.001,Math.abs(Number(state.grid)||1));
        const splashClearance=DEFAULT_SPLASH_HEIGHT+SPLASH_DRAW_GAP;
        // First slabs naturally start at SLAB_GUTTER (6"). Keep quick layouts
        // another working gutter inside that boundary so a 4" linked splash
        // can be added on any outer edge without moving the layout first.
        const slabAlignedInset=SLAB_GUTTER+Math.max(SLAB_GUTTER,splashClearance);
        const spawnInset=Math.ceil(slabAlignedInset/grid)*grid;
        const safeAxisOrigin=(limit,size)=>{
          const maxWithFarSplash=Math.max(0,limit-size-splashClearance);
          if(maxWithFarSplash>=splashClearance){
            return clamp(spawnInset,splashClearance,maxWithFarSplash);
          }
          return clamp(spawnInset,0,Math.max(0,limit-size));
        };
        const left=safeAxisOrigin(state.cw,groupW);
        const upper=safeAxisOrigin(state.ch,groupH);
        const originX=snap(left-minX,grid);
        const originY=snap(upper-minY,grid);
        let nextLayer=Math.max(-1,...state.pieces.map(p=>Number(p.layer)||0))+1;
        const inserted=[];

        preset.pieces.forEach(spec=>{
          const w=Number(spec.w)||24;
          const h=Number(spec.h)||12;
          const x=clamp(snap(originX+(Number(spec.x)||0),grid),0,Math.max(0,state.cw-w));
          const y=clamp(snap(originY+(Number(spec.y)||0),grid),0,Math.max(0,state.ch-h));
          const piece=makeQuickLayoutPiece(spec,nextLayer++,x,y);
          state.pieces.push(piece);
          inserted.push(piece.id);
        });

        state.selectedDimId=null;
        state.selectedLineId=null;
        state.selectedNoteId=null;
        clearOverlaySelection();
        setSelection(inserted);
        state.lastSelIndex=state.pieces.length-1;
        renderList();
        renderDimList();
        renderLineList();
        renderNoteList();
        updateInspector();
        sinksUI?.refresh?.();
        draw();
        scheduleSave();
        pushHistory();
        syncTopBar?.();
      };

      const insertDropdown=makeToolbarDropdown('INSERT');
      insertDropdown.button.id='lc-insert-menu-btn';
      addToolbarMenuAction(insertDropdown.menu,'Piece',()=>document.getElementById('lc-add')?.click(),{icon:ICON_MENU.piece,shortcut:'P'});

      const quickLayoutsMenu=addToolbarSubmenu(insertDropdown.menu,'Quick Layouts',{icon:ICON_MENU.quickLayout});
      quickLayoutsMenu.classList.add('lc-quick-layout-menu');
      addToolbarMenuAction(quickLayoutsMenu,'Galley Kitchen',()=>insertQuickLayout('galley'),{icon:ICON_MENU.galley});
      addToolbarMenuAction(quickLayoutsMenu,'L-Kitchen',()=>insertQuickLayout('lKitchen'),{icon:ICON_MENU.lKitchen});
      addToolbarMenuAction(quickLayoutsMenu,'U-Kitchen',()=>insertQuickLayout('uKitchen'),{icon:ICON_MENU.uKitchen});
      addToolbarMenuAction(quickLayoutsMenu,'Kitchen Island',()=>insertQuickLayout('island'),{icon:ICON_MENU.island});
      addToolbarMenuSeparator(quickLayoutsMenu);
      addToolbarMenuAction(quickLayoutsMenu,'Single Vanity',()=>insertQuickLayout('singleVanity'),{icon:ICON_MENU.singleVanity});
      addToolbarMenuAction(quickLayoutsMenu,'Double Vanity',()=>insertQuickLayout('doubleVanity'),{icon:ICON_MENU.doubleVanity});
      markWorkspaceCommand(quickLayoutsMenu.parentElement,'design','Quick Layouts');

      addToolbarMenuSeparator(insertDropdown.menu);
      const insertNoteAction=addToolbarMenuAction(insertDropdown.menu,'Note',()=>activateNoteTool(),{icon:ICON_MENU.note,shortcut:'N'});
      const insertDimAction=addToolbarMenuAction(insertDropdown.menu,'Dimension',()=>activateDimTool(),{icon:ICON_MENU.dimension,shortcut:'D'});
      const insertLineAction=addToolbarMenuAction(insertDropdown.menu,'Line',()=>activateLineTool(),{icon:ICON_MENU.line,shortcut:'L'});
      [insertNoteAction,insertDimAction,insertLineAction].forEach(item=>markWorkspaceCommand(item,'design',item.querySelector('.lc-menu-label')?.textContent||''));

      addToolbarMenuSeparator(insertDropdown.menu);
      const insertUploadSlab=addToolbarMenuAction(insertDropdown.menu,'Add Slab Image',()=>document.getElementById('ov-add-photo')?.click(),{icon:ICON_MENU.upload});
      const insertLibrarySlab=addToolbarMenuAction(insertDropdown.menu,'Choose Slab From Library',()=>document.getElementById('ov-lib-photo')?.click(),{icon:ICON_MENU.library});
      [insertUploadSlab,insertLibrarySlab].forEach(item=>markWorkspaceCommand(item,'slab',item.querySelector('.lc-menu-label')?.textContent||''));
      if(showNotesHost)showNotesHost.appendChild(insertDropdown.host);

      const importDropdown=makeToolbarDropdown('IMPORT');
      addToolbarMenuAction(importDropdown.menu,'Import Project JSON',()=>btnImport?.click(),{icon:ICON_MENU.import});
      if(showNotesHost)showNotesHost.appendChild(importDropdown.host);

      const exportDropdown=makeToolbarDropdown('EXPORT');
      exportDropdown.button.id='lc-export-menu-btn';
      addToolbarMenuAction(exportDropdown.menu,'PDF - Current Layout',()=>btnExportPDF?.click(),{icon:ICON_MENU.pdf});
      addToolbarMenuAction(exportDropdown.menu,'PDF - All Layouts',()=>btnExportPDFAll?.click(),{icon:ICON_MENU.pdf});
      addToolbarMenuSeparator(exportDropdown.menu);
      addToolbarMenuAction(exportDropdown.menu,'Project JSON',()=>btnExportJSON?.click(),{icon:ICON_MENU.code});
      addToolbarMenuAction(exportDropdown.menu,'PNG',()=>btnExportPNG?.click(),{icon:ICON_MENU.image});
      addToolbarMenuAction(exportDropdown.menu,'SVG',()=>btnExportSVG?.click(),{icon:ICON_MENU.code});
      addToolbarMenuSeparator(exportDropdown.menu);
      addToolbarMenuAction(exportDropdown.menu,'Copy Share Link',()=>window.shareShort?.(),{icon:ICON_MENU.share});
      if(showNotesHost)showNotesHost.appendChild(exportDropdown.host);

      const helpDropdown=makeToolbarDropdown('HELP');
      helpDropdown.button.id='lc-help-menu-btn';
      const startGuideMenuItem=addToolbarMenuAction(helpDropdown.menu,'Start Guided Workflow',()=>startGuidedWorkflow(),{icon:ICON_MENU.guide});
      startGuideMenuItem.id='lc-start-guide-menu-item';
      if(showNotesHost)showNotesHost.appendChild(helpDropdown.host);

      const btnResetTop=document.createElement('button');
      btnResetTop.type='button';
      btnResetTop.className='lc-btn red lc-iconbtn lc-toolbar-icon lc-reset-top';
      btnResetTop.innerHTML=toolbarIcon('M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7');
      btnResetTop.title='Reset Project';
      btnResetTop.setAttribute('aria-label','Reset Project');
      btnResetTop.onclick=()=>btnReset?.click();
      const resetHost=document.createElement('div');
      resetHost.className='lc-ctl';
      resetHost.appendChild(btnResetTop);
      if(showNotesHost)showNotesHost.appendChild(resetHost);

      // ===== Guided Workflow =====================================================
      const GUIDE_SEEN_KEY='litecad:guided-workflow-seen-v1';
      let guideState=null;
      let guidePanel=null;
      let guideHighlights=[];
      let guideNextHighlights=[];
      let guideAdvanceTimer=null;
      let guideAutoFinishTimer=null;

      const guideFindByText=(selector,text)=>{
        return Array.from(document.querySelectorAll(selector))
          .find(el=>String(el.textContent||'').trim().toLowerCase().includes(String(text).toLowerCase()))||null;
      };

      const guideMetric={
        designPieces:()=>state.pieces.filter(piece=>!isBacksplashPiece(piece)).length,
        designPlacement:()=>state.pieces
          .filter(piece=>!isBacksplashPiece(piece))
          .map(piece=>[
            piece.id,
            String(piece.name||''),
            round3(piece.x),round3(piece.y),
            round3(piece.w),round3(piece.h),
            round3(piece.rotation||0),
            String(piece.color||'')
          ].join(':'))
          .join('|'),
        splashes:()=>state.pieces.filter(isBacksplashPiece).length,
        sinks:()=>state.pieces.reduce((sum,piece)=>sum+(Array.isArray(piece.sinks)?piece.sinks.length:0),0),
        edges:()=>state.pieces.map(piece=>[
          piece.id,
          Object.values(piece.edgeProfiles||{}).join(','),
          Object.values(piece.cornerRadii||{}).map(v=>round3(Number(v)||0)).join(',')
        ].join(':')).join('|'),
        seams:()=>state.pieces.reduce((sum,piece)=>sum+(Array.isArray(piece.pieceSeams)?piece.pieceSeams.length:0),0),
        slabs:()=>overlays().length,
        slabPlacement:()=>state.pieces.map(piece=>{
          const sp=ensureSlabPlacement(piece);
          return [piece.id,round3(sp.x),round3(sp.y),round3(sp.rotation||0)].join(':');
        }).join('|')
      };

      const guidedWorkflowSteps=[
        {
          title:'Create countertop pieces',
          body:'Start in DESIGN. Click the toolbar Add Piece button, press P, or use INSERT → Quick Layouts. This step only advances after a piece is actually added to the canvas.',
          workspace:'layout',
          targets:()=>[
            document.querySelector('.lc-add-piece-top'),
            document.getElementById('lc-insert-menu-btn')
          ],
          capture:guideMetric.designPieces,
          complete:baseline=>guideMetric.designPieces()>baseline
        },
        {
          title:'Set up the piece',
          body:'Use the Inspector to adjust the piece name, width, height, rotation, appearance, and other properties. You can also drag the piece on the DESIGN canvas to position it.',
          workspace:'layout',
          enter:()=>setExclusiveInspectorSection?.('pieceInfo',true),
          targets:()=>[
            inspectorPanel||document.getElementById('lc-inspector')
          ],
          capture:guideMetric.designPlacement,
          complete:baseline=>guideMetric.designPlacement()!==baseline
        },
        {
          title:'Add splashes',
          body:'Select a countertop piece and use + Add Splash in PIECE INFO, then click every edge that needs a splash. Add as many as you need. When you are finished, open EDGES & CORNERS to continue.',
          workspace:'layout',
          enter:()=>setExclusiveInspectorSection?.('pieceInfo',true),
          targets:()=>[
            document.querySelector('.lc-add-splash-action')||guideFindByText('#lc-inspector .lc-subcard','Piece Info')
          ],
          nextTarget:()=>guideInspectorHeader('edgeOptions'),
          complete:()=>!!inspectorSectionOpen.edgeOptions
        },
        {
          title:'Set edge profiles and corners',
          body:'Assign the profile to each physical side and enter any corner radii. When you are finished, open SINKS to continue.',
          workspace:'layout',
          enter:()=>setExclusiveInspectorSection?.('edgeOptions',true),
          targets:()=>[
            guideFindByText('#lc-inspector .lc-subcard','Edges & Corners')||document.getElementById('lc-inspector')
          ],
          nextTarget:()=>guideInspectorHeader('sinks'),
          complete:()=>!!inspectorSectionOpen.sinks
        },
        {
          title:'Add sinks and faucets',
          body:'Add and edit every sink you need. Set the model, centerline, setback, and faucet holes without the guide interrupting your work. When you are finished, open SEAMS to continue.',
          workspace:'layout',
          enter:()=>setExclusiveInspectorSection?.('sinks',true),
          targets:()=>[
            document.querySelector('.lc-sinks-section')||document.getElementById('lc-inspector')
          ],
          nextTarget:()=>guideInspectorHeader('seams'),
          complete:()=>!!inspectorSectionOpen.seams
        },
        {
          title:'Plan seams',
          body:'Add any fabrication seam references needed for the job. When you are finished, click Next.',
          workspace:'layout',
          enter:()=>setExclusiveInspectorSection?.('seams',true),
          targets:()=>[
            guideFindByText('#lc-inspector .lc-subcard','Seams')||document.getElementById('lc-inspector')
          ],
          nextTarget:()=>guidePanel?.querySelector('[data-guide-next]')||null
        },
        {
          title:'Open the SLAB canvas',
          body:'CAD Lite has two coordinated canvases: DESIGN keeps the installed layout; SLAB stores fabrication placement. Click the SLAB tab to continue.',
          targets:()=>[],
          nextTarget:()=>slabWorkspaceTab||document.querySelectorAll('.lc-canvas-tab')[1]||null,
          capture:()=>state.workspace,
          complete:()=>state.workspace==='slab'
        },
        {
          title:'Add a slab',
          body:'In SLAB, expand SLABS and choose + Add Slab. Upload or choose an image, crop it, then enter the real slab width and height.',
          workspace:'slab',
          target:()=>document.getElementById('lc-overlays-title')?.closest('.lc-left-section')||document.querySelector('.lc-overlays-card'),
          capture:guideMetric.slabs,
          complete:baseline=>guideMetric.slabs()>baseline
        },
        {
          title:'Arrange fabrication placement',
          body:'Move and rotate the countertop pieces over the slab images if needed. These coordinates are independent from DESIGN. When the fabrication placement looks right, click DESIGN to continue.',
          workspace:'slab',
          target:()=>document.getElementById('lc-svg'),
          nextTarget:()=>layoutWorkspaceTab||document.querySelector('.lc-canvas-tab'),
          complete:()=>state.workspace!=='slab'
        },
        {
          title:'Review the slab appearance',
          body:'Use the Pieces display control—or VIEW → Pieces—to choose Slab and review the installed tops with their mapped material.',
          workspace:'layout',
          targets:()=>[],
          nextTarget:()=>document.querySelector('.lc-piece-fill-toggle')||document.getElementById('lc-view-menu-btn'),
          capture:()=>pieceDisplayMode(),
          complete:baseline=>baseline!=='slab'&&pieceDisplayMode()==='slab'
        },
        {
          title:'Review and export',
          body:'Review DESIGN one last time. EXPORT can create PDFs, PNG, SVG, project JSON, or a share link. This guide will finish automatically in about 10 seconds.',
          workspace:'layout',
          target:()=>document.getElementById('lc-export-menu-btn')
        }
      ];

      function clearGuideHighlight(){
        guideHighlights.forEach(el=>el?.classList?.remove('lc-guide-highlight'));
        guideNextHighlights.forEach(el=>el?.classList?.remove('lc-guide-next-highlight'));
        guideHighlights=[];
        guideNextHighlights=[];
      }

      function resolveGuideTargets(step){
        const raw=step?.targets?.() ?? step?.target?.();
        const list=Array.isArray(raw)?raw:[raw];
        return list.filter(el=>el instanceof Element);
      }

      function resolveGuideNextTargets(step){
        const raw=step?.nextTargets?.() ?? step?.nextTarget?.();
        const list=Array.isArray(raw)?raw:[raw];
        return list.filter(el=>el instanceof Element);
      }

      const guideInspectorHeader=key=>
        document.querySelector('#lc-inspector [data-inspector-key="'+key+'"] > .lc-inspector-section-toggle');

      function ensureGuidePanel(){
        if(guidePanel)return guidePanel;
        const root=document.querySelector('.lc-canvas-col')||document.querySelector('.lite-cad')||document.body;
        const panel=document.createElement('div');
        panel.className='lc-guide-panel';
        panel.hidden=true;
        panel.innerHTML=`
          <div class="lc-guide-kicker"></div>
          <div class="lc-guide-title"></div>
          <div class="lc-guide-body"></div>
          <div class="lc-guide-actions">
            <button type="button" class="lc-btn ghost sm" data-guide-exit>Exit</button>
            <span class="lc-guide-spacer"></span>
            <button type="button" class="lc-btn ghost sm" data-guide-back>Back</button>
            <button type="button" class="lc-btn alt sm" data-guide-next>Next</button>
          </div>`;
        root.appendChild(panel);
        panel.querySelector('[data-guide-exit]').onclick=()=>stopGuidedWorkflow(true);
        panel.querySelector('[data-guide-back]').onclick=()=>{
          if(!guideState)return;
          guideState.index=Math.max(0,guideState.index-1);
          renderGuidedWorkflowStep();
        };
        panel.querySelector('[data-guide-next]').onclick=()=>{
          if(!guideState)return;
          if(guideState.index>=guidedWorkflowSteps.length-1){
            stopGuidedWorkflow(true);
            return;
          }
          guideState.index++;
          renderGuidedWorkflowStep();
        };
        guidePanel=panel;
        return panel;
      }

      function renderGuidedWorkflowStep(){
        if(!guideState)return;
        clearTimeout(guideAutoFinishTimer);
        guideState.rendering=true;
        cancelPlacementTools?.({redraw:false});

        const panel=ensureGuidePanel();
        clearGuideHighlight();
        const step=guidedWorkflowSteps[guideState.index];
        if(!step){guideState.rendering=false;return;}

        if(step.workspace==='slab')setCanvasWorkspace('slab');
        else if(step.workspace==='layout')setCanvasWorkspace('layout');
        step.enter?.();

        guideState.baseline=step.capture?.();

        panel.querySelector('.lc-guide-kicker').textContent=`Guided Workflow · Step ${guideState.index+1} of ${guidedWorkflowSteps.length}`;
        panel.querySelector('.lc-guide-title').textContent=step.title;
        panel.querySelector('.lc-guide-body').textContent=step.body;
        panel.querySelector('[data-guide-back]').disabled=guideState.index===0;
        panel.querySelector('[data-guide-next]').textContent=guideState.index===guidedWorkflowSteps.length-1?'Finish':'Next';
        panel.hidden=false;

        requestAnimationFrame(()=>{
          guideHighlights=resolveGuideTargets(step);
          guideNextHighlights=resolveGuideNextTargets(step);
          guideHighlights.forEach(target=>target.classList.add('lc-guide-highlight'));
          guideNextHighlights.forEach(target=>target.classList.add('lc-guide-next-highlight'));

          const first=guideHighlights[0]||guideNextHighlights[0];
          if(first&&first.id!=='lc-svg'){
            try{first.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});}catch(_){}
          }
        });

        if(guideState.index===guidedWorkflowSteps.length-1){
          const finalIndex=guideState.index;
          guideAutoFinishTimer=setTimeout(()=>{
            if(guideState&&guideState.index===finalIndex){
              stopGuidedWorkflow(true);
            }
          },10000);
        }
        guideState.rendering=false;
      }

      function maybeAdvanceGuidedWorkflow(){
        if(!guideState||guideState.rendering||guideState.advancing)return;
        const index=guideState.index;
        const step=guidedWorkflowSteps[index];
        if(!step?.complete)return;
        let complete=false;
        try{complete=!!step.complete(guideState.baseline);}catch(_){complete=false;}
        if(!complete)return;

        guideState.advancing=true;
        clearTimeout(guideAdvanceTimer);
        guideAdvanceTimer=setTimeout(()=>{
          if(!guideState||guideState.index!==index)return;
          guideState.advancing=false;
          if(index>=guidedWorkflowSteps.length-1){
            stopGuidedWorkflow(true);
            return;
          }
          guideState.index++;
          renderGuidedWorkflowStep();
        },180);
      }

      function startGuidedWorkflow(){
        cancelPlacementTools?.({redraw:false});
        guideState={index:0,baseline:null,rendering:false,advancing:false};
        try{localStorage.setItem(GUIDE_SEEN_KEY,'1');}catch(_){}
        renderGuidedWorkflowStep();
      }

      function stopGuidedWorkflow(markSeen=false){
        clearTimeout(guideAdvanceTimer);
        clearTimeout(guideAutoFinishTimer);
        clearGuideHighlight();
        if(guidePanel)guidePanel.hidden=true;
        guideState=null;
        if(markSeen){
          try{localStorage.setItem(GUIDE_SEEN_KEY,'1');}catch(_){}
        }
      }

      function showFirstTimeGuidePrompt(){
        let seen=false;
        try{seen=localStorage.getItem(GUIDE_SEEN_KEY)==='1';}catch(_){}
        if(seen)return;

        const root=document.querySelector('.lc-canvas-col')||document.querySelector('.lite-cad')||document.body;
        const prompt=document.createElement('div');
        prompt.className='lc-guide-welcome';
        prompt.innerHTML=`
          <strong>New to CAD Lite?</strong>
          <span>Follow a guided workflow through DESIGN, sinks and edges, then SLAB placement and final review.</span>
          <div>
            <button type="button" class="lc-btn ghost sm" data-guide-not-now>Not Now</button>
            <button type="button" class="lc-btn alt sm" data-guide-start>Start Guide</button>
          </div>`;
        root.appendChild(prompt);

        const dismiss=()=>{
          try{localStorage.setItem(GUIDE_SEEN_KEY,'1');}catch(_){}
          prompt.remove();
        };
        prompt.querySelector('[data-guide-not-now]').onclick=dismiss;
        prompt.querySelector('[data-guide-start]').onclick=()=>{
          prompt.remove();
          startGuidedWorkflow();
        };
      }

      // Wait until the rails/Inspector finish their dynamic setup.
      setTimeout(showFirstTimeGuidePrompt,700);

      document.addEventListener('pointerdown',e=>{
        // Only dismiss toolbar dropdowns when the pointer is outside ALL of them.
        // Previously each non-target dropdown closed every menu during pointerdown,
        // which removed the clicked menu item before its click handler could fire.
        const insideToolbarMenu=toolbarMenus.some(item=>item.host.contains(e.target));
        if(!insideToolbarMenu){
          toolbarMenus.forEach(item=>item.setOpen(false));
        }
      });

      // Remove the old visibility/display controls from the top toolbar.
      // Their state continues to be managed by VIEW and the list-header eye buttons.
      const hideToolbarControl=(el)=>{
        if(!el)return;
        const ctl=el.closest?.('.lc-ctl');
        if(ctl)ctl.style.display='none';
        else el.style.display='none';
      };
      [togGrid,togDims,togManualDims,togLabels,document.getElementById('lc-toggle-edges'),btnSnapAll,inCW,inCH,inGrid,inScale].forEach(hideToolbarControl);
      const oldCanvasSettingsGrid=inCW?.closest('.lc-2x2');
      if(oldCanvasSettingsGrid)oldCanvasSettingsGrid.style.display='none';
      hideToolbarControl(btnReset);
      const oldClipTop=document.getElementById('btn-clip-top');
      hideToolbarControl(oldClipTop);
      if(toggleSpacer)toggleSpacer.style.display='none';

      syncViewMenuUI();

      const btnPieceSnap = document.createElement('button');
      btnPieceSnap.className = 'lc-btn ghost lc-iconbtn lc-toolbar-icon';
      btnPieceSnap.type = 'button';
      btnPieceSnap.id = 'lc-piece-snap';
      btnPieceSnap.innerHTML=toolbarIcon('M5 3v8a7 7 0 0 0 14 0V3h-4v8a3 3 0 0 1-6 0V3H5z');
      if(primaryToolHost)primaryToolHost.appendChild(btnPieceSnap);
      function syncPieceSnapUI(){
        btnPieceSnap.title=state.pieceSnap?'Piece Snap: On — click to disable':'Piece Snap: Off — click to enable';
        btnPieceSnap.setAttribute('aria-label',btnPieceSnap.title);
        btnPieceSnap.classList.add('ghost');
        btnPieceSnap.classList.toggle('alt',!!state.pieceSnap);
        btnPieceSnap.setAttribute('aria-pressed',String(!!state.pieceSnap));
      }
      btnPieceSnap.onclick = ()=>{ state.pieceSnap=!state.pieceSnap; syncPieceSnapUI(); scheduleSave?.(); };
      syncPieceSnapUI();

      const btnAddPieceTop=document.createElement('button');
      btnAddPieceTop.type='button';
      btnAddPieceTop.className='lc-btn ghost lc-iconbtn lc-toolbar-icon lc-add-piece-top';
      btnAddPieceTop.innerHTML=toolbarIcon('M4 4h16v16H4zM12 8v8M8 12h8');
      btnAddPieceTop.title='Add Piece';
      btnAddPieceTop.setAttribute('aria-label','Add Piece');
      btnAddPieceTop.onclick=()=>document.getElementById('lc-add')?.click();
      if(primaryToolHost)primaryToolHost.appendChild(btnAddPieceTop);

      const cadRoot=document.querySelector('.lite-cad');
      let theaterMode=false;

      function setTheaterMode(enabled){
        theaterMode=!!enabled;
        if(theaterMode)setHeaderOffsetVar?.();
        cadRoot?.classList.toggle('lc-theater-mode',theaterMode);
        document.documentElement.classList.toggle('lc-theater-page-lock',theaterMode);
        document.body?.classList.toggle('lc-theater-page-lock',theaterMode);
        syncFocusModeUI?.();
      }

      const btnTheater=document.createElement('button');
      btnTheater.type='button';
      btnTheater.className='lc-btn ghost lc-iconbtn lc-toolbar-icon';
      btnTheater.id='lc-theater-mode';
      btnTheater.innerHTML=toolbarIcon('M3 5h18v14H3zM7 5v14M17 5v14');
      btnTheater.onclick=async()=>{
        const entering=!theaterMode;
        if(!entering){
          setTheaterMode(false);
          return;
        }
        // Focus modes are mutually exclusive: switch out of native fullscreen first.
        if(document.fullscreenElement){
          try{
            await document.exitFullscreen();
          }catch(err){
            console.warn('Could not exit Fullscreen before entering Theater Mode',err);
            return;
          }
          if(document.fullscreenElement)return;
        }
        setTheaterMode(true);
      };

      const btnFullscreen=document.createElement('button');
      btnFullscreen.type='button';
      btnFullscreen.className='lc-btn ghost lc-iconbtn lc-toolbar-icon';
      btnFullscreen.id='lc-fullscreen-mode';
      btnFullscreen.innerHTML=toolbarIcon('M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5');
      btnFullscreen.onclick=async()=>{
        if(document.fullscreenElement){
          try{
            await document.exitFullscreen();
          }catch(err){
            console.warn('Could not exit Fullscreen',err);
          }
          return;
        }

        const restoreTheater=theaterMode;
        if(theaterMode)setTheaterMode(false);

        try{
          if(cadRoot?.requestFullscreen){
            await cadRoot.requestFullscreen();
          }else{
            throw new Error('Fullscreen API unavailable');
          }
        }catch(err){
          // If native fullscreen is unavailable, return the user to the mode they had.
          if(restoreTheater)setTheaterMode(true);
          console.warn('Fullscreen unavailable',err);
          alert('Fullscreen is not available in this browser or page context. Theater Mode will still work.');
        }
      };

      function syncFocusModeUI(){
        const fs=!!document.fullscreenElement;
        btnTheater.title=theaterMode?'Exit Theater Mode':'Theater Mode';
        btnTheater.setAttribute('aria-label',btnTheater.title);
        btnTheater.setAttribute('aria-pressed',String(theaterMode));
        btnTheater.classList.toggle('alt',theaterMode);
        btnFullscreen.title=fs?'Exit Fullscreen':'Fullscreen';
        btnFullscreen.setAttribute('aria-label',btnFullscreen.title);
        btnFullscreen.setAttribute('aria-pressed',String(fs));
        btnFullscreen.classList.toggle('alt',fs);
      }

      let fullscreenWasActive=!!document.fullscreenElement;
      document.addEventListener('fullscreenchange',()=>{
        // Safety net for browser-driven fullscreen changes: the two focus modes
        // should never coexist, even if fullscreen was entered outside our button.
        const isFullscreen=!!document.fullscreenElement;
        if(isFullscreen&&theaterMode){
          setTheaterMode(false);
          fullscreenWasActive=true;
          return;
        }

        // Browsers reserve Escape for leaving native fullscreen and may consume
        // the key before CAD Lite sees it. If fullscreen just closed, also exit
        // any canvas placement mode so Splash/Overlay/etc. cannot remain active.
        if(fullscreenWasActive&&!isFullscreen&&activeMomentaryTool?.()){
          cancelPlacementTools({redraw:true});
        }
        fullscreenWasActive=isFullscreen;
        syncFocusModeUI();
      });
      syncFocusModeUI();
      if(primaryToolHost)primaryToolHost.append(btnTheater,btnFullscreen);

      // Accordion toggle for Slab Overlay
      const accBtn  = document.getElementById('ov-acc-toggle');
      const accBody = document.getElementById('ov-acc-body');

      function setOverlayAccordion(open){
        if (!accBtn || !accBody) return;
        accBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        accBtn.classList.toggle('open', !!open);
        accBody.hidden = !open;
        if(open)accBody.style.removeProperty('display');
        else accBody.style.setProperty('display','none','important');
      }

      // start closed by default
      setOverlayAccordion(false);

      // optional: auto-open if overlay is already visible or has an image
      if (state?.overlay && (state.overlay.visible || state.overlay.dataURL)){
        setOverlayAccordion(true);
      }

      accBtn && (accBtn.onclick = () => {
        setOverlayAccordion(accBody.hidden); // toggle
      });

      // --- Overlay controls (per-selected overlay) ---
      const inOVW   = document.getElementById('ovw');
      const inOVH   = document.getElementById('ovh');
      const inOVX   = document.getElementById('ovx');
      const inOVY   = document.getElementById('ovy');
      const inOVOP  = document.getElementById('ovop');

      const btnOvAdd  = document.getElementById('ov-add-photo');
      const inOvAdd   = document.getElementById('ov-add-input');
      document.getElementById('ov-clip-toggle')?.remove();

      function syncOverlayAddButton(){
        const L = ensureOverlaysOnLayout(activeLayout());
        const atLimit=(L?.overlays?.length||0)>=MAX_SLABS_PER_LAYOUT;
        if(btnOvAdd)btnOvAdd.disabled=atLimit;
        const hint=document.getElementById('ov-add-hint');
        if(hint)hint.textContent=atLimit?`Limit ${MAX_SLABS_PER_LAYOUT} slabs per layout reached.`:'';
      }

      function syncOverlayUI(){
        const o = currentOverlay();
        const has = !!o;
        [inOVW,inOVH,inOVX,inOVY,inOVOP].forEach(el=>{ if (el) el.disabled = !has; });

        if (!has){
          if (inOVW) inOVW.value = '';
          if (inOVH) inOVH.value = '';
          if (inOVX) inOVX.value = '';
          if (inOVY) inOVY.value = '';
          if (inOVOP) inOVOP.value = 1;
        } else {
          inOVW && (inOVW.value  = o.slabW ?? 126);
          inOVH && (inOVH.value  = o.slabH ?? 63);
          inOVX && (inOVX.value  = o.x ?? 0);
          inOVY && (inOVY.value  = o.y ?? 0);
          inOVOP&& (inOVOP.value = (o.opacity == null ? 1 : o.opacity));
        }

        syncOverlayAddButton();
      }

      // Add Overlay (single entry point)
      btnOvAdd && (btnOvAdd.onclick = ()=> inOvAdd?.click());
      inOvAdd && (inOvAdd.onchange = e => {
        const f=e.target.files?.[0];
        const L=ensureOverlaysOnLayout(activeLayout());
        if(!L)return;
        if((L.overlays?.length||0)>=MAX_SLABS_PER_LAYOUT){e.target.value='';return;}
        if(f)loadOverlayFromFileToLayout(f);
        e.target.value='';
      });

      // Numeric fields
      inOVW && (inOVW.onchange = e => { const o=currentOverlay(); if(!o) return; o.slabW=Math.max(1,+e.target.value||0); clampOverlayToCanvas(o); draw(); syncOverlayUI?.(); scheduleSave(); pushHistory(); });
      inOVH && (inOVH.onchange = e => { const o=currentOverlay(); if(!o) return; o.slabH=Math.max(1,+e.target.value||0); clampOverlayToCanvas(o); draw(); syncOverlayUI?.(); scheduleSave(); pushHistory(); });
      inOVX && (inOVX.onchange = e => { const o=currentOverlay(); if(!o) return; o.x=+e.target.value||0; clampOverlayToCanvas(o); draw(); syncOverlayUI?.(); scheduleSave(); pushHistory(); });
      inOVY && (inOVY.onchange = e => { const o=currentOverlay(); if(!o) return; o.y=+e.target.value||0; clampOverlayToCanvas(o); draw(); syncOverlayUI?.(); scheduleSave(); pushHistory(); });

      // Opacity slider: live + commit
      inOVOP && (inOVOP.oninput  = e => { const o=currentOverlay(); if(!o) return; o.opacity=Math.max(.1,+e.target.value||.75); draw(); });
      inOVOP && (inOVOP.onchange = ()=> { scheduleSave(); pushHistory(); });

      // ---- LZString (URI-safe subset) ----
      const LZString = (function () {
        const keyStrUriSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
        const baseReverseDic = {};

        function getBaseValue(alphabet, character) {
          if (!baseReverseDic[alphabet]) {
            baseReverseDic[alphabet] = {};
            for (let i = 0; i < alphabet.length; i++) {
              baseReverseDic[alphabet][alphabet.charAt(i)] = i;
            }
          }
          return baseReverseDic[alphabet][character];
        }

        function _compress(uncompressed, bitsPerChar, getCharFromInt) {
          if (uncompressed == null) return "";
          let i, value;
          const context_dictionary = {};
          const context_dictionaryToCreate = {};
          let context_c = "";
          let context_wc = "";
          let context_w = "";
          let context_enlargeIn = 2;
          let context_dictSize = 3;
          let context_numBits = 2;
          const context_data = [];
          let context_data_val = 0;
          let context_data_position = 0;

          for (let ii = 0; ii < uncompressed.length; ii += 1) {
            context_c = uncompressed.charAt(ii);
            if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
              context_dictionary[context_c] = context_dictSize++;
              context_dictionaryToCreate[context_c] = true;
            }
            context_wc = context_w + context_c;
            if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
              context_w = context_wc;
            } else {
              if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                if (context_w.charCodeAt(0) < 256) {
                  for (i = 0; i < context_numBits; i++) {
                    context_data_val = (context_data_val << 1);
                    if (context_data_position === bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                  }
                  value = context_w.charCodeAt(0);
                  for (i = 0; i < 8; i++) {
                    context_data_val = (context_data_val << 1) | (value & 1);
                    if (context_data_position === bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                    value >>= 1;
                  }
                } else {
                  value = 1;
                  for (i = 0; i < context_numBits; i++) {
                    context_data_val = (context_data_val << 1) | value;
                    if (context_data_position === bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                    value = 0;
                  }
                  value = context_w.charCodeAt(0);
                  for (i = 0; i < 16; i++) {
                    context_data_val = (context_data_val << 1) | (value & 1);
                    if (context_data_position === bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                    value >>= 1;
                  }
                }
                context_enlargeIn--;
                if (context_enlargeIn === 0) {
                  context_enlargeIn = Math.pow(2, context_numBits);
                  context_numBits++;
                }
                delete context_dictionaryToCreate[context_w];
              } else {
                value = context_dictionary[context_w];
                for (i = 0; i < context_numBits; i++) {
                  context_data_val = (context_data_val << 1) | (value & 1);
                  if (context_data_position === bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value >>= 1;
                }
              }
              context_enlargeIn--;
              if (context_enlargeIn === 0) {
                context_enlargeIn = Math.pow(2, context_numBits);
                context_numBits++;
              }
              context_dictionary[context_wc] = context_dictSize++;
              context_w = String(context_c);
            }
          }

          if (context_w !== "") {
            if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
              if (context_w.charCodeAt(0) < 256) {
                for (i = 0; i < context_numBits; i++) {
                  context_data_val = (context_data_val << 1);
                  if (context_data_position === bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                }
                value = context_w.charCodeAt(0);
                for (i = 0; i < 8; i++) {
                  context_data_val = (context_data_val << 1) | (value & 1);
                  if (context_data_position === bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value >>= 1;
                }
              } else {
                value = 1;
                for (i = 0; i < context_numBits; i++) {
                  context_data_val = (context_data_val << 1) | value;
                  if (context_data_position === bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = 0;
                }
                value = context_w.charCodeAt(0);
                for (i = 0; i < 16; i++) {
                  context_data_val = (context_data_val << 1) | (value & 1);
                  if (context_data_position === bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value >>= 1;
                }
              }
              context_enlargeIn--;
              if (context_enlargeIn === 0) {
                context_enlargeIn = Math.pow(2, context_numBits);
                context_numBits++;
              }
              delete context_dictionaryToCreate[context_w];
            } else {
              value = context_dictionary[context_w];
              for (i = 0; i < context_numBits; i++) {
                context_data_val = (context_data_val << 1) | (value & 1);
                if (context_data_position === bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value >>= 1;
              }
            }
            context_enlargeIn--;
            if (context_enlargeIn === 0) {
              context_enlargeIn = Math.pow(2, context_numBits);
              context_numBits++;
            }
          }

          value = 2;
          for (i = 0; i < context_numBits; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position === bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value >>= 1;
          }

          while (true) {
            context_data_val = (context_data_val << 1);
            if (context_data_position === bitsPerChar - 1) {
              context_data.push(getCharFromInt(context_data_val));
              break;
            } else {
              context_data_position++;
            }
          }
          return context_data.join("");
        }

        function _decompress(length, resetValue, getNextValue) {
          const dictionary = [];
          let next, enlargeIn = 4, dictSize = 4, numBits = 3, entry = "", result = [];
          let i, w, bits, resb, maxpower, power, c;
          const data = { val: getNextValue(0), position: resetValue, index: 1 };

          for (i = 0; i < 3; i += 1) dictionary[i] = i;

          bits = 0; maxpower = Math.pow(2, 2); power = 1;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }

          switch (next = bits) {
            case 0:
              bits = 0; maxpower = Math.pow(2, 8); power = 1;
              while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
              }
              c = String.fromCharCode(bits);
              break;
            case 1:
              bits = 0; maxpower = Math.pow(2, 16); power = 1;
              while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
              }
              c = String.fromCharCode(bits);
              break;
            case 2:
              return "";
          }

          dictionary[3] = c;
          w = c;
          result.push(c);

          while (true) {
            if (data.index > length) return "";
            bits = 0; maxpower = Math.pow(2, numBits); power = 1;
            while (power !== maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
              bits |= (resb > 0 ? 1 : 0) * power;
              power <<= 1;
            }

            switch (c = bits) {
              case 0:
                bits = 0; maxpower = Math.pow(2, 8); power = 1;
                while (power !== maxpower) {
                  resb = data.val & data.position;
                  data.position >>= 1;
                  if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                  bits |= (resb > 0 ? 1 : 0) * power;
                  power <<= 1;
                }
                dictionary[dictSize++] = String.fromCharCode(bits);
                c = dictSize - 1;
                enlargeIn--;
                break;
              case 1:
                bits = 0; maxpower = Math.pow(2, 16); power = 1;
                while (power !== maxpower) {
                  resb = data.val & data.position;
                  data.position >>= 1;
                  if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                  bits |= (resb > 0 ? 1 : 0) * power;
                  power <<= 1;
                }
                dictionary[dictSize++] = String.fromCharCode(bits);
                c = dictSize - 1;
                enlargeIn--;
                break;
              case 2:
                return result.join("");
            }

            if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }

            if (dictionary[c]) {
              entry = dictionary[c];
            } else {
              if (c === dictSize) {
                entry = w + w.charAt(0);
              } else {
                return null;
              }
            }
            result.push(entry);

            dictionary[dictSize++] = w + entry.charAt(0);
            enlargeIn--;
            w = entry;

            if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
          }
        }

        function compressToEncodedURIComponent(input) {
          if (input == null) return "";
          return _compress(input, 6, function (a) { return keyStrUriSafe.charAt(a); });
        }

        function decompressFromEncodedURIComponent(input) {
          if (input == null || input === "") return "";
          return _decompress(input.length, 32, function (index) {
            return getBaseValue(keyStrUriSafe, input.charAt(index));
          });
        }

        return {
          compressToEncodedURIComponent,
          decompressFromEncodedURIComponent
        };
      })();

        // ---- Undo/Redo History ----
        const HISTORY_MAX = 50;
        const history = { stack: [], index: -1, quiet: false };
        historyReady = true;

        function snapshotState(){
          try{
            saveCurrentWorkspaceViewState();
            return JSON.stringify({
              sinkSideConvention:SINK_SIDE_CONVENTION,
              active: state.active,
              cw: state.cw, ch: state.ch, scale: state.scale, grid: state.grid,
              showGrid: !!state.showGrid, showDims: !!state.showDims, showSplashDims: !!state.showSplashDims, showSinkCenterlines: !!state.showSinkCenterlines, showManualDims: !!state.showManualDims, showEdgeProfiles: !!state.showEdgeProfiles, showPieceFills: !!state.showPieceFills, showSlabMaterial: !!state.showSlabMaterial, workspace: state.workspace==='slab'?'slab':'layout', showNotes: !!state.showNotes, showLines: !!state.showLines, showLabels: !!state.showLabels, showSplashLabels: !!state.showSplashLabels, showSplashLabelDims: !!state.showSplashLabelDims, showLabelDims: !!state.showLabelDims, showRadiusLabels: !!state.showRadiusLabels, workspaceViews: state.workspaceViews, dimPrecision: state.dimPrecision, dimFormat: state.dimFormat,
              overlay: state.overlay ? { ...state.overlay } : null,
              selectedId: state.selectedId ?? null,
              pieces: state.pieces.map(p=>({...p})),
              project: state.project ?? null,
              settings: state.settings ?? null,
              layouts: state.layouts ?? null
            });
          }catch(e){ console.warn('history snapshot failed:', e); return null; }
        }

        // keep the API shape used by shareShort()
        window.getSnapshot = () => snapshotState();


        function pushHistory(){
          // If we came from a short link, detach now that the user has changed something
          detachShareIdFromUrl();
          if (history.quiet) return;
          const snap = snapshotState(); if (!snap) return;
          if (history.stack[history.index] === snap) return; // dedupe
          history.stack = history.stack.slice(0, history.index+1);
          history.stack.push(snap);
          if (history.stack.length > HISTORY_MAX) history.stack.shift();
          history.index = history.stack.length - 1;
          syncHistoryButtons?.();
        }

        function applySnapshot(snap){
          if (!snap) return;
          const data = JSON.parse(snap);
          history.quiet = true;
          try{
            if (Array.isArray(data.layouts)) {
              state.layouts = data.layouts;
              migrateSinkSideConvention(state.layouts,data.sinkSideConvention);
              state.active  = Number.isInteger(data.active) ? data.active : 0;
              // derive top-level canvas from active layout if that’s your model,
              // otherwise keep these explicit fields:
              state.cw = data.cw; state.ch = data.ch; state.scale = data.scale; state.grid = data.grid;
              state.pieces = (data.pieces||[]).map(p=>({...p}));
              migrateSinkSideConvention([{pieces:state.pieces}],data.sinkSideConvention);
            } else {
              // fallback for older payloads
              state.cw = data.cw; state.ch = data.ch; state.scale = data.scale; state.grid = data.grid;
              state.pieces = (data.pieces||[]).map(p=>({...p}));
              migrateSinkSideConvention([{pieces:state.pieces}],data.sinkSideConvention);
            }
            state.showGrid   = 'showGrid'   in data ? !!data.showGrid   : state.showGrid;
            state.showDims   = 'showDims'   in data ? !!data.showDims   : state.showDims;
            state.showSinkCenterlines = 'showSinkCenterlines' in data ? !!data.showSinkCenterlines : state.showDims;
            state.showManualDims = 'showManualDims' in data ? !!data.showManualDims : state.showManualDims;
            state.showEdgeProfiles = 'showEdgeProfiles' in data ? !!data.showEdgeProfiles : state.showEdgeProfiles;
            state.showPieceFills = 'showPieceFills' in data ? !!data.showPieceFills : state.showPieceFills;
            state.showSlabMaterial = 'showSlabMaterial' in data ? !!data.showSlabMaterial : state.showSlabMaterial;
            state.workspace = data.workspace==='slab'?'slab':'layout';
            state.showNotes = 'showNotes' in data ? !!data.showNotes : state.showNotes;
            state.showLines = 'showLines' in data ? !!data.showLines : state.showLines;
            state.showLabels = 'showLabels' in data ? !!data.showLabels : state.showLabels;
            state.showSplashLabels = 'showSplashLabels' in data ? !!data.showSplashLabels : state.showSplashLabels;
            state.showSplashDims = 'showSplashDims' in data ? !!data.showSplashDims : state.showSplashDims;
            state.showSplashLabelDims = 'showSplashLabelDims' in data ? !!data.showSplashLabelDims : state.showSplashLabelDims;
            state.showLabelDims = 'showLabelDims' in data ? !!data.showLabelDims : state.showLabelDims;
            state.showRadiusLabels = 'showRadiusLabels' in data ? !!data.showRadiusLabels : state.showRadiusLabels;
            state.workspaceViews=data.workspaceViews&&typeof data.workspaceViews==='object'?data.workspaceViews:null;
            if(state.workspaceViews)loadWorkspaceViewState(state.workspace);
            else ensureWorkspaceViewStates();
            state.dimPrecision = [1,2,4,8,16].includes(Number(data.dimPrecision)) ? Number(data.dimPrecision) : state.dimPrecision;
            state.dimFormat = data.dimFormat === 'decimal' ? 'decimal' : (data.dimFormat === 'fraction' ? 'fraction' : state.dimFormat);
            state.overlay    = data.overlay ? { ...data.overlay } : state.overlay;
            state.selectedId = data.selectedId ?? null;
            if ('project'  in data) state.project  = data.project;
            if ('settings' in data) state.settings = data.settings;
          } finally { history.quiet = false; }

          renderList();
          renderDimList();
          renderLineList();
          renderNoteList();
          updateInspector(); sinksUI?.refresh?.(); draw();
          renderLayouts?.();
          syncToolbarFromLayout?.();
          syncShowNotesUI?.();
          syncShowLinesUI?.();
          syncTopBar?.();
          renderOverlayList?.();
          syncOverlayUI?.();
          syncClipTop?.(); 
        }

        function undo(){ if (history.index > 0){ history.index--; applySnapshot(history.stack[history.index]); } }
        function redo(){ if (history.index < history.stack.length-1){ history.index++; applySnapshot(history.stack[history.index]); } }
        function canUndo(){ return history.index > 0; }
        function canRedo(){ return history.index < history.stack.length - 1; }


     // ----------------------------------------   
     // ------- Helpers ------------------------
     // ----------------------------------------   

     // ===== General helpers (also used for rounding/inputs) =====
      const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
      const round3 = (n)=>Math.round((Number(n)||0)*1000)/1000;
      const fmt3 = (n)=>{
        const v = round3(n);
        return (Math.abs(v % 1) < 1e-9) ? String(Math.round(v)) : v.toFixed(3).replace(/\.?0+$/,'');
      };

      // Canvas-only architectural display. Stored values and all editors remain decimal.
      // Precision is selectable; 16 means nearest 1/16", 8 = 1/8", etc.
      const fmtCanvasInches = (n)=>{
        const value=Math.abs(Number(n)||0);
        if(state.dimFormat==='decimal') return fmt3(value)+'"';
        const precision=[1,2,4,8,16].includes(Number(state.dimPrecision))?Number(state.dimPrecision):16;
        let whole=Math.floor(value);
        let num=Math.round((value-whole)*precision);
        if(num===precision){whole+=1;num=0;}
        if(num===0)return whole+'"';
        const gcd=(a,b)=>b?gcd(b,a%b):a;
        const g=gcd(num,precision),den=precision/g;
        num/=g;
        return (whole?whole+' ':'')+num+'/'+den+'"';
      };

      // ===== Canvas Toggle Buttons =====
      function setToggle(btn, on, label){
        if (!btn) return;
        btn.classList.toggle('alt',   on);    // ON = filled (selected)
        btn.classList.toggle('ghost', !on);   // OFF = outline
        btn.textContent = (on ? `Hide ${label}` : `Show ${label}`);
      }

      function syncHistoryButtons(){
        if (btnUndoTop) btnUndoTop.disabled = !canUndo();
        if (btnRedoTop) btnRedoTop.disabled = !canRedo();
      }

      function syncTopBar(){
        syncHistoryButtons();
        setToggle(togGrid,       !!state.showGrid,       'Grid');
        setToggle(togDims,       !!state.showDims,       'Piece Dims');
        setToggle(togManualDims, !!state.showManualDims, 'Manual Dims');
        setToggle(togLabels,     !!state.showLabels,     'Labels');
        setToggle(togEdges,     !!state.showEdgeProfiles, 'Edge Profiles');
        syncViewMenuUI?.();
        syncListVisibilityEyes?.();
        syncPieceFillUI?.();
        syncEditMenuState();
        syncCanvasContext?.();
        if (lblScale) lblScale.textContent = String(state.scale);
      }


      // Legacy Clip-to-Pieces toolbar hook: clipping is now permanent.
      const btnClipTop=document.getElementById('btn-clip-top');
      btnClipTop?.remove();

      function syncClipTop(){
        const L=ensureOverlaysOnLayout(activeLayout());
        if(L)L.overlayClip=true;
      }


      // ===== Layering helpers =====

      function normalizeLayers(){
        const byLayer = [...state.pieces].sort((a,b)=>(a.layer||0)-(b.layer||0));
        byLayer.forEach((p,i)=> p.layer = i);
      }
      function bringForward(piece){
        normalizeLayers();
        const byLayer = [...state.pieces].sort((a,b)=>a.layer-b.layer);
        const i = byLayer.indexOf(piece);
        if(i < byLayer.length-1){
          const other = byLayer[i+1];
          const tmp = piece.layer; piece.layer = other.layer; other.layer = tmp;
        }
        normalizeLayers();
      }
      function sendBackward(piece){
        normalizeLayers();
        const byLayer = [...state.pieces].sort((a,b)=>a.layer-b.layer);
        const i = byLayer.indexOf(piece);
        if(i > 0){
          const other = byLayer[i-1];
          const tmp = piece.layer; piece.layer = other.layer; other.layer = tmp;
        }
        normalizeLayers();
      }


      let sinksUI; // Sinks card handle
      let dimDrag = null; // { dimId, x1px, y1px, nx, ny, pointerId }
      let slabDrag = null; // independent fabrication-placement drag state


      // ===== Sinks: config =====
      const SINK_STANDARD_SETBACK = 3.125; // inches
      const MAX_SINKS_PER_PIECE = 4;
      const DEFAULT_FAUCET_HOLE_DIAMETER = 1.5;  // inches
      const DEFAULT_FAUCET_SETBACK = 2.5;        // sink cutout edge -> hole centerline
      const DEFAULT_FAUCET_SPACING = 2;          // adjacent hole center-to-center

      // Example presets (adjust to your catalog)
      const SINK_MODELS = [
        { id:'k3218-single', label:'Kitchen SS 3218', shape:'rect', w:31, h:17, cornerR:4 },
        { id:'oval-1714',    label:'Oval 1714 Vanity',         shape:'oval', w:17, h:14, cornerR:0 },
        { id:'rect-1813',    label:'Rectangle 1813 Vanity',    shape:'rect', w:18, h:13, cornerR:0.25 },
      ];
      
      // Inspector height follows its current content; do not retain old maximum heights.

      const svgNS = 'http://www.w3.org/2000/svg';

      function endPointerDrag(){
        let changed = false;

        // Piece dragging
        if (state.drag) {
          const snappedX = !!state.drag.snappedX;
          const snappedY = !!state.drag.snappedY;
          const movingIds=new Set(state.drag.group.map(gp=>gp.id));
          state.drag.group.forEach(gp => {
            const piece = state.pieces.find(x => x.id === gp.id);
            if (!piece) return;
            if (!snappedX) piece.x = snap(piece.x, state.grid);
            if (!snappedY) piece.y = snap(piece.y, state.grid);
            if(isLinkedSplash(piece)&&!movingIds.has(piece.attachment.parentPieceId)){
              tryResnapSplash(piece,1);
            }
          });
          state.drag = null;
          changed = true;
        }

        // Slab fabrication-placement dragging
        if (slabDrag) {
          const snappedX=!!slabDrag.snappedX;
          const snappedY=!!slabDrag.snappedY;
          slabDrag.group.forEach(gp=>{
            const piece=state.pieces.find(x=>x.id===gp.id);
            if(!piece)return;
            const sp=ensureSlabPlacement(piece);
            if(!snappedX)sp.x=snap(sp.x,state.grid);
            if(!snappedY)sp.y=snap(sp.y,state.grid);
            clampSlabPlacement(piece);
          });
          slabDrag=null;
          changed=true;
        }

        // Dimension offset dragging
        if (dimDrag) {
          if (svg.releasePointerCapture && dimDrag.pointerId != null) {
            try { svg.releasePointerCapture(dimDrag.pointerId); } catch (_) {}
          }
          dimDrag = null;
          changed = true;
        }

        if (changed) {
          draw();
          scheduleSave();
          pushHistory();
        }
      }

      svg.addEventListener('pointerup', endPointerDrag);
      svg.addEventListener('pointerleave', endPointerDrag);



      const appRoot = document.querySelector('.lite-cad') || document.body;
      appRoot.addEventListener('input',  (e)=>{ if(e.target.id==='lc-import') return; scheduleSave(); }, {passive:true});
      appRoot.addEventListener('change', (e)=>{ if(e.target.id==='lc-import') return; scheduleSave(); }, {passive:true});


      const list = document.getElementById('lc-list');
      const dimList=document.getElementById('lc-dim-list');
      let noteList=document.getElementById('lc-note-list');
      if(!noteList&&dimList?.closest('.lc-card')){const card=document.createElement('div');card.className='lc-card';const head=document.createElement('div');head.className='lc-card-head';const h3=document.createElement('h3');h3.textContent='Notes';head.appendChild(h3);noteList=document.createElement('div');noteList.id='lc-note-list';noteList.className='lc-list';card.append(head,noteList);dimList.closest('.lc-card').after(card);}
      let lineList=document.getElementById('lc-line-list');
      if(!lineList&&noteList?.closest('.lc-card')){const card=document.createElement('div');card.className='lc-card';const head=document.createElement('div');head.className='lc-card-head';const h3=document.createElement('h3');h3.textContent='Lines';head.appendChild(h3);lineList=document.createElement('div');lineList.id='lc-line-list';lineList.className='lc-list';card.append(head,lineList);noteList.closest('.lc-card').after(card);}
      const freeLineTitle=lineList?.closest('.lc-card')?.querySelector('.lc-card-head h3');
      if(freeLineTitle)freeLineTitle.textContent='Lines';
      // Sidebar order: Notes, Dimensions, Lines
      const noteCard=noteList?.closest('.lc-card'),dimCard=dimList?.closest('.lc-card'),lineCard=lineList?.closest('.lc-card');
      if(noteCard&&dimCard&&lineCard){dimCard.before(noteCard);dimCard.after(lineCard);}
      const listVisibilityEyes=new Map();
      const eyeIcon=(visible)=>visible
        ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 3l18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.6 3.2M14.1 14.1A3 3 0 0 1 9.9 9.9M6.1 6.1C3.8 7.7 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

      let sinkCenterlineInspectorEye=null;
      function syncSinkCenterlineVisibilityUI(){
        if(!sinkCenterlineInspectorEye)return;
        const visible=!!state.showSinkCenterlines;
        sinkCenterlineInspectorEye.innerHTML=eyeIcon(visible);
        sinkCenterlineInspectorEye.title=visible?'Hide Sink Centerlines':'Show Sink Centerlines';
        sinkCenterlineInspectorEye.setAttribute('aria-label',sinkCenterlineInspectorEye.title);
        sinkCenterlineInspectorEye.setAttribute('aria-pressed',String(visible));
        sinkCenterlineInspectorEye.style.opacity=visible?'1':'.55';
      }

      function syncListVisibilityEyes(){
        listVisibilityEyes.forEach(({btn,key,label,title})=>{
          const visible=!!state[key];
          btn.innerHTML=eyeIcon(visible);
          btn.title=visible?`Hide ${label}`:`Show ${label}`;
          btn.setAttribute('aria-label',btn.title);
          btn.setAttribute('aria-pressed',String(visible));
          btn.style.opacity=visible?'1':'.55';
          if(title)title.style.opacity=visible?'1':'.6';
        });
      }

      function makeListCardToggle(listEl,label,visibilityKey,shortcut,onAdd){
        const card=listEl?.closest('.lc-card'),head=card?.querySelector('.lc-card-head');
        if(!card||!head||head.dataset.toggleReady)return;
        head.dataset.toggleReady='1';
        head.classList.remove('lc-two-row-head');
        head.classList.add('lc-single-row-head');
        head.style.userSelect='none';

        const title=head.querySelector('h3');
        const itemLabel=label==='Dimensions'?'Dimension':label.slice(0,-1);
        if(title)title.dataset.baseLabel=label;

        const titleRow=document.createElement('div');
        titleRow.className='lc-head-title-row';

        const arrow=document.createElement('span');
        arrow.className='lc-head-arrow';
        arrow.textContent='▸';
        arrow.setAttribute('aria-hidden','true');

        const eye=document.createElement('button');
        eye.type='button';
        eye.className='lc-btn ghost lc-iconbtn lc-head-eye';
        eye.onclick=e=>{
          e.preventDefault();e.stopPropagation();
          state[visibilityKey]=!state[visibilityKey];
          syncListVisibilityEyes();
          syncViewMenuUI?.();
          draw();
          scheduleSave?.();
          pushHistory();
          syncTopBar?.();
        };
        listVisibilityEyes.set(listEl,{btn:eye,key:visibilityKey,label,title});

        const inlineActions=document.createElement('div');
        inlineActions.className='lc-head-inline-actions';
        inlineActions.append(eye,arrow);

        if(title)titleRow.append(title);
        titleRow.append(inlineActions);
        head.replaceChildren(titleRow);

        const addRow=document.createElement('div');
        addRow.className='lc-sidebar-add-row';
        const addBtn=document.createElement('button');
        addBtn.type='button';
        addBtn.className='lc-btn ghost lc-sidebar-inline-add';
        addBtn.textContent='+ Add '+itemLabel;
        addBtn.title='Add '+itemLabel+' ('+shortcut+')';
        addBtn.setAttribute('aria-label',addBtn.title);
        addBtn.onclick=e=>{
          e.preventDefault();e.stopPropagation();
          onAdd?.();
        };
        addRow.appendChild(addBtn);
        card.insertBefore(addRow,listEl);

        let open=false;
        const sync=()=>{
          addRow.hidden=!open;
          listEl.hidden=!open;
          if(open){
            addRow.style.removeProperty('display');
            listEl.style.removeProperty('display');
          }else{
            addRow.style.setProperty('display','none','important');
            listEl.style.setProperty('display','none','important');
          }
          arrow.textContent=open?'▾':'▸';
          titleRow.setAttribute('aria-expanded',String(open));
        };
        titleRow.addEventListener('click',()=>{open=!open;sync();});
        titleRow.setAttribute('role','button');
        titleRow.setAttribute('tabindex','0');
        titleRow.addEventListener('keydown',e=>{
          if(e.key==='Enter'||e.key===' '){e.preventDefault();open=!open;sync();}
        });
        sync();
      }
      makeListCardToggle(dimList,'Dimensions','showManualDims','D',activateDimTool);
      makeListCardToggle(noteList,'Notes','showNotes','N',activateNoteTool);
      makeListCardToggle(lineList,'Lines','showLines','L',activateLineTool);
      [dimList?.closest('.lc-card'),noteList?.closest('.lc-card'),lineList?.closest('.lc-card')]
        .filter(Boolean)
        .forEach(card=>card.classList.add('lc-design-only'));
      syncListVisibilityEyes();
      // Pieces: compact one-line header; Add Piece lives inside the expanded body.
      const piecesCard=list?.closest('.lc-card'),piecesHead=piecesCard?.querySelector('.lc-card-head');
      if(piecesCard&&piecesHead&&!piecesHead.dataset.toggleReady){
        piecesHead.dataset.toggleReady='1';
        piecesHead.classList.remove('lc-two-row-head');
        piecesHead.classList.add('lc-single-row-head');
        piecesHead.style.userSelect='none';

        const piecesTitle=piecesHead.querySelector('h3');
        if(piecesTitle)piecesTitle.dataset.baseLabel='Pieces';
        const addPieceBtn=piecesHead.querySelector('#lc-add');

        const titleRow=document.createElement('div');
        titleRow.className='lc-head-title-row';
        const piecesArrow=document.createElement('span');
        piecesArrow.className='lc-head-arrow';
        piecesArrow.textContent='▸';
        piecesArrow.setAttribute('aria-hidden','true');

        const pieceFillBtn=document.createElement('button');
        pieceFillBtn.type='button';
        pieceFillBtn.className='lc-btn ghost lc-iconbtn lc-piece-fill-toggle';
        pieceFillBtn.onclick=e=>{
          e.preventDefault();
          e.stopPropagation();

          const mode=pieceDisplayMode();
          setPieceDisplayMode(mode==='color'?'slab':(mode==='slab'?'empty':'color'));
        };

        const inlineActions=document.createElement('div');
        inlineActions.className='lc-head-inline-actions';
        inlineActions.append(pieceFillBtn,piecesArrow);

        if(piecesTitle)titleRow.append(piecesTitle);
        titleRow.append(inlineActions);
        piecesHead.replaceChildren(titleRow);

        function syncPieceFillUI(){
          const mode=pieceDisplayMode();

          if(mode==='slab'){
            pieceFillBtn.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 15c3-5 5 2 10-5M7 11c3-3 5 1 10-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
            pieceFillBtn.title='Piece Display: Slab — click for Empty';
          }else if(mode==='empty'){
            pieceFillBtn.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
            pieceFillBtn.title='Piece Display: Empty — click for Color';
          }else{
            pieceFillBtn.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/></svg>';
            pieceFillBtn.title='Piece Display: Color — click for Slab';
          }

          pieceFillBtn.setAttribute('aria-label',pieceFillBtn.title);
          pieceFillBtn.setAttribute('data-display-mode',mode);
          pieceFillBtn.classList.toggle('is-off',mode==='empty');
        }
        syncPieceFillUI();

        let addRow=null;
        if(addPieceBtn){
          addRow=document.createElement('div');
          addRow.className='lc-sidebar-add-row';
          addPieceBtn.classList.remove('lc-sidebar-add');
          addPieceBtn.classList.add('lc-sidebar-inline-add');
          addPieceBtn.textContent='+ Add Piece';
          addRow.appendChild(addPieceBtn);
          piecesCard.insertBefore(addRow,list);
        }

        let piecesOpen=false;
        const setPiecesBodyVisible=(el,visible)=>{
          if(!el)return;
          el.hidden=!visible;
          if(visible)el.style.removeProperty('display');
          else el.style.setProperty('display','none','important');
        };
        const syncPieces=()=>{
          setPiecesBodyVisible(addRow,piecesOpen);
          setPiecesBodyVisible(list,piecesOpen);
          piecesCard.classList.toggle('lc-pieces-collapsed',!piecesOpen);
          piecesArrow.textContent=piecesOpen?'▾':'▸';
          titleRow.setAttribute('aria-expanded',String(piecesOpen));
        };
        titleRow.addEventListener('click',()=>{piecesOpen=!piecesOpen;syncPieces();});
        titleRow.setAttribute('role','button');
        titleRow.setAttribute('tabindex','0');
        titleRow.addEventListener('keydown',e=>{
          if(e.key==='Enter'||e.key===' '){e.preventDefault();piecesOpen=!piecesOpen;syncPieces();}
        });
        syncPieces();
      }

      const inspector = document.getElementById('lc-inspector');
      const btnAdd = document.getElementById('lc-add');
      const inspectorPanel = inspector?.closest('.lc-card') || null;
      if(inspectorPanel&&!inspectorPanel.querySelector(':scope > .lc-card-head')){
        const directTitle=Array.from(inspectorPanel.children).find(el=>el.tagName==='H3');
        if(directTitle){
          const head=document.createElement('div');
          head.className='lc-card-head lc-inspector-head';
          inspectorPanel.insertBefore(head,directTitle);
          head.appendChild(directTitle);
        }
      }
      const sinksMountEl = document.getElementById('lc-sinks-card');
      const sinksLegacyCard = sinksMountEl?.closest('.lc-card') || null;
      const inspectorSectionOpen={
        pieceInfo:true,
        appearance:false,
        sinks:false,
        seams:false,
        edgeOptions:false
      };

      function syncInspectorAccordionDom(){
        inspector?.querySelectorAll?.('[data-inspector-key]').forEach(sec=>{
          const key=sec.dataset.inspectorKey;
          const open=!!inspectorSectionOpen[key];
          sec.classList.toggle('is-open',open);
          const head=sec.querySelector(':scope > .lc-inspector-section-toggle');
          const body=sec.querySelector(':scope > .lc-subcard-body');
          const arrow=head?.querySelector('.lc-head-arrow');
          if(body)body.hidden=!open;
          if(arrow)arrow.textContent=open?'▾':'▸';
          head?.setAttribute('aria-expanded',String(open));
        });
      }

      function setExclusiveInspectorSection(key,open=true){
        Object.keys(inspectorSectionOpen).forEach(k=>{inspectorSectionOpen[k]=!!open&&k===key;});
        syncInspectorAccordionDom();
        if(typeof maybeAdvanceGuidedWorkflow==='function'){
          setTimeout(maybeAdvanceGuidedWorkflow,0);
        }
      }
      const annotationInspectorOpen={
        dimension:true,
        line:true,
        note:true,
        overlay:true
      };

      const btnExportPDFAll = document.getElementById('btn-export-pdf-all');
      const btnExportJSON = document.getElementById('lc-export-json');
      const btnExportPNG  = document.getElementById('lc-export-png');
      const btnExportSVG  = document.getElementById('lc-export-svg');
      const inImport = document.getElementById('lc-import');
      const btnImport = document.getElementById('lc-import-btn');
      const importName = document.getElementById('lc-import-name');
      const importExportCard =
        btnExportJSON?.closest('.lc-card') ||
        btnImport?.closest('.lc-card') ||
        null;

      // Detach the legacy standalone Sinks mount without risking the Inspector shell.
      if(sinksMountEl)sinksMountEl.remove();
      if(
        sinksLegacyCard &&
        sinksLegacyCard!==inspectorPanel &&
        sinksLegacyCard!==importExportCard
      ){
        sinksLegacyCard.remove();
      }

      const inProject = document.getElementById('lc-project');
      const inDate = document.getElementById('lc-date');

      function makeSidebarCardCollapsible(card,{defaultOpen=true,actionButton=null,actionLabel='Add'}={}){
        const head=card?.querySelector(':scope > .lc-card-head');
        if(!card||!head||head.dataset.sidebarCollapseReady)return;
        head.dataset.sidebarCollapseReady='1';
        head.classList.remove('lc-two-row-head');
        head.classList.add('lc-single-row-head');

        const title=head.querySelector('h3');
        const titleRow=document.createElement('div');
        titleRow.className='lc-head-title-row';
        const arrow=document.createElement('span');
        arrow.className='lc-head-arrow';
        arrow.textContent=defaultOpen?'▾':'▸';
        if(title)titleRow.append(title);
        titleRow.append(arrow);
        head.replaceChildren(titleRow);

        if(actionButton){
          const actionRow=document.createElement('div');
          actionRow.className='lc-sidebar-add-row';
          actionButton.classList.remove('lc-sidebar-add');
          actionButton.classList.add('lc-sidebar-inline-add');
          actionButton.textContent=actionLabel;
          actionRow.appendChild(actionButton);
          head.insertAdjacentElement('afterend',actionRow);
        }

        const bodyEls=Array.from(card.children).filter(el=>el!==head);
        let open=!!defaultOpen;
        const sync=()=>{
          bodyEls.forEach(el=>{
            el.hidden=!open;
            if(open)el.style.removeProperty('display');
            else el.style.setProperty('display','none','important');
          });
          arrow.textContent=open?'▾':'▸';
          titleRow.setAttribute('aria-expanded',String(open));
        };
        titleRow.addEventListener('click',()=>{open=!open;sync();});
        titleRow.setAttribute('role','button');
        titleRow.setAttribute('tabindex','0');
        titleRow.addEventListener('keydown',e=>{
          if(e.key==='Enter'||e.key===' '){e.preventDefault();open=!open;sync();}
        });
        sync();
      }

      // ===== Estimate foundation (v1.3.27) =====
      // Keep estimating values derived from geometry so they can never go stale.
      let estimateLayoutSfEl=null;
      let estimateProjectSfEl=null;
      let estimatePieceCountEl=null;

      function pieceSquareFeet(piece){
        const w=Math.max(0,Number(piece?.w)||0);
        const h=Math.max(0,Number(piece?.h)||0);
        return (w*h)/144;
      }

      function layoutSquareFeet(layout){
        const pieces=Array.isArray(layout?.pieces)?layout.pieces:[];
        return pieces.reduce((sum,piece)=>sum+pieceSquareFeet(piece),0);
      }

      function projectSquareFeet(){
        return (Array.isArray(state.layouts)?state.layouts:[])
          .reduce((sum,layout)=>sum+layoutSquareFeet(layout),0);
      }

      function renderEstimateSummary(){
        if(!estimateLayoutSfEl||!estimateProjectSfEl||!estimatePieceCountEl)return;
        const L=cur();
        estimateLayoutSfEl.textContent=layoutSquareFeet(L).toFixed(2)+' SF';
        estimateProjectSfEl.textContent=projectSquareFeet().toFixed(2)+' SF';
        estimatePieceCountEl.textContent=String(Array.isArray(L?.pieces)?L.pieces.length:0);
      }

      const projectCard=inProject?.closest('.lc-card');
      const layoutsCard=layoutsEl?.closest('.lc-card');

      const overlayAccordion=document.getElementById('ov-accordion');
      const overlayListEl=document.getElementById('ov-list');
      let overlaysCard=null;
      let overlayVisibilityEye=null;
      let overlayVisibilityTitle=null;

      function syncSidebarOverlayClipUI(){
        const L=ensureOverlaysOnLayout(activeLayout());
        if(L)L.overlayClip=true;
      }

      function syncOverlayVisibilityEye(){
        const L=ensureOverlaysOnLayout(activeLayout());
        const visible=L?.showOverlays!==false;
        if(overlayVisibilityEye){
          overlayVisibilityEye.innerHTML=eyeIcon(visible);
          overlayVisibilityEye.title=visible?'Hide all overlays':'Show overlays';
          overlayVisibilityEye.setAttribute('aria-label',overlayVisibilityEye.title);
          overlayVisibilityEye.setAttribute('aria-pressed',String(visible));
          overlayVisibilityEye.style.opacity=visible?'1':'.55';
        }
        if(overlayVisibilityTitle)overlayVisibilityTitle.style.opacity=visible?'1':'.6';
      }

      if(overlayListEl){
        overlaysCard=document.createElement('div');
        overlaysCard.className='lc-card lc-left-section lc-overlays-card lc-slab-only';

        const head=document.createElement('div');
        head.className='lc-card-head';
        const titleRow=document.createElement('div');
        titleRow.className='lc-head-title-row';
        const title=document.createElement('h3');
        title.id='lc-overlays-title';
        title.textContent='Slabs (0)';
        overlayVisibilityTitle=title;

        const arrow=document.createElement('span');
        arrow.className='lc-head-arrow';
        arrow.textContent='▸';

        const inlineActions=document.createElement('div');
        inlineActions.className='lc-head-inline-actions';
        inlineActions.append(arrow);
        titleRow.append(title,inlineActions);
        head.appendChild(titleRow);
        syncOverlayVisibilityEye();

        const overlayAddRow=document.createElement('div');
        overlayAddRow.className='lc-sidebar-add-row lc-overlay-add-row';

        const overlayAddWrap=document.createElement('div');
        overlayAddWrap.className='lc-overlay-add-wrap';

        const overlayAddBtn=document.createElement('button');
        overlayAddBtn.type='button';
        overlayAddBtn.id='lc-overlay-add-menu-btn';
        overlayAddBtn.className='lc-btn ghost lc-sidebar-inline-add lc-overlay-add-btn';
        overlayAddBtn.textContent='+ Add Slab';
        overlayAddBtn.setAttribute('aria-haspopup','menu');
        overlayAddBtn.setAttribute('aria-expanded','false');

        const overlayAddMenu=document.createElement('div');
        overlayAddMenu.className='lc-overlay-add-menu';
        overlayAddMenu.hidden=true;
        overlayAddMenu.setAttribute('role','menu');

        const makeOverlayAddOption=(label,action)=>{
          const btn=document.createElement('button');
          btn.type='button';
          btn.className='lc-overlay-add-option';
          btn.textContent=label;
          btn.setAttribute('role','menuitem');
          btn.onclick=e=>{
            e.preventDefault();
            e.stopPropagation();
            overlayAddMenu.hidden=true;
            overlayAddBtn.setAttribute('aria-expanded','false');
            action();
          };
          overlayAddMenu.appendChild(btn);
          return btn;
        };

        makeOverlayAddOption('Upload Slab Image',()=>document.getElementById('ov-add-photo')?.click());
        makeOverlayAddOption('Choose From Library',()=>document.getElementById('ov-lib-photo')?.click());

        const setOverlayAddMenuOpen=open=>{
          if(overlayAddBtn.disabled)open=false;
          overlayAddMenu.hidden=!open;
          overlayAddBtn.setAttribute('aria-expanded',String(open));
        };

        overlayAddBtn.onclick=e=>{
          e.preventDefault();
          e.stopPropagation();
          setOverlayAddMenuOpen(overlayAddMenu.hidden);
        };

        overlayAddWrap.append(overlayAddBtn,overlayAddMenu);
        overlayAddRow.appendChild(overlayAddWrap);

        document.addEventListener('pointerdown',e=>{
          if(!overlayAddWrap.contains(e.target))setOverlayAddMenuOpen(false);
        });

        overlayListEl.classList.add('lc-overlay-nav-list');
        overlaysCard.append(head,overlayAddRow,overlayListEl);

        let overlaysOpen=false;
        const syncOverlaysOpen=()=>{
          if(overlaysOpen){
            overlayAddRow.style.removeProperty('display');
            overlayListEl.style.removeProperty('display');
          }else{
            overlayAddRow.style.setProperty('display','none','important');
            overlayListEl.style.setProperty('display','none','important');
            setOverlayAddMenuOpen(false);
          }
          arrow.textContent=overlaysOpen?'▾':'▸';
          titleRow.setAttribute('aria-expanded',String(overlaysOpen));
        };
        titleRow.onclick=()=>{overlaysOpen=!overlaysOpen;syncOverlaysOpen();};
        titleRow.setAttribute('role','button');
        titleRow.setAttribute('tabindex','0');
        titleRow.onkeydown=e=>{
          if(e.key==='Enter'||e.key===' '){
            e.preventDefault();
            overlaysOpen=!overlaysOpen;
            syncOverlaysOpen();
          }
        };
        syncOverlaysOpen();

        const lineCard=lineList?.closest('.lc-card');
        if(lineCard?.parentElement)lineCard.insertAdjacentElement('afterend',overlaysCard);
      }

      // Estimate summary: intentionally small and collapsed by default for v1.3.27.
      const estimateCard=document.createElement('div');
      estimateCard.className='lc-card lc-left-section lc-estimate-card';

      const estimateHead=document.createElement('div');
      estimateHead.className='lc-card-head';
      const estimateTitleRow=document.createElement('div');
      estimateTitleRow.className='lc-head-title-row';
      const estimateTitle=document.createElement('h3');
      estimateTitle.textContent='Estimate';
      const estimateArrow=document.createElement('span');
      estimateArrow.className='lc-head-arrow';
      estimateArrow.textContent='▸';
      estimateTitleRow.append(estimateTitle,estimateArrow);
      estimateHead.appendChild(estimateTitleRow);

      const estimateBody=document.createElement('div');
      estimateBody.className='lc-estimate-summary';

      const makeEstimateRow=(label)=>{
        const row=document.createElement('div');
        row.className='lc-estimate-row';
        const key=document.createElement('span');
        key.textContent=label;
        const value=document.createElement('strong');
        value.textContent='0';
        row.append(key,value);
        estimateBody.appendChild(row);
        return value;
      };

      estimateLayoutSfEl=makeEstimateRow('Layout SF');
      estimateProjectSfEl=makeEstimateRow('Project SF');
      estimatePieceCountEl=makeEstimateRow('Pieces');
      estimateCard.append(estimateHead,estimateBody);

      let estimateOpen=false;
      const syncEstimateOpen=()=>{
        if(estimateOpen)estimateBody.style.removeProperty('display');
        else estimateBody.style.setProperty('display','none','important');
        estimateArrow.textContent=estimateOpen?'▾':'▸';
        estimateTitleRow.setAttribute('aria-expanded',String(estimateOpen));
      };
      estimateTitleRow.onclick=()=>{estimateOpen=!estimateOpen;syncEstimateOpen();};
      estimateTitleRow.setAttribute('role','button');
      estimateTitleRow.setAttribute('tabindex','0');
      estimateTitleRow.onkeydown=e=>{
        if(e.key==='Enter'||e.key===' '){
          e.preventDefault();
          estimateOpen=!estimateOpen;
          syncEstimateOpen();
        }
      };
      syncEstimateOpen();

      const estimateAnchor=overlaysCard||lineList?.closest('.lc-card');
      if(estimateAnchor?.parentElement)estimateAnchor.insertAdjacentElement('afterend',estimateCard);
      renderEstimateSummary();

      // Keep the old overlay controls in the DOM as hidden implementation hooks
      // for upload/library actions, but remove their visible left-rail panel.
      if(overlayAccordion){
        overlayAccordion.style.setProperty('display','none','important');
        overlayAccordion.setAttribute('aria-hidden','true');
      }

      [
        projectCard,
        layoutsCard,
        piecesCard,
        dimList?.closest('.lc-card'),
        noteList?.closest('.lc-card'),
        lineList?.closest('.lc-card'),
        overlaysCard,
        estimateCard
      ].filter(Boolean).forEach(card=>card.classList.add('lc-left-section'));

      makeSidebarCardCollapsible(projectCard,{defaultOpen:true});
      makeSidebarCardCollapsible(layoutsCard,{defaultOpen:true,actionButton:btnAddLayout,actionLabel:'+ Add Layout'});

      // --- Main workspace order: left rail | canvas | inspector ---
      const mm = window.matchMedia('(max-width: 899px)');
      const workspace=document.querySelector('.lc-wrap');
      const leftRail=workspace?.querySelector('.lc-col:first-child') || null;
      const inspectorCol=inspectorPanel?.closest('.lc-col') || null;
      const canvasCard=document.getElementById('lc-svg')?.closest('.lc-card') || null;
      const canvasCol=canvasCard?.closest('.lc-col') || null;
      let layoutWorkspaceTab=null;
      let slabWorkspaceTab=null;

      if(canvasCard&&!canvasCard.querySelector('.lc-canvas-tabs')){
        const tabs=document.createElement('div');
        tabs.className='lc-canvas-tabs';
        tabs.setAttribute('role','tablist');
        tabs.setAttribute('aria-label','Canvas workspace');

        layoutWorkspaceTab=document.createElement('button');
        layoutWorkspaceTab.type='button';
        layoutWorkspaceTab.className='lc-canvas-tab';
        layoutWorkspaceTab.textContent='DESIGN';
        layoutWorkspaceTab.setAttribute('role','tab');
        layoutWorkspaceTab.onclick=()=>setCanvasWorkspace('layout');

        slabWorkspaceTab=document.createElement('button');
        slabWorkspaceTab.type='button';
        slabWorkspaceTab.className='lc-canvas-tab';
        slabWorkspaceTab.textContent='SLAB';
        slabWorkspaceTab.setAttribute('role','tab');
        slabWorkspaceTab.onclick=()=>setCanvasWorkspace('slab');

        tabs.append(layoutWorkspaceTab,slabWorkspaceTab);
        const canvasWrap=canvasCard.querySelector('.lc-canvas-wrap');
        if(canvasWrap)canvasWrap.insertAdjacentElement('beforebegin',tabs);
        else canvasCard.prepend(tabs);
        syncCanvasWorkspaceTabs();
      }

      leftRail?.classList.add('lc-left-rail');
      canvasCol?.classList.add('lc-canvas-col');
      inspectorCol?.classList.add('lc-inspector-col');
      inspectorPanel?.classList.add('lc-inspector-panel');

      if(workspace&&canvasCol&&inspectorCol&&canvasCol!==inspectorCol){
        if(leftRail&&leftRail.parentElement===workspace){
          leftRail.insertAdjacentElement('afterend',canvasCol);
          canvasCol.insertAdjacentElement('afterend',inspectorCol);
        }else{
          workspace.append(canvasCol,inspectorCol);
        }
      }

      // Remove the visible Import / Export card by identity rather than "second card".
      // Its original controls remain hidden as implementation hooks for toolbar actions.
      if(importExportCard){
        const hiddenActions=document.createElement('div');
        hiddenActions.id='lc-hidden-file-actions';
        hiddenActions.hidden=true;
        hiddenActions.setAttribute('aria-hidden','true');
        const keep=[
          btnExportPDFAll,btnExportPDF,btnExportJSON,btnExportPNG,btnExportSVG,
          btnImport,inImport,importName,btnReset,
          document.getElementById('copy-share-link')
        ].filter(Boolean);
        keep.forEach(el=>hiddenActions.appendChild(el));
        (cadRoot||document.body).appendChild(hiddenActions);
        importExportCard.remove();
      }

      // The Inspector is a permanent right rail.
      if(inspectorPanel){
        inspectorPanel.hidden=false;
        inspectorPanel.style.display='';
      }

btnExportPDFAll && (btnExportPDFAll.onclick = () => {
  if (!requireProjectName()) return;
  exportAllLayoutsToPDF().catch(err => {
    console.error(err);
    alert('PDF export failed. Please try again.');
  });
});


btnExportPDF && (btnExportPDF.onclick = async () => {
  if (!requireProjectName()) return;

  // 1) Load jsPDF
  let jsPDF;
  try { jsPDF = await ensureJsPDF(); }
  catch (err) { alert('Could not load jsPDF. Try SVG/PNG instead.'); return; }

  const svgEl = document.getElementById('lc-svg') || svg;
  if (!svgEl) return;

  // Canvas size from the SVG element (in points for PDF placement)
  const W = Number(svgEl.getAttribute('width'))  || 800;
  const H = Number(svgEl.getAttribute('height')) || 400;
  const isLandscape = W > H;

  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'letter',
    compress: true,
    putOnlyUsedFonts: true
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin  = 36;   // 0.5"
  const headerH = 40;   // header block height

  // Header text (keeps your existing look)
  const title = (state.projectName || 'Untitled Project');
  const date  = (state.projectDate || todayISO());
  const lname = (state.layouts[state.active]?.name) || 'Layout 1';

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(title, margin, margin);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(`Date: ${date}`,   margin, margin + 16);
  doc.text(`Layout: ${lname}`, margin, margin + 32);

  // Fit the SVG into the available content area
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2 - headerH;
  const scale = Math.min(1, maxW / W, maxH / H);
  const imgW  = W * scale;
  const imgH  = H * scale;
  const imgX  = margin;
  const imgY  = margin + headerH;

// Clone + sanitize SVG for svg2pdf (removes problem attrs, sets explicit text styles)
function cloneSvgForPdf(srcSvg, opts = {}){
  const { defaultFont = 'Helvetica', defaultFontSize = 12, defaultFill = '#111' } = opts;
  const svgNS = 'http://www.w3.org/2000/svg';
  const XLNS  = 'http://www.w3.org/1999/xlink';

  // deep clone
  const cl = srcSvg.cloneNode(true);

  // namespaces + explicit size
  cl.setAttribute('xmlns', svgNS);
  cl.setAttribute('xmlns:xlink', XLNS);
  const W = Number(srcSvg.getAttribute('width'))  || srcSvg.viewBox?.baseVal?.width  || 800;
  const H = Number(srcSvg.getAttribute('height')) || srcSvg.viewBox?.baseVal?.height || 400;
  cl.setAttribute('width',  String(W));
  cl.setAttribute('height', String(H));

  // Display themes never belong in production output.
  cl.querySelectorAll('.lc-canvas-background').forEach(bg=>{
    bg.classList.remove('lc-canvas-background');
    bg.setAttribute('fill','#fff');
    bg.setAttribute('stroke','#e5e7eb');
  });

  // remove attributes/elements that often break svg2pdf
  cl.querySelectorAll('[vector-effect]').forEach(n => n.removeAttribute('vector-effect'));
  // (optional) if you never use filters/masks/clipPaths, strip them:
  cl.querySelectorAll('defs, clipPath, mask, filter, pattern, marker').forEach(n => n.remove());

  // ensure text has explicit font + size + fill (svg2pdf relies on these)
  cl.querySelectorAll('text, tspan').forEach(t => {
    if (!t.getAttribute('font-family')) t.setAttribute('font-family', defaultFont);
    if (!t.getAttribute('font-size'))   t.setAttribute('font-size',   String(defaultFontSize));
    if (!t.getAttribute('fill'))        t.setAttribute('fill',        defaultFill);
    // normalize anchors/baselines to things svg2pdf handles well
    // (keep your existing ones if present)
  });

  // normalize dash arrays to numeric strings (avoid "none"/undefined)
  cl.querySelectorAll('[stroke-dasharray]').forEach(el => {
    const v = el.getAttribute('stroke-dasharray');
    if (!v || v === 'none') el.removeAttribute('stroke-dasharray');
  });

  return cl;
}


  // ---------- CRISP VECTOR EXPORT (preferred) ----------
if (window.svg2pdf) {
  try {
    // build a safe clone of the SVG for vector export
    const safe = cloneSvgForPdf(svgEl, {
      defaultFont: 'Helvetica',
      defaultFontSize: 12,
      defaultFill: '#111'
    });

    // svg2pdf (vector). If this succeeds, we’re done.
    window.svg2pdf(safe, doc, {
      x: imgX,
      y: imgY,
      width: imgW,
      height: imgH,
      useCSS: true,
      fontCallback: () => 'helvetica'
    });
  } catch (e) {
    console.warn('[export] svg2pdf failed — falling back to raster PNG:', e);
    await addRasterPNG(); // no popup, just fallback
  }
} else {
  console.info('[export] svg2pdf not found — using raster PNG fallback');
  await addRasterPNG();   // no popup, just fallback
}
  // ---------- END VECTOR EXPORT ----------

  // Notes under the image
  const notes = (state.notes || '').trim();
  if (notes) {
    const yStart = imgY + imgH + 16;
    const lines = doc.splitTextToSize(`Notes: ${notes}`, pageW - margin * 2);
    doc.text(lines, margin, yStart);
  }

  doc.save(`${fileBase()}.pdf`);


  // ---------- High-Res PNG fallback (crisper than JPEG; larger files) ----------
  async function addRasterPNG() {
    const EXPORT_SCALE = 2.0;  // bump to 2x for legible text when rasterized
    const serializer = new XMLSerializer();
    const src = serializer.serializeToString(svgEl);
    const blob = new Blob([src], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);

    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width  = Math.max(1, Math.floor(imgW * EXPORT_SCALE));
    canvas.height = Math.max(1, Math.floor(imgH * EXPORT_SCALE));

    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    URL.revokeObjectURL(url);

    const dataURL = canvas.toDataURL('image/png'); // PNG keeps text sharper than JPEG
    doc.addImage(dataURL, 'PNG', imgX, imgY, imgW, imgH, undefined, 'FAST');
  }
});




      function placeForMobile(isMobile){
        if(!canvasCard)return;
        const toolbar=canvasCard.querySelector('.lc-toolbar');
        const canvasWrap=canvasCard.querySelector('.lc-canvas-wrap');
        const topRow=canvasCard.querySelector('.lc-top');

        if(isMobile){
          // Keep the canvas first and place its toolbar directly below it on small screens.
          if(toolbar&&canvasWrap)canvasWrap.insertAdjacentElement('afterend',toolbar);
        }else{
          if(toolbar&&topRow)topRow.insertAdjacentElement('beforebegin',toolbar);
        }
      }

      mm.addEventListener('change', e => placeForMobile(e.matches));
      placeForMobile(mm.matches); // run once on load

      function initSinksCard({ uiMountEl, getSelectedPiece, onStateChange }) {
        const root = document.createElement('div');
        uiMountEl.innerHTML = '';
        const openIndex = new Map();
        const sinkEditorSectionOpen = new Map();
        root.className = 'sinks-card';
        uiMountEl.appendChild(root);

        // small DOM helpers
        function el(tag, cls, text){ const n=document.createElement(tag); if(cls) n.className=cls; if(text!=null) n.textContent=text; return n; }
        function labelWrap(label, node){ const w=el('label','lc-label'); w.appendChild(el('div','lc-small',label)); w.appendChild(node); return w; }
        function select(options, value){
          const s=document.createElement('select'); s.className='lc-input';
          options.forEach(o=>{ const opt=document.createElement('option'); opt.value=o.v; opt.textContent=o.t; s.appendChild(opt); });
          if(value!=null) s.value=String(value); return s;
        }
        function numInput(value, step=0.001, min=null, max=null){
          const i=document.createElement('input'); i.type='number'; i.className='lc-input';
          i.value = (typeof fmt3==='function') ? fmt3(value??0) : String(value??0);
          i.step=String(step); if(min!=null) i.min=String(min); if(max!=null) i.max=String(max);
          i.addEventListener('blur',()=>{ i.value=(typeof fmt3==='function')?fmt3(i.value):i.value; });
          return i;
        }

        function createDefaultSink(){
          const m = SINK_MODELS[0];
          return {
            id: 'sink_'+Math.random().toString(36).slice(2,9),
            name:'',
            type: 'model',
            modelId: m.id, shape: m.shape, w: m.w, h: m.h, cornerR: m.cornerR,
            side: 'front',
            centerline: 20,
            setback: SINK_STANDARD_SETBACK,
            faucets: [4],
            faucetSetback: DEFAULT_FAUCET_SETBACK,
            faucetHoleDiameter: DEFAULT_FAUCET_HOLE_DIAMETER,
            faucetHoleSpacing: DEFAULT_FAUCET_SPACING,
            rotation: 0
          };
        }

        function installSinkReorder(list,piece){
          if(!list||!piece)return;
          const THRESH=4;
          let drag=null;

          const cleanup=()=>{
            if(!drag)return;
            drag.row?.classList.remove('dragging');
            drag.marker?.remove();
            list.classList.remove('reordering');
            drag=null;
          };

          list.addEventListener('pointerdown',e=>{
            const handle=e.target.closest('.lc-sink-drag');
            if(!handle)return;
            const row=handle.closest('.lc-sink-row');
            if(!row)return;
            const rows=Array.from(list.querySelectorAll('.lc-sink-row'));
            const from=rows.indexOf(row);
            if(from<0)return;
            drag={row,from,startY:e.clientY,moved:false,marker:null,pointerId:e.pointerId};
            handle.setPointerCapture?.(e.pointerId);
            e.preventDefault();
            e.stopPropagation();
          });

          list.addEventListener('pointermove',e=>{
            if(!drag)return;
            if(!drag.moved&&Math.abs(e.clientY-drag.startY)<THRESH)return;
            if(!drag.moved){
              drag.moved=true;
              list.classList.add('reordering');
              drag.row.classList.add('dragging');
              drag.marker=document.createElement('div');
              drag.marker.className='lc-drop-marker';
            }

            const rows=Array.from(list.querySelectorAll('.lc-sink-row')).filter(row=>row!==drag.row);
            let before=null;
            for(const row of rows){
              const rect=row.getBoundingClientRect();
              if(e.clientY<rect.top+rect.height/2){before=row;break;}
            }
            if(before)list.insertBefore(drag.marker,before);
            else list.appendChild(drag.marker);
          });

          const finish=()=>{
            if(!drag)return;
            if(!drag.moved){cleanup();return;}
            const {from,marker}=drag;
            const rows=Array.from(list.querySelectorAll('.lc-sink-row'));
            let after=marker.nextElementSibling;
            while(after&&!after.matches?.('.lc-sink-row'))after=after.nextElementSibling;
            let to=after?rows.indexOf(after):rows.length;
            if(to>from)to--;
            marker.remove();
            drag.row.classList.remove('dragging');
            list.classList.remove('reordering');
            drag=null;
            if(to===from||to<0)return;

            const moved=piece.sinks.splice(from,1)[0];
            piece.sinks.splice(to,0,moved);
            onStateChange?.();
          };

          list.addEventListener('pointerup',finish);
          list.addEventListener('pointercancel',cleanup);
        }


        function render(){
          root.innerHTML = '';

          const header = el('div','lc-card-head');
          header.appendChild(el('h3',null,'Sinks'));
          root.appendChild(header);

          const piece = getSelectedPiece?.();
          if(!piece){
            root.appendChild(el('div','lc-small','Select a piece to add a sink.'));
            return;
          }
          migratePieceForSinks(piece);

          // Add button (show header button only when there's already at least one sink)
          if ((piece.sinks?.length || 0) > 0 && piece.sinks.length < MAX_SINKS_PER_PIECE) {
            const add = el('button','lc-btn alt','+ Add Sink');
            add.onclick = () => {
              const added=createDefaultSink();
              piece.sinks.push(added);
              openIndex.set(piece.id,added.id);
              onStateChange?.();
            };
            header.appendChild(add);
          }


          if(!piece.sinks.length){
            const empty=el('div','lc-small lc-sink-empty','This piece has no sinks.');
            root.appendChild(empty);
            return;
          }

          // --- sink navigator: order controls numbering + CL dimension lane priority ---
          const list = el('div','lc-list lc-nav lc-sink-list');
          const openId = openIndex.has(piece.id) ? openIndex.get(piece.id) : null;

          piece.sinks.forEach((sink, idx)=>{
            const row = el('div','lc-item nav lc-sink-row' + (openId===sink.id?' selected':''));
            row.dataset.sinkId=sink.id;

            const dragHandle=el('span','lc-sink-drag');
            dragHandle.title='Drag to reorder sink';
            dragHandle.setAttribute('aria-label','Drag to reorder sink');
            dragHandle.innerHTML='<svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3" cy="4" r="1.1"/><circle cx="9" cy="4" r="1.1"/><circle cx="3" cy="9" r="1.1"/><circle cx="9" cy="9" r="1.1"/><circle cx="3" cy="14" r="1.1"/><circle cx="9" cy="14" r="1.1"/></svg>';

            const label=el('div','lc-sink-row-main');
            const title=el('div','lc-sink-row-title');
            const customName=String(sink.name||'').trim();
            title.textContent=`Sink ${idx+1}${customName?' — '+customName:''}`;
            title.title=title.textContent;

            const meta=el('div','lc-sink-row-meta');
            const model = sink.type==='model'
              ? (SINK_MODELS.find(m=>m.id===sink.modelId)?.label || 'Model')
              : 'Custom';
            meta.textContent=`${model} · CL ${fmtCanvasInches(sink.centerline||0)}`;
            label.append(title,meta);

            const actions=el('div','lc-sink-row-actions');

            const rename=el('button','lc-btn ghost lc-iconbtn lc-rename-btn lc-sink-rename');
            rename.type='button';
            rename.title='Rename sink';
            rename.textContent='✎';
            rename.onclick=e=>{
              e.stopPropagation();
              beginListRename(title,sink,'',render);
            };

            const btnDup=el('button','lc-btn ghost lc-iconbtn lc-sink-duplicate');
            btnDup.type='button';
            btnDup.title='Duplicate sink';
            btnDup.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24"><path d="M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M5 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            btnDup.onclick=e=>{
              e.stopPropagation();
              if(piece.sinks.length>=MAX_SINKS_PER_PIECE)return;
              const copy=JSON.parse(JSON.stringify(sink));
              copy.id='sink_'+Math.random().toString(36).slice(2,9);
              copy.name=String(sink.name||'').trim()?String(sink.name).trim()+' Copy':'';
              piece.sinks.splice(idx+1,0,copy);
              openIndex.set(piece.id,copy.id);
              onStateChange?.();
            };

            const btnDel=el('button','lc-btn red lc-iconbtn lc-delete-btn lc-sink-delete');
            btnDel.type='button';
            btnDel.title='Delete sink';
            btnDel.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 11H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z" fill="currentColor"/></svg>';
            btnDel.onclick=e=>{
              e.stopPropagation();
              piece.sinks.splice(idx,1);
              if(openIndex.get(piece.id)===sink.id)openIndex.delete(piece.id);
              onStateChange?.();
            };

            actions.append(rename,btnDup,btnDel);
            row.append(dragHandle,label,actions);

            row.addEventListener('click',e=>{
              if(e.target.closest('button,input,.lc-sink-drag'))return;
              if(openId===sink.id)openIndex.delete(piece.id);
              else openIndex.set(piece.id,sink.id);
              render();
            });
            list.appendChild(row);

            if(openId===sink.id)list.appendChild(buildSinkEditor(sink,idx,piece));
          });

          installSinkReorder(list,piece);

          root.appendChild(list);
        }

        function buildSinkEditor(sink, idx, piece){
          normalizeSinkFaucetSettings(sink);
          const card = el('div','sink-editor');

          function makeSinkSection(title,key,defaultOpen=true){
            const section=el('div','sink-editor-section');
            const sectionKey=piece.id+':'+sink.id+':'+key;
            let isOpen=sinkEditorSectionOpen.has(sectionKey)
              ? sinkEditorSectionOpen.get(sectionKey)
              : defaultOpen;
            const head=document.createElement('button');
            head.type='button';
            head.className='sink-editor-section-head';
            const label=el('span','sink-editor-section-title',title);
            const arrow=el('span','sink-editor-section-arrow',isOpen?'▾':'▸');
            head.append(label,arrow);
            const body=el('div','sink-editor-section-body');
            const sync=()=>{
              body.hidden=!isOpen;
              if(isOpen)body.style.removeProperty('display');
              else body.style.setProperty('display','none','important');
              arrow.textContent=isOpen?'▾':'▸';
              head.setAttribute('aria-expanded',String(isOpen));
            };
            head.onclick=()=>{
              isOpen=!isOpen;
              sinkEditorSectionOpen.set(sectionKey,isOpen);
              sync();
            };
            section.append(head,body);
            card.appendChild(section);
            sync();
            return body;
          }

          const sinkBody=makeSinkSection('Sink','sink',true);
          const typeSel=select([{v:'model',t:'Model'},{v:'custom',t:'Custom'}],sink.type||'model');
          typeSel.onchange=()=>{
            sink.type=typeSel.value;
            if(sink.type==='model'){
              const m=SINK_MODELS.find(m=>m.id===(sink.modelId||SINK_MODELS[0].id))||SINK_MODELS[0];
              applyModelToSink(sink,m);
            }
            onStateChange?.();
          };

          const modelSel=select(SINK_MODELS.map(m=>({v:m.id,t:m.label})),sink.modelId||SINK_MODELS[0].id);
          modelSel.disabled=sink.type!=='model';
          modelSel.onchange=()=>{
            sink.modelId=modelSel.value;
            applyModelToSink(sink,SINK_MODELS.find(m=>m.id===sink.modelId));
            onStateChange?.();
          };

          const sinkTopRow=el('div','row sink-basic-row');
          sinkTopRow.append(labelWrap('Type',typeSel),labelWrap('Model',modelSel));
          sinkBody.appendChild(sinkTopRow);

          const rowCustom=el('div','row sink-custom-size-row');
          const len=numInput(sink.w??32,0.125,0);
          len.oninput=()=>{sink.w=clamp(round3(len.value),0,999);draw();scheduleSave?.();};
          const wid=numInput(sink.h??18,0.125,0);
          wid.oninput=()=>{sink.h=clamp(round3(wid.value),0,999);draw();scheduleSave?.();};
          rowCustom.append(labelWrap('Length (in)',len),labelWrap('Width (in)',wid));
          rowCustom.style.display=sink.type==='custom'?'':'none';
          sinkBody.appendChild(rowCustom);

          const sinkDetailRow=el('div','row sink-detail-row');
          const rot=numInput(sink.rotation||0,1,0,360);
          rot.oninput=()=>{sink.rotation=clamp(Math.round(rot.value||0),0,360);draw();scheduleSave?.();};
          const rad=numInput(sink.cornerR??0,0.125,0,4);
          rad.oninput=()=>{sink.cornerR=clamp(round3(rad.value),0,4);draw();scheduleSave?.();};
          sinkDetailRow.append(labelWrap('Rotation (°)',rot),labelWrap('Corner R (in)',rad));
          sinkBody.appendChild(sinkDetailRow);

          const positionBody=makeSinkSection('Position','position',true);
          const sideSel=select(
            [{v:'front',t:'Front'},{v:'back',t:'Back'},{v:'left',t:'Left'},{v:'right',t:'Right'}],
            sink.side||'front'
          );
          sideSel.onchange=()=>{
            sink.side=sideSel.value;
            const axisMax=(sink.side==='left'||sink.side==='right')?(piece.h||0):(piece.w||0);
            sink.centerline=clamp(round3(sink.centerline??0),0,axisMax);
            draw();scheduleSave?.();onStateChange?.();
          };
          const cl=numInput(sink.centerline??20,0.25,0);
          cl.oninput=()=>{sink.centerline=round3(cl.value);draw();scheduleSave?.();};
          const setback=numInput(sink.setback??SINK_STANDARD_SETBACK,0.25,0);
          setback.oninput=()=>{sink.setback=clamp(round3(setback.value),0,999);draw();scheduleSave?.();};

          const positionTopRow=el('div','row sink-position-row');
          positionTopRow.append(labelWrap('Reference side',sideSel),labelWrap('Centerline (in)',cl));
          positionBody.appendChild(positionTopRow);
          const sinkSetbackRow=el('div','row sink-setback-row');
          sinkSetbackRow.appendChild(labelWrap('Sink setback (in)',setback));
          positionBody.appendChild(sinkSetbackRow);

          const faucetBody=makeSinkSection('Faucet Holes','faucets',true);
          const patternField=el('div','faucet-hole-field');
          const patternHead=el('div','faucet-pattern-head');
          patternHead.append(
            el('span','lc-small','Hole pattern'),
            el('span','faucet-selected-count','Selected: '+(sink.faucets||[]).length)
          );
          patternField.appendChild(patternHead);

          const rack=el('div','holes-row');
          for(let i=0;i<9;i++){
            const slot=el('div','faucet-hole-slot'+(i===4?' is-center':''));
            const cb=document.createElement('input');
            cb.type='checkbox';
            cb.style.margin='0';
            cb.setAttribute('aria-label','Faucet hole '+(i+1)+(i===4?' centerline':''));
            cb.checked=!!(sink.faucets||[]).includes(i);
            cb.onchange=()=>{
              const selected=new Set(sink.faucets||[]);
              cb.checked?selected.add(i):selected.delete(i);
              sink.faucets=Array.from(selected).sort((a,b)=>a-b);
              onStateChange?.();
            };
            slot.append(cb,el('span','faucet-hole-marker',i===4?'CL':''));
            rack.appendChild(slot);
          }
          patternField.appendChild(rack);
          faucetBody.appendChild(patternField);

          const faucetSetbackInput=numInput(faucetHoleSetback(sink),0.25,0,999);
          faucetSetbackInput.title='Distance from sink cutout edge to faucet-hole centerline';
          faucetSetbackInput.oninput=()=>{
            sink.faucetSetback=Math.max(0,round3(faucetSetbackInput.value));
            draw();scheduleSave?.();
          };

          const faucetDiameterInput=numInput(faucetHoleDiameter(sink),0.125,0.001,12);
          faucetDiameterInput.oninput=()=>{
            sink.faucetHoleDiameter=Math.max(0.001,round3(faucetDiameterInput.value));
            draw();scheduleSave?.();
          };

          const faucetSpacingInput=numInput(faucetHoleSpacing(sink),0.25,0.001,999);
          faucetSpacingInput.title='Center-to-center spacing between adjacent hole positions';
          faucetSpacingInput.oninput=()=>{
            sink.faucetHoleSpacing=Math.max(0.001,round3(faucetSpacingInput.value));
            draw();scheduleSave?.();
          };

          const faucetSettingsRow=el('div','row faucet-settings-row');
          faucetSettingsRow.append(
            labelWrap('Setback (in)',faucetSetbackInput),
            labelWrap('Diameter (in)',faucetDiameterInput),
            labelWrap('Spacing (in)',faucetSpacingInput)
          );
          faucetBody.appendChild(faucetSettingsRow);

          [len,wid,rot,rad,cl,setback,faucetSetbackInput,faucetDiameterInput,faucetSpacingInput]
            .forEach(inp=>inp.onchange=()=>onStateChange?.());

          return card;
        }

      render();
      return {
        refresh: render,
        add: ()=>{
          const piece=getSelectedPiece?.();
          if(!piece)return;
          migratePieceForSinks(piece);
          if(piece.sinks.length>=MAX_SINKS_PER_PIECE)return;
          const added=createDefaultSink();
          piece.sinks.push(added);
          openIndex.set(piece.id,added.id);
          setExclusiveInspectorSection('sinks',true);
          onStateChange?.();
        }
      };
    
    }


    // Ensure sinks array exists on any existing pieces
    state.pieces.forEach(migratePieceForSinks);

    // Build Sinks UI
    sinksUI = initSinksCard({
      uiMountEl: sinksMountEl,
      getSelectedPiece: () => state.pieces.find(p => p.id === state.selectedId) || null,
      onStateChange: () => {
        draw();
        scheduleSave?.();
        pushHistory();
        sinksUI.refresh();
        syncTopBar?.();
      }
    });

      // ------- Utils -------
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
        inCW.value = state.cw; 
        inCH.value = state.ch; 
        inGrid.value = state.grid;
        inScale.value = state.scale; 
        lblScale.textContent = String(state.scale);
        syncTopBar();                            // ✅ reflect to the new toggle buttons

      }

      function getSnapPointsInches(){
        // Corners + midpoints of each piece (ignores rotation for now)
        const pts = [];
        for (const p of state.pieces || []) {
          const x0 = p.x, y0 = p.y;
          const x1 = p.x + p.w, y1 = p.y + p.h;

          // corners
          pts.push({ x: x0, y: y0 });
          pts.push({ x: x1, y: y0 });
          pts.push({ x: x1, y: y1 });
          pts.push({ x: x0, y: y1 });

          // edge midpoints
          pts.push({ x: (x0 + x1) / 2, y: y0 });
          pts.push({ x: (x0 + x1) / 2, y: y1 });
          pts.push({ x: x0, y: (y0 + y1) / 2 });
          pts.push({ x: x1, y: (y0 + y1) / 2 });
        }
        return pts;
      }

      function snapDimPoint(pt) {
        // How close (in inches) you have to be for snapping
        const SNAP_IN = 1.0; // a bit more forgiving than 0.5"

        const snapPoints = getSnapPointsInches();
        let best = null;
        let bestD2 = SNAP_IN * SNAP_IN;

        // 1) Try piece corners / edges
        for (const sp of snapPoints) {
          const dx = sp.x - pt.x;
          const dy = sp.y - pt.y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestD2) {
            bestD2 = d2;
            best = { x: sp.x, y: sp.y };
          }
        }

        // 2) Try grid intersections if no piece snap wins
        const g = state.grid || 0;
        if (!best && g > 0) {
          const gx = Math.round(pt.x / g) * g;
          const gy = Math.round(pt.y / g) * g;
          const dx = gx - pt.x;
          const dy = gy - pt.y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestD2) {
            best = { x: gx, y: gy };
          }
        }

        // Fallback: no snap, just raw point
        return best || pt;
      }




      function snapLinePoint(pt){
        const SNAP_IN=1.25;
        let best=null,bestD2=SNAP_IN*SNAP_IN;
        state.pieces.forEach(p=>{
          const rs=realSize(p),x0=p.x,y0=p.y,x1=x0+rs.w,y1=y0+rs.h;
          const candidates=[
            {x:Math.max(x0,Math.min(x1,pt.x)),y:y0},
            {x:Math.max(x0,Math.min(x1,pt.x)),y:y1},
            {x:x0,y:Math.max(y0,Math.min(y1,pt.y))},
            {x:x1,y:Math.max(y0,Math.min(y1,pt.y))}
          ];
          candidates.forEach(q=>{const dx=q.x-pt.x,dy=q.y-pt.y,d2=dx*dx+dy*dy;if(d2<=bestD2){bestD2=d2;best=q;}});
        });
        return best||snapDimPoint(pt);
      }

      // Smart drawing constraint: near-horizontal/vertical lines square up automatically.
      // Hold Shift on the second click to force the nearest axis.
      function constrainDrawPoint(start,end,force=false){
        if(!start||!end)return end;
        const dx=end.x-start.x,dy=end.y-start.y,ax=Math.abs(dx),ay=Math.abs(dy);
        if(ax<0.001&&ay<0.001)return end;
        // Gentle automatic straightening leaves room for intentional shallow diagonals.
        // Shift remains a hard constraint to the nearest horizontal/vertical axis.
        const AUTO_TAN=Math.tan(3*Math.PI/180);
        if(force)return ax>=ay?{x:end.x,y:start.y}:{x:start.x,y:end.y};
        if(ax>0&&ay/ax<=AUTO_TAN)return {x:end.x,y:start.y};
        if(ay>0&&ax/ay<=AUTO_TAN)return {x:start.x,y:end.y};
        return end;
      }

      let toolPreview=null; // transient only; never saved
      function previewSnapInfo(raw,mode){
        const snapped=mode==='line'?snapLinePoint(raw):snapDimPoint(raw);
        const d=Math.hypot(snapped.x-raw.x,snapped.y-raw.y);
        return {point:snapped,snapped:d>0.001};
      }
      function drawToolPreview(){
        if(!toolPreview)return;
        const start=toolPreview.start,end=toolPreview.end;
        const g=svgEl('g',{'pointer-events':'none'});
        if(toolPreview.firstPoint){
          g.appendChild(svgEl('circle',{cx:i2p(toolPreview.point.x),cy:i2p(toolPreview.point.y),r:5,fill:toolPreview.snapped?'#2563eb':'#fff',stroke:'#2563eb','stroke-width':2,'vector-effect':'non-scaling-stroke'}));
          svg.appendChild(g);
          return;
        }
        if(!start||!end)return;
        // alignment guides through the constrained endpoint
        if(Math.abs(end.y-start.y)<0.001){
          g.appendChild(svgEl('line',{x1:0,y1:i2p(end.y),x2:i2p(state.workspace==='slab'?slabCanvasW():state.cw),y2:i2p(end.y),stroke:'#2563eb','stroke-width':1,'stroke-dasharray':'4 4','vector-effect':'non-scaling-stroke',opacity:.55}));
        }
        if(Math.abs(end.x-start.x)<0.001){
          g.appendChild(svgEl('line',{x1:i2p(end.x),y1:0,x2:i2p(end.x),y2:i2p(state.workspace==='slab'?slabCanvasH():state.ch),stroke:'#2563eb','stroke-width':1,'stroke-dasharray':'4 4','vector-effect':'non-scaling-stroke',opacity:.55}));
        }
        g.appendChild(svgEl('line',{x1:i2p(start.x),y1:i2p(start.y),x2:i2p(end.x),y2:i2p(end.y),stroke:toolPreview.mode==='line'?'#111':'#2563eb','stroke-width':2,'stroke-dasharray':toolPreview.mode==='line'?'none':'5 4','vector-effect':'non-scaling-stroke'}));
        const marker=(p,fill)=>g.appendChild(svgEl('circle',{cx:i2p(p.x),cy:i2p(p.y),r:5,fill,stroke:'#2563eb','stroke-width':2,'vector-effect':'non-scaling-stroke'}));
        marker(start,'#fff');marker(end,toolPreview.snapped?'#2563eb':'#fff');
        svg.appendChild(g);
      }

      // --- Fill helpers ---
      function syncOpacityRangeVisual(input){
        if(!input)return;
        const min=Number(input.min)||0;
        const max=Number(input.max)||100;
        const value=Number(input.value);
        const pct=max>min?clamp(((value-min)/(max-min))*100,0,100):0;
        input.style.setProperty('--lc-range-pct',pct+'%');
      }

      function getFillOpacity(p){
        // default to 1 if not set; clamp to [0,1]
        const v = typeof p.fillOpacity === 'number' ? p.fillOpacity : 1;
        return Math.max(0, Math.min(1, v));
      }

      function applyPieceFill(el, p){
        const noFill = !!p.noFill || state.showPieceFills===false;
        const color  = p.color || '#999';

        el.setAttribute('fill', noFill ? 'none' : color);
        if (noFill){
          el.removeAttribute('fill-opacity');
        } else {
          el.setAttribute('fill-opacity', String(getFillOpacity(p)));
        }
      }


      // ===== Layout / Slab workspace ============================================
      // Piece geometry is shared between both workspaces. Installed placement
      // remains p.x / p.y / p.rotation; fabrication placement lives here.
      function ensureSlabPlacement(piece){
        if(!piece)return {x:0,y:0,rotation:0};
        if(!piece.slabPlacement||typeof piece.slabPlacement!=='object'){
          piece.slabPlacement={
            x:Number(piece.x)||0,
            y:Number(piece.y)||0,
            rotation:Number(piece.rotation)||0
          };
        }
        const sp=piece.slabPlacement;
        if(!Number.isFinite(Number(sp.x)))sp.x=Number(piece.x)||0;
        if(!Number.isFinite(Number(sp.y)))sp.y=Number(piece.y)||0;
        if(!Number.isFinite(Number(sp.rotation)))sp.rotation=Number(piece.rotation)||0;
        sp.x=round3(Number(sp.x)||0);
        sp.y=round3(Number(sp.y)||0);
        sp.rotation=round3(Number(sp.rotation)||0);
        return sp;
      }

      function slabRealSize(piece){
        const sp=ensureSlabPlacement(piece);
        return realSize({w:Number(piece?.w)||0,h:Number(piece?.h)||0,rotation:sp.rotation});
      }

      function clampSlabPlacement(piece){
        if(!piece)return piece;
        const sp=ensureSlabPlacement(piece);
        const rs=slabRealSize(piece);
        sp.x=round3(clamp(Number(sp.x)||0,0,Math.max(0,slabCanvasW()-rs.w)));
        sp.y=round3(clamp(Number(sp.y)||0,0,Math.max(0,slabCanvasH()-rs.h)));
        return piece;
      }

      function syncCanvasWorkspaceTabs(){
        const slab=state.workspace==='slab';
        if(layoutWorkspaceTab){
          layoutWorkspaceTab.classList.toggle('is-active',!slab);
          layoutWorkspaceTab.setAttribute('aria-selected',String(!slab));
        }
        if(slabWorkspaceTab){
          slabWorkspaceTab.classList.toggle('is-active',slab);
          slabWorkspaceTab.setAttribute('aria-selected',String(slab));
        }
        const root=document.querySelector('.lite-cad');
        root?.classList.toggle('lc-workspace-slab',slab);
        root?.classList.toggle('lc-workspace-layout',!slab);
        root?.classList.toggle('lc-workspace-design',!slab);
        syncWorkspaceCommandAvailability?.(document);
      }

      function setCanvasWorkspace(mode){
        const next=mode==='slab'?'slab':'layout';
        if(state.workspace===next){syncCanvasWorkspaceTabs();return;}
        saveCurrentWorkspaceViewState();
        state.workspace=next;
        loadWorkspaceViewState(next);
        state.drag=null;
        slabDrag=null;
        dimDrag=null;
        toolPreview=null;
        if(next==='slab'){
          if(momentaryToolState.held==='splash'||momentaryToolState.held==='splashAll'||momentaryToolState.held==='radius'||momentaryToolState.held==='radiusAll'){
            momentaryToolState.held=null;
            momentaryToolState.key=null;
          }
          if(momentaryToolState.locked==='splash'||momentaryToolState.locked==='splashAll'||momentaryToolState.locked==='radius'||momentaryToolState.locked==='radiusAll'){
            momentaryToolState.locked=null;
          }
          state.dimTool=false;
          state.noteTool=false;
          state.lineTool=false;
          dimTempStart=null;
          lineTempStart=null;
          state.selectedDimId=null;
          state.selectedLineId=null;
          state.selectedNoteId=null;
          state.pieces.forEach(ensureSlabPlacement);
          syncDimToolUI?.();
          syncNoteToolUI?.();
          syncLineToolUI?.();
        }
        syncCanvasWorkspaceTabs();
        syncViewMenuUI?.();
        renderList?.();
        renderDimList?.();
        renderLineList?.();
        renderNoteList?.();
        renderOverlayList?.();
        syncOverlayUI?.();
        updateInspector?.();
        sinksUI?.refresh?.();
        draw();
        scheduleSave?.();
        syncTopBar?.();
      }

      // Render the exact material area beneath a piece in SLAB back onto its
      // installed LAYOUT position. The matrix converts slab-global coordinates
      // into the piece's unrotated local frame; the normal Layout rotation is
      // then applied by the outer piece group.
      function appendMappedSlabMaterial(group,p,pathD,layoutCx,layoutCy){
        if(!state.showSlabMaterial||!group||!p||!pathD)return;
        const L=ensureOverlaysOnLayout(activeLayout());
        const arr=Array.isArray(L?.overlays)?L.overlays:[];
        if(!L||!arr.some(o=>o?.visible&&o?.dataURL))return;

        const sp=ensureSlabPlacement(p);
        const srs=slabRealSize(p);
        const slabCx=i2p(sp.x+srs.w/2);
        const slabCy=i2p(sp.y+srs.h/2);
        const rad=-(Number(sp.rotation)||0)*Math.PI/180;
        const a=Math.cos(rad),b=Math.sin(rad),c=-Math.sin(rad),d=Math.cos(rad);
        const e=layoutCx-a*slabCx-c*slabCy;
        const f=layoutCy-b*slabCx-d*slabCy;

        const defs=ensureDefs();
        const safeId=String(p.id||uid()).replace(/[^a-zA-Z0-9_-]/g,'_');
        const maskId='lc-slab-piece-mask-'+safeId;
        svg.querySelector('#'+maskId)?.remove();

        const mask=document.createElementNS(svgNS,'mask');
        mask.id=maskId;
        mask.setAttribute('maskUnits','userSpaceOnUse');

        const outer=document.createElementNS(svgNS,'path');
        outer.setAttribute('d',pathD);
        outer.setAttribute('fill','#fff');
        mask.appendChild(outer);

        if(Array.isArray(p.sinks)&&p.sinks.length){
          const leftPx=layoutCx-i2p(p.w)/2;
          const topPx=layoutCy-i2p(p.h)/2;

          p.sinks.forEach(sink=>{
            const pose=sinkPoseOnPiece(p,sink);
            const sx=leftPx+i2p(pose.cx);
            const sy=topPx+i2p(pose.cy);
            const localAngle=sinkReferenceAngle(sink.side||'front')+(sink.rotation||0);

            const gs=document.createElementNS(svgNS,'g');
            gs.setAttribute('transform',`translate(${sx}, ${sy}) rotate(${localAngle})`);

            if(sink.shape==='oval'){
              gs.appendChild(svgEl('ellipse',{
                cx:0,cy:0,
                rx:i2p(sink.w/2),ry:i2p(sink.h/2),
                fill:'#000'
              }));
            }else{
              const w2=i2p(sink.w/2),h2=i2p(sink.h/2),rr=i2p(Math.min(sink.cornerR||0,4));
              gs.appendChild(svgEl('path',{
                d:roundedRectPathSimple(-w2,-h2,w2*2,h2*2,rr),
                fill:'#000'
              }));
            }

            if(Array.isArray(sink.faucets)){
              const holeOffset=i2p(holeOffsetFromSinkEdge(sink));
              const spacing=i2p(faucetHoleSpacing(sink));
              const radius=i2p(faucetHoleDiameter(sink)/2);
              sink.faucets.forEach(idx=>{
                gs.appendChild(svgEl('circle',{
                  cx:(-4+idx)*spacing,
                  cy:-(i2p(sink.h/2)+holeOffset),
                  r:radius,
                  fill:'#000'
                }));
              });
            }
            mask.appendChild(gs);
          });
        }

        defs.appendChild(mask);

        const materialG=document.createElementNS(svgNS,'g');
        materialG.setAttribute('class','lc-piece-slab-material');
        materialG.setAttribute('mask',`url(#${maskId})`);
        materialG.setAttribute('pointer-events','none');
        group.appendChild(materialG);

        arr.forEach(o=>{
          if(!o?.visible||!o?.dataURL)return;
          const im=document.createElementNS(svgNS,'image');
          im.setAttributeNS('http://www.w3.org/1999/xlink','href',o.dataURL);
          im.setAttribute('x',i2p(Number(o.x)||0));
          im.setAttribute('y',i2p(Number(o.y)||0));
          im.setAttribute('width',Math.max(1,i2p(Number(o.slabW)||1)));
          im.setAttribute('height',Math.max(1,i2p(Number(o.slabH)||1)));
          im.setAttribute('preserveAspectRatio','none');
          im.setAttribute('opacity',o.opacity==null?1:o.opacity);
          im.setAttribute('transform',`matrix(${a} ${b} ${c} ${d} ${e} ${f})`);
          im.setAttribute('pointer-events','none');
          materialG.appendChild(im);
        });
      }

      function drawSlabWorkspace(){
        syncCanvasWorkspaceTabs();
        syncCanvasToolCursor();
        renderEstimateSummary?.();

        const slabW=slabCanvasW(),slabH=slabCanvasH();
        const Wpx=i2p(slabW),Hpx=i2p(slabH);
        svg.setAttribute('width',Wpx);
        svg.setAttribute('height',Hpx);
        svg.setAttribute('viewBox',`0 0 ${Wpx} ${Hpx}`);
        while(svg.firstChild)svg.removeChild(svg.firstChild);

        const border=svgEl('rect',{x:0,y:0,width:Wpx,height:Hpx,fill:'#fff',stroke:'#e5e7eb'});
        border.classList.add('lc-canvas-background');
        svg.appendChild(border);

        // Raw slabs are always visible in the fabrication workspace.
        drawOverlays();

        if(state.showGrid){
          const grid=document.createElementNS(svgNS,'g');
          const stepPx=i2p(state.grid);
          for(let x=0;x<=Wpx+.5;x+=stepPx){
            grid.appendChild(svgEl('line',{x1:x,y1:0,x2:x,y2:Hpx,stroke:'#e5e7eb','stroke-width':(x%(stepPx*6)===0)?1.25:.5,opacity:(x%(stepPx*6)===0)?.9:.7}));
          }
          for(let y=0;y<=Hpx+.5;y+=stepPx){
            grid.appendChild(svgEl('line',{x1:0,y1:y,x2:Wpx,y2:y,stroke:'#e5e7eb','stroke-width':(y%(stepPx*6)===0)?1.25:.5,opacity:(y%(stepPx*6)===0)?.9:.7}));
          }
          svg.appendChild(grid);
        }

        [...state.pieces].sort((a,b)=>(a.layer||0)-(b.layer||0)).forEach((p,index)=>{
          migratePieceGeometry(p);
          clampSlabPlacement(p);
          const sp=ensureSlabPlacement(p);
          const rs=slabRealSize(p);
          const x=i2p(sp.x),y=i2p(sp.y),BW=i2p(rs.w),BH=i2p(rs.h);
          const W0=i2p(p.w),H0=i2p(p.h);
          const cx=x+BW/2,cy=y+BH/2;
          const corners=pieceCornerPixels(p);
          const rot=((Number(sp.rotation)||0)%360+360)%360;
          const splashTagged=isBacksplashPiece(p);
          const showThisPieceLabel=splashTagged?!!state.showSplashLabels:!!state.showLabels;
          const showThisLabelDims=splashTagged?!!state.showSplashLabelDims:!!state.showLabelDims;
          const showThisPieceDims=splashTagged?!!state.showSplashDims:!!state.showDims;

          const gPiece=document.createElementNS(svgNS,'g');
          gPiece.setAttribute('data-id',p.id);
          gPiece.classList.add('lc-slab-piece');
          if(rot)gPiece.setAttribute('transform',`rotate(${rot}, ${cx}, ${cy})`);

          const path=document.createElementNS(svgNS,'path');
          path.setAttribute('d',roundedRectPathCorners(cx-W0/2,cy-H0/2,W0,H0,corners));
          applyPieceFill(path,p);
          path.setAttribute('stroke','#000');
          path.setAttribute('stroke-width','1');
          gPiece.appendChild(path);

          if(isSelected(p.id)){
            const outline=document.createElementNS(svgNS,'path');
            outline.setAttribute('d',path.getAttribute('d'));
            outline.setAttribute('fill','none');
            outline.setAttribute('stroke','#0ea5e9');
            outline.setAttribute('stroke-width','2');
            outline.setAttribute('vector-effect','non-scaling-stroke');
            outline.setAttribute('pointer-events','none');
            gPiece.appendChild(outline);
          }

          // Show sink/faucet geometry on fabrication parts as reference.
          if(Array.isArray(p.sinks)&&p.sinks.length){
            const leftPx=cx-W0/2,topPx=cy-H0/2;
            const sinksG=document.createElementNS(svgNS,'g');
            sinksG.setAttribute('pointer-events','none');
            p.sinks.forEach((sink,sinkIndex)=>{
              const pose=sinkPoseOnPiece(p,sink);
              const sxIn=pose.cx,syIn=pose.cy;
              const sx=leftPx+i2p(sxIn),sy=topPx+i2p(syIn);
              const localAngle=sinkReferenceAngle(sink.side||'front')+(sink.rotation||0);
              const gs=document.createElementNS(svgNS,'g');
              gs.setAttribute('transform',`translate(${sx}, ${sy}) rotate(${localAngle})`);
              if(sink.shape==='oval'){
                gs.appendChild(svgEl('ellipse',{cx:0,cy:0,rx:i2p(sink.w/2),ry:i2p(sink.h/2),fill:'none',stroke:'#333','stroke-width':1}));
              }else{
                const w2=i2p(sink.w/2),h2=i2p(sink.h/2),rr=i2p(Math.min(sink.cornerR||0,4));
                gs.appendChild(svgEl('path',{d:roundedRectPathSimple(-w2,-h2,w2*2,h2*2,rr),fill:'none',stroke:'#333','stroke-width':1}));
              }
              if(Array.isArray(sink.faucets)){
                const holeOffsetIn=holeOffsetFromSinkEdge(sink);
                const holeSpacingIn=faucetHoleSpacing(sink);
                const holeRadiusIn=faucetHoleDiameter(sink)/2;
                sink.faucets.forEach(idx=>{
                  gs.appendChild(svgEl('circle',{
                    cx:(-4+idx)*i2p(holeSpacingIn),
                    cy:-(i2p(sink.h/2)+i2p(holeOffsetIn)),
                    r:i2p(holeRadiusIn),fill:'none',stroke:'#333','stroke-width':1
                  }));
                });
              }
              sinksG.appendChild(gs);

              if(state.showSinkCenterlines){
                const dimStroke='#000',tick=5,pieceDimOffset=10,laneGap=16;
                const xL=leftPx,xR=leftPx+W0,yT=topPx,yB=topPx+H0;
                const side=['front','back','left','right'].includes(sink.side)?sink.side:'front';
                const laneIndex=p.sinks
                  .slice(0,sinkIndex)
                  .filter(other=>(['front','back','left','right'].includes(other.side)?other.side:'front')===side)
                  .length;

                if(side==='front'||side==='back'){
                  const xCL=xL+i2p(sxIn);
                  const yDim=side==='back'
                    ? yT-pieceDimOffset-laneGap*(laneIndex+1)
                    : yB+pieceDimOffset+laneGap*laneIndex;
                  sinksG.append(
                    svgEl('line',{x1:xL,y1:yDim,x2:xCL,y2:yDim,stroke:dimStroke,'vector-effect':'non-scaling-stroke'}),
                    svgEl('line',{x1:xL,y1:yDim-tick,x2:xL,y2:yDim+tick,stroke:dimStroke,'vector-effect':'non-scaling-stroke'}),
                    svgEl('line',{x1:xCL,y1:yDim-tick,x2:xCL,y2:yDim+tick,stroke:dimStroke,'vector-effect':'non-scaling-stroke'})
                  );
                  const label=svgEl('text',{x:(xL+xCL)/2,y:side==='back'?yDim-4:yDim+13,'text-anchor':'middle','font-size':'11',fill:'#111'});
                  label.textContent=`${fmtCanvasInches(sxIn)} CL`;
                  sinksG.appendChild(label);
                }else{
                  const yCL=yT+i2p(syIn);
                  const xDim=side==='left'
                    ? xL-pieceDimOffset-laneGap*(laneIndex+1)
                    : xR+pieceDimOffset+laneGap*laneIndex;
                  sinksG.append(
                    svgEl('line',{x1:xDim,y1:yT,x2:xDim,y2:yCL,stroke:dimStroke,'vector-effect':'non-scaling-stroke'}),
                    svgEl('line',{x1:xDim-tick,y1:yT,x2:xDim+tick,y2:yT,stroke:dimStroke,'vector-effect':'non-scaling-stroke'}),
                    svgEl('line',{x1:xDim-tick,y1:yCL,x2:xDim+tick,y2:yCL,stroke:dimStroke,'vector-effect':'non-scaling-stroke'})
                  );
                  const label=svgEl('text',{x:side==='left'?xDim-4:xDim+4,y:(yT+yCL)/2,'text-anchor':side==='left'?'end':'start','dominant-baseline':'middle','font-size':'11',fill:'#111'});
                  label.textContent=`${fmtCanvasInches(syIn)} CL`;
                  sinksG.appendChild(label);
                }
              }
            });
            gPiece.appendChild(sinksG);
          }

          // Existing Piece Seams remain visible in the fabrication workspace.
          if(Array.isArray(p.pieceSeams)&&p.pieceSeams.length){
            const seams=document.createElementNS(svgNS,'g');
            seams.setAttribute('class','lc-slab-piece-seams');
            seams.setAttribute('pointer-events','none');
            p.pieceSeams.forEach(ps=>{
              let x1,y1,x2,y2;
              if(ps.orientation==='horizontal'){
                const off=ps.reference==='bottom'?p.h-(Number(ps.offset)||0):(Number(ps.offset)||0);
                y1=y2=cy-H0/2+i2p(off);x1=cx-W0/2;x2=cx+W0/2;
              }else{
                const off=ps.reference==='right'?p.w-(Number(ps.offset)||0):(Number(ps.offset)||0);
                x1=x2=cx-W0/2+i2p(off);y1=cy-H0/2;y2=cy+H0/2;
              }
              seams.appendChild(svgEl('line',{x1,y1,x2,y2,stroke:'#111','stroke-width':1.5,'stroke-dasharray':'6 4','vector-effect':'non-scaling-stroke'}));
            });
            gPiece.appendChild(seams);
          }

          if(showThisPieceDims){
            const dims=document.createElementNS(svgNS,'g');
            dims.setAttribute('class','dims lc-slab-piece-dims');
            dims.setAttribute('pointer-events','none');
            const off=12,tick=6,stroke='#000';
            const xL=cx-W0/2,xR=cx+W0/2,yT=cy-H0/2,yB=cy+H0/2;
            const yTop=yT-off,xLeft=xL-off;

            dims.append(
              svgEl('line',{x1:xL,y1:yTop,x2:xR,y2:yTop,stroke,'vector-effect':'non-scaling-stroke'}),
              svgEl('line',{x1:xL,y1:yTop-tick,x2:xL,y2:yTop+tick,stroke,'vector-effect':'non-scaling-stroke'}),
              svgEl('line',{x1:xR,y1:yTop-tick,x2:xR,y2:yTop+tick,stroke,'vector-effect':'non-scaling-stroke'}),
              svgEl('line',{x1:xLeft,y1:yT,x2:xLeft,y2:yB,stroke,'vector-effect':'non-scaling-stroke'}),
              svgEl('line',{x1:xLeft-tick,y1:yT,x2:xLeft+tick,y2:yT,stroke,'vector-effect':'non-scaling-stroke'}),
              svgEl('line',{x1:xLeft-tick,y1:yB,x2:xLeft+tick,y2:yB,stroke,'vector-effect':'non-scaling-stroke'})
            );

            const wt=svgEl('text',{x:cx,y:yTop-4,'text-anchor':'middle','font-size':'12',fill:'#111','paint-order':'stroke',stroke:'#fff','stroke-width':'3'});
            wt.textContent=fmtCanvasInches(p.w);
            const ht=svgEl('text',{x:xLeft-4,y:cy,'text-anchor':'end','dominant-baseline':'middle','font-size':'12',fill:'#111','paint-order':'stroke',stroke:'#fff','stroke-width':'3'});
            ht.textContent=fmtCanvasInches(p.h);
            dims.append(wt,ht);
            gPiece.appendChild(dims);
          }

          if(state.showEdgeProfiles&&p.edgeProfiles){
            const labelsG=document.createElementNS(svgNS,'g');
            labelsG.setAttribute('class','edge-profiles lc-slab-edge-profiles');
            labelsG.setAttribute('pointer-events','none');
            const addEdgeLabel=(value,xPos,yPos,anchor='middle',rotation=0)=>{
              const profile=normalizeEdgeProfile(value);
              if(profile==='none')return;
              const t=svgEl('text',{x:xPos,y:yPos,'text-anchor':anchor,'dominant-baseline':'middle','font-size':'11',fill:'#111'});
              if(rotation)t.setAttribute('transform',`rotate(${rotation} ${xPos} ${yPos})`);
              t.textContent=EDGE_PROFILE_LABELS[profile]||profile;
              labelsG.appendChild(t);
            };
            const MARGIN=8;
            addEdgeLabel(p.edgeProfiles.top,cx,cy-H0/2+MARGIN,'middle',0);
            addEdgeLabel(p.edgeProfiles.bottom,cx,cy+H0/2-MARGIN,'middle',180);
            addEdgeLabel(p.edgeProfiles.left,cx-W0/2+MARGIN,cy,'middle',-90);
            addEdgeLabel(p.edgeProfiles.right,cx+W0/2-MARGIN,cy,'middle',90);
            gPiece.appendChild(labelsG);
          }

          if(showThisPieceLabel){
            const t=document.createElementNS(svgNS,'text');
            t.setAttribute('x',cx);
            t.setAttribute('y',cy+(showThisLabelDims?-6:0));
            t.setAttribute('text-anchor','middle');
            if(!showThisLabelDims)t.setAttribute('dominant-baseline','middle');
            t.setAttribute('font-size','12');
            t.setAttribute('font-weight','600');
            t.setAttribute('fill','#111');
            t.setAttribute('paint-order','stroke');
            t.setAttribute('stroke','#fff');
            t.setAttribute('stroke-width','3');
            t.setAttribute('pointer-events','none');

            const nameLine=document.createElementNS(svgNS,'tspan');
            nameLine.setAttribute('x',cx);
            nameLine.textContent=String(p.name||'').trim()||`Piece ${index+1}`;
            t.appendChild(nameLine);

            if(showThisLabelDims){
              const dimLine=document.createElementNS(svgNS,'tspan');
              dimLine.setAttribute('x',cx);
              dimLine.setAttribute('dy','14');
              dimLine.textContent=`${fmtCanvasInches(p.w)} × ${fmtCanvasInches(p.h)}${rot?` · ${fmt3(rot)}°`:''}`;
              t.appendChild(dimLine);
            }
            gPiece.appendChild(t);
          }

          const hit=document.createElementNS(svgNS,'path');
          hit.setAttribute('d',path.getAttribute('d'));
          hit.setAttribute('fill','#000');
          hit.setAttribute('fill-opacity','.001');
          hit.setAttribute('stroke','none');
          hit.setAttribute('pointer-events','fill');
          hit.classList.add('lc-hitbox');
          gPiece.appendChild(hit);

          gPiece.addEventListener('pointerdown',e=>{
            if(activeMomentaryTool())return;
            e.preventDefault();
            e.stopPropagation();

            if(e.metaKey||e.ctrlKey)toggleSelect(p.id);
            else if(!isSelected(p.id))selectOnly(p.id);
            renderList();
            updateInspector();
            sinksUI?.refresh?.();

            const pt=svgPoint(e);
            const startI={x:p2i(pt.x),y:p2i(pt.y)};
            const start=state.pieces.filter(piece=>isSelected(piece.id)).map(piece=>{
              const placement=ensureSlabPlacement(piece);
              return {id:piece.id,x0:placement.x,y0:placement.y,rs:slabRealSize(piece)};
            });
            if(!start.length)return;

            let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
            start.forEach(item=>{
              minX=Math.min(minX,item.x0);minY=Math.min(minY,item.y0);
              maxX=Math.max(maxX,item.x0+item.rs.w);maxY=Math.max(maxY,item.y0+item.rs.h);
            });
            slabDrag={
              startI,
              group:start,
              limits:{dxMin:-minX,dxMax:slabCanvasW()-maxX,dyMin:-minY,dyMax:slabCanvasH()-maxY},
              snappedX:false,snappedY:false,guideX:null,guideY:null
            };
            gPiece.setPointerCapture?.(e.pointerId);
          });

          svg.appendChild(gPiece);
        });

        meta.textContent=`Slab Workspace · ${fmt3(slabCanvasW())}" × ${fmt3(slabCanvasH())}" · Grid ${state.grid}" · Scale ${state.scale}px/in`;
        drawOverlayInteractionLayer();
      }

      function loadOverlayFromFile(file){
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = ()=>{
            state.overlay.dataURL = reader.result;
            state.overlay.natW = img.naturalWidth;
            state.overlay.natH = img.naturalHeight;
            state.overlay.visible = true;
            draw(); scheduleSave(); pushHistory();
            typeof syncTopBar === 'function' && syncTopBar();
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      }

      // tiny generated “defaults” (three simple slabs)
      function overlayPreset(kind='white'){
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = 400;
        const ctx = canvas.getContext('2d');

        // background base color
        const base = {white:'#f7f7f7', gray:'#d9dde2', black:'#121315'}[kind] || '#f7f7f7';
        ctx.fillStyle = base; ctx.fillRect(0,0,canvas.width,canvas.height);

        // subtle speckle noise
        const dots = kind==='black' ? '#2a2b2e' : (kind==='gray' ? '#b7bdc6' : '#dcdcdc');
        for (let i=0;i<8000;i++){
          ctx.fillStyle = dots;
          const x = Math.random()*canvas.width, y = Math.random()*canvas.height;
          const s = Math.random()*1.2; ctx.fillRect(x,y,s,s);
        }

        const url = canvas.toDataURL('image/png');
        state.overlay = {
          ...state.overlay,
          name: `Preset: ${kind}`,
          dataURL: url,
          natW: canvas.width, natH: canvas.height,
          visible: true
        };
        draw(); scheduleSave(); pushHistory();
      }


      function exportJSON(){
        return {
          sinkSideConvention:SINK_SIDE_CONVENTION,
          project: { name: state.projectName.trim(), date: state.projectDate || todayISO(), notes: state.notes || '' },
          layoutName: cur().name,
          canvas: { w: state.cw, h: state.ch },
          grid: state.grid, scale: state.scale, showGrid: state.showGrid,
          showPieceFills: state.showPieceFills,
          showSlabMaterial: state.showSlabMaterial,
          pieces: state.pieces,
          dims: cur().dims || [],
          lines: cur().lines || []
        };
      }

      // prefer full-app snapshot for sharing
      function makeSharePayloadAll(){ return snapshotState(); }

      // keep the old v1 loader for backward compatibility
      function makeSharePayload(){
        // re-use your existing exporter so we only store what we need
        const data = exportJSON();
        return JSON.stringify(data);
      }

      function applySharePayload(json){
        const parsed = JSON.parse(json);
        loadLayout(parsed);
        syncToolbarFromLayout?.();
        renderLayouts?.();
        renderList(); renderDimList(); renderNoteList(); updateInspector(); sinksUI?.refresh?.(); draw();
        scheduleSave(); pushHistory();
        syncTopBar?.(); syncOverlayUI?.();
      }


      function copyShareLink(){
        // make sure the latest text from inputs is in state
        if (inProject) state.projectName = (inProject.value || '').trim();
        if (inDate)    state.projectDate = inDate.value || state.projectDate || todayISO();
        if (typeof inNotes !== 'undefined' && inNotes) state.notes = inNotes.value || '';

        const payload = snapshotState(); // full-app snapshot (all layouts + overlays)
        const hash = 'v2=' + LZString.compressToEncodedURIComponent(payload);
        const url  = location.origin + location.pathname + '#' + hash;

        try{ navigator.clipboard?.writeText(url); }catch(_){}
        window.history.replaceState(null, '', '#'+hash);
        alert('Share link saved to URL and copied to clipboard.');
      }

      // Recognize supported share-hash formats (#v1=..., #v2=...)
      const SHARE_HASH_RE = /^#v(1|2)=/;

      // load from URL
      function tryLoadFromHash() {
        if (!SHARE_HASH_RE.test(location.hash)) return false;
        try {
          const raw = location.hash.slice(1);           // "v2=xxxxx"
          const [v, payload] = raw.split('=');
          const json = LZString.decompressFromEncodedURIComponent(payload);
          if (!json) throw new Error('Bad or empty share payload');

          // v2: full-app snapshot (preferred)
          if (v === 'v2') {
            const snapshot = JSON.parse(json);
            applySnapshot(snapshot);
            draw();
            localStorage.setItem('cadlite.autosave', JSON.stringify(snapshot));
            return true;
          }

          // v1: legacy single-layout payload (kept for backward compatibility)
          if (v === 'v1') {
            applySharePayload(json);
            return true;
          }

          return false;
        } catch (e) {
          console.warn('Failed to load shared snapshot:', e);
          return false;
        }
      }

      // Track when the page was loaded from a short-link
      let SHARE_ID_ATTACHED = false;

      // Call this after you successfully load ?id=…
      async function tryLoadFromIdParam() {
        const id = new URL(location.href).searchParams.get('id');
        if (!id) return false;
        try {
          const res = await fetch(`${SHARE_SERVICE_ORIGIN}/api/share?id=${encodeURIComponent(id)}`);
          if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
          const { snapshot } = await res.json();
          applySnapshot(snapshot);
          draw();
          SHARE_ID_ATTACHED = true;       // <-- mark attached
          return true;
        } catch (e) {
          console.warn('Share load failed:', e);
          return false;
        }
      }

      // Helper: remove ?id from the address bar (pretty URL),
      // so refresh uses autosave (localStorage) instead of reloading the share.
      function detachShareIdFromUrl() {
        if (!SHARE_ID_ATTACHED) return;
        try {
          const u = new URL(location.href);
          u.searchParams.delete('id');
          // IMPORTANT: use window.history to avoid your undo stack "history"
          window.history.replaceState(null, '', u.toString());
        } catch {}
        SHARE_ID_ATTACHED = false;
      }


      document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('copy-share-link');
        if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); shareShort(); });
      });

      (async function boot(){
        const ok = await tryLoadFromIdParam();
        if (!ok) {
          const fromHash = typeof tryLoadFromHash === 'function' && tryLoadFromHash();
          if (!fromHash) { restore(); draw(); }
        }
      })();



      window.addEventListener('hashchange', ()=>{ tryLoadFromHash(); });


      const SAVE_KEY = 'litecad:v2';

      function exportApp(){
        saveCurrentWorkspaceViewState();
        return {
          sinkSideConvention:SINK_SIDE_CONVENTION,
          project: {
            name: state.projectName || '',
            date: state.projectDate || todayISO(),
            notes: state.notes || ''
          },
          layouts: state.layouts,  // includes per-layout overlays[]
          ui: {
            showGrid:   !!state.showGrid,
            showDims:   !!state.showDims,
            showSinkCenterlines: !!state.showSinkCenterlines,
            showManualDims: !!state.showManualDims,
            showEdgeProfiles: !!state.showEdgeProfiles,
            showPieceFills: !!state.showPieceFills,
            showSlabMaterial: !!state.showSlabMaterial,
            workspace: state.workspace==='slab'?'slab':'layout',
            showNotes: !!state.showNotes,
            showLines: !!state.showLines,
            showLabels: !!state.showLabels,
            showSplashLabels: !!state.showSplashLabels,
            showSplashDims: !!state.showSplashDims,
            showSplashLabelDims: !!state.showSplashLabelDims,
            showLabelDims: !!state.showLabelDims,
            showRadiusLabels: !!state.showRadiusLabels,
            workspaceViews: state.workspaceViews,
            dimPrecision: state.dimPrecision,
            dimFormat: state.dimFormat
          },
          active: state.active ?? 0
        };
      }



      let saveTimer = null;

function scheduleSave(){
  detachShareIdFromUrl();    // Detach on any save
  if(typeof maybeAdvanceGuidedWorkflow==='function')setTimeout(maybeAdvanceGuidedWorkflow,0);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    try{
      const payload = JSON.stringify(exportApp());
      // quick sanity check: >4.5MB is risky in most browsers
      if (payload.length > 4_500_000) {
        console.warn('Autosave payload is large:', (payload.length/1_000_000).toFixed(2), 'MB');
      }
      localStorage.setItem(SAVE_KEY, payload);
    }catch(err){
      console.error('Autosave failed:', err);
      alert('Autosave failed — project data is too large.\n\nTip: use smaller overlay photos (they are compressed automatically when added).');
    }
  }, 400);
}

function restore(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);

    if (data.layouts && Array.isArray(data.layouts)){
      state.layouts = data.layouts.map(L => ({ ...L, id: L.id || uid() }));
      migrateSinkSideConvention(state.layouts,data.sinkSideConvention);
      migrateAllSinkSettings();
      state.active = 0;

      state.projectName = (data.project?.name ?? state.projectName ?? '');
      state.projectDate = (data.project?.date ?? state.projectDate ?? todayISO());
      state.notes       = (data.project?.notes ?? state.notes ?? '');
      inProject && (inProject.value = state.projectName);
      inDate    && (inDate.value    = state.projectDate);
      inNotes   && (inNotes.value   = state.notes);

      if (data.ui){
        if ('showGrid'   in data.ui) state.showGrid   = !!data.ui.showGrid;
        if ('showDims'   in data.ui) state.showDims   = !!data.ui.showDims;
        state.showSinkCenterlines = 'showSinkCenterlines' in data.ui ? !!data.ui.showSinkCenterlines : state.showDims;
        if ('showManualDims' in data.ui) state.showManualDims = !!data.ui.showManualDims;
        if ('showEdgeProfiles' in data.ui) state.showEdgeProfiles = !!data.ui.showEdgeProfiles;
        if ('showPieceFills' in data.ui) state.showPieceFills = !!data.ui.showPieceFills;
        if ('showSlabMaterial' in data.ui) state.showSlabMaterial = !!data.ui.showSlabMaterial;
        state.workspace = data.ui.workspace==='slab'?'slab':'layout';
        if ('showNotes' in data.ui) state.showNotes = !!data.ui.showNotes;
        if ('showLines' in data.ui) state.showLines = !!data.ui.showLines;
        if ('showLabels' in data.ui) state.showLabels = !!data.ui.showLabels;
        if ('showSplashLabels' in data.ui) state.showSplashLabels = !!data.ui.showSplashLabels;
        if ('showSplashDims' in data.ui) state.showSplashDims = !!data.ui.showSplashDims;
        if ('showSplashLabelDims' in data.ui) state.showSplashLabelDims = !!data.ui.showSplashLabelDims;
        if ('showLabelDims' in data.ui) state.showLabelDims = !!data.ui.showLabelDims;
        if ('showRadiusLabels' in data.ui) state.showRadiusLabels = !!data.ui.showRadiusLabels;
        state.workspaceViews=data.ui.workspaceViews&&typeof data.ui.workspaceViews==='object'?data.ui.workspaceViews:null;
        if(state.workspaceViews)loadWorkspaceViewState(state.workspace);
        else ensureWorkspaceViewStates();
        if ([1,2,4,8,16].includes(Number(data.ui.dimPrecision))) state.dimPrecision = Number(data.ui.dimPrecision);
        if (data.ui.dimFormat === 'decimal' || data.ui.dimFormat === 'fraction') state.dimFormat = data.ui.dimFormat;
      }

      // per-layout overlays are already inside layouts; nothing to migrate here

      syncToolbarFromLayout();
      renderLayouts();
      renderList();
      updateInspector();
      sinksUI?.refresh?.();
      draw();
      syncShowNotesUI?.();
      syncShowLinesUI?.();
      syncTopBar?.();
      renderOverlayList?.();
      syncOverlayUI?.();
      syncClipTop?.(); 

      return true;
    } else {
      // legacy single-layout payloads
      loadLayout(data);
      renderLayouts();
      renderList();
      renderDimList();
      updateInspector();
      sinksUI?.refresh?.();
      draw();
      syncTopBar?.();
      renderOverlayList?.();
      syncOverlayUI?.();
      syncClipTop?.(); 
      return true;
    }
  } catch (_){
    return false;
  }
}


(function migrateOverlayToLayouts(){
  const L = ensureOverlaysOnLayout(activeLayout());
  if (!L) return;
  if (state.overlay && (state.overlay.dataURL || state.overlay.visible)){
    const o = state.overlay;
    L.overlays.push({
      id: uid(), name: o.name || 'Overlay',
      dataURL: o.dataURL || '', natW: o.natW||0, natH: o.natH||0,
      slabW: o.slabW ?? 126, slabH: o.slabH ?? 63,
      x: o.x||0, y:o.y||0, opacity: (o.opacity ?? 1),
      visible: !!o.visible
    });
    L.ovSel = L.overlays.length - 1;
    // optional: delete legacy
    delete state.overlay;
  }
})();

      syncTopBar();


      // make sure the very latest state gets persisted
      window.addEventListener('beforeunload', () => {
        try {
          clearTimeout(saveTimer);             // <— flush pending debounce
          localStorage.setItem(SAVE_KEY, JSON.stringify(exportApp()));
        } catch (_) {}
      });


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
        // normalize 0–180, then fold to 0–90 for bbox math
        const raw = Math.abs(Number(p.rotation||0)) % 180;
        const deg = raw > 90 ? 180 - raw : raw;
        const t = deg * Math.PI / 180;
        const W = p.w, H = p.h;
        const bw = Math.abs(W * Math.cos(t)) + Math.abs(H * Math.sin(t));
        const bh = Math.abs(W * Math.sin(t)) + Math.abs(H * Math.cos(t));
        return { w: bw, h: bh };
      }


      function clampToCanvas(p){ const rs=realSize(p); p.x=clamp(p.x,0,Math.max(0,state.cw-rs.w)); p.y=clamp(p.y,0,Math.max(0,state.ch-rs.h)); }

      const DEFAULT_SPLASH_HEIGHT=4;
      const SPLASH_DRAW_GAP=0.5;
      const LEGACY_SPLASH_DRAW_GAP=3;

      function isBacksplashPiece(piece){
        return !!piece && (
          piece.pieceType==='backsplash' ||
          (Array.isArray(piece.tags) && piece.tags.includes('backsplash'))
        );
      }

      function splashParentForTool(){
        const ids=state.selectedIds?.length
          ? state.selectedIds
          : (state.selectedId?[state.selectedId]:[]);
        if(ids.length!==1)return null;
        const p=state.pieces.find(piece=>piece.id===ids[0])||null;
        if(!p||isBacksplashPiece(p))return null;
        return p;
      }

      function splashChildForEdge(parentId,edge){
        return state.pieces.find(piece=>
          isBacksplashPiece(piece) &&
          piece.attachment?.kind==='backsplash' &&
          piece.attachment?.parentPieceId===parentId &&
          piece.attachment?.sourceEdge===edge
        )||null;
      }

      function detachSplashChildren(parentId){
        state.pieces.forEach(piece=>{
          if(piece.attachment?.kind==='backsplash' && piece.attachment?.parentPieceId===parentId){
            piece.attachment={...piece.attachment,parentPieceId:null,linkedLength:false};
          }
        });
      }

      function rotateVec(x,y,deg){
        const t=(Number(deg)||0)*Math.PI/180;
        const c=Math.cos(t),s=Math.sin(t);
        return {x:x*c-y*s,y:x*s+y*c};
      }

      function splashPlacement(parent,edge,height=DEFAULT_SPLASH_HEIGHT,gap=SPLASH_DRAW_GAP){
        const rs=realSize(parent);
        const cx=(Number(parent.x)||0)+rs.w/2;
        const cy=(Number(parent.y)||0)+rs.h/2;
        const pw=Math.max(.25,Number(parent.w)||.25);
        const ph=Math.max(.25,Number(parent.h)||.25);
        const rot=((Number(parent.rotation)||0)%360+360)%360;

        const edgeInfo={
          top:{ex:0,ey:-ph/2,nx:0,ny:-1,length:pw,rotation:rot,name:'Splash',kind:'splash'},
          right:{ex:pw/2,ey:0,nx:1,ny:0,length:ph,rotation:(rot+90)%360,name:'Splash',kind:'splash'},
          bottom:{ex:0,ey:ph/2,nx:0,ny:1,length:pw,rotation:rot,name:'Splash',kind:'splash'},
          left:{ex:-pw/2,ey:0,nx:-1,ny:0,length:ph,rotation:(rot+90)%360,name:'Splash',kind:'splash'}
        }[edge]||null;
        if(!edgeInfo)return null;

        const edgeVec=rotateVec(edgeInfo.ex,edgeInfo.ey,rot);
        const normal=rotateVec(edgeInfo.nx,edgeInfo.ny,rot);
        const center={
          x:cx+edgeVec.x+normal.x*(gap+height/2),
          y:cy+edgeVec.y+normal.y*(gap+height/2)
        };

        const temp={w:edgeInfo.length,h:height,rotation:edgeInfo.rotation};
        const crs=realSize(temp);
        return {
          ...edgeInfo,
          x:center.x-crs.w/2,
          y:center.y-crs.h/2
        };
      }

      function splashPlacementDistance(piece,place){
        if(!piece||!place)return Infinity;
        return Math.hypot((Number(piece.x)||0)-place.x,(Number(piece.y)||0)-place.y);
      }

      function splashPlacementFitsCanvas(piece,place){
        if(!piece||!place)return false;
        const temp={w:place.length,h:Math.max(.25,Number(piece.h)||DEFAULT_SPLASH_HEIGHT),rotation:place.rotation};
        const rs=realSize(temp);
        return place.x>=-0.001&&place.y>=-0.001&&place.x+rs.w<=state.cw+0.001&&place.y+rs.h<=state.ch+0.001;
      }

      function isLinkedSplash(piece){
        return !!(isBacksplashPiece(piece)&&piece.attachment?.kind==='backsplash'&&piece.attachment?.parentPieceId);
      }

      function ensureSplashSnapState(piece,parent){
        if(!isLinkedSplash(piece)||!parent)return false;
        if(typeof piece.attachment.snapped==='boolean')return piece.attachment.snapped;
        const edge=piece.attachment.sourceEdge;
        const h=Math.max(.25,Number(piece.h)||DEFAULT_SPLASH_HEIGHT);
        const currentPlace=splashPlacement(parent,edge,h,SPLASH_DRAW_GAP);
        const legacyPlace=splashPlacement(parent,edge,h,LEGACY_SPLASH_DRAW_GAP);
        const closeCurrent=splashPlacementDistance(piece,currentPlace)<=1.1;
        const closeLegacy=splashPlacementDistance(piece,legacyPlace)<=1.1;
        piece.attachment.snapped=!!(closeCurrent||closeLegacy);
        return piece.attachment.snapped;
      }

      function isSplashSnappedToParent(piece){
        if(!isLinkedSplash(piece))return false;
        const parent=state.pieces.find(candidate=>candidate.id===piece.attachment.parentPieceId);
        return !!(parent&&ensureSplashSnapState(piece,parent));
      }

      function tryResnapSplash(piece,tolerance=1){
        if(!isLinkedSplash(piece))return false;
        const parent=state.pieces.find(candidate=>candidate.id===piece.attachment.parentPieceId);
        if(!parent)return false;
        const place=splashPlacement(parent,piece.attachment.sourceEdge,Math.max(.25,Number(piece.h)||DEFAULT_SPLASH_HEIGHT));
        if(!place||!splashPlacementFitsCanvas(piece,place)||splashPlacementDistance(piece,place)>tolerance)return false;
        piece.attachment.snapped=true;
        piece.x=round3(place.x);
        piece.y=round3(place.y);
        piece.rotation=place.rotation;
        return true;
      }

      function syncLinkedSplashRelationships(){
        state.pieces.forEach(piece=>{
          if(!isLinkedSplash(piece)||piece.attachment.linkedLength===false)return;
          const parent=state.pieces.find(candidate=>candidate.id===piece.attachment.parentPieceId);
          if(!parent)return;
          const edge=piece.attachment.sourceEdge;
          const nextLength=(edge==='left'||edge==='right')
            ? Math.max(.25,Number(parent.h)||.25)
            : Math.max(.25,Number(parent.w)||.25);
          piece.w=round3(nextLength);

          if(!ensureSplashSnapState(piece,parent))return;
          const place=splashPlacement(parent,edge,Math.max(.25,Number(piece.h)||DEFAULT_SPLASH_HEIGHT));
          if(!place||!splashPlacementFitsCanvas(piece,place)){
            piece.attachment.snapped=false;
            return;
          }
          piece.x=round3(place.x);
          piece.y=round3(place.y);
          piece.rotation=place.rotation;
        });
      }

      function createBacksplashFromEdge(parent,edge){
        if(!parent||isBacksplashPiece(parent))return null;
        const existing=splashChildForEdge(parent.id,edge);
        if(existing)return existing;

        const place=splashPlacement(parent,edge,DEFAULT_SPLASH_HEIGHT);
        if(!place)return null;

        const topLayer=Math.max(0,...state.pieces.map(x=>Number(x.layer)||0))+1;
        const child={
          id:uid(),
          name:place.name,
          w:round3(place.length),
          h:DEFAULT_SPLASH_HEIGHT,
          x:place.x,
          y:place.y,
          rotation:place.rotation,
          color:parent.color||'#ffffff',
          fillOpacity:Number.isFinite(Number(parent.fillOpacity))?Number(parent.fillOpacity):1,
          noFill:!!parent.noFill,
          layer:topLayer,
          rTL:false,rTR:false,rBL:false,rBR:false,
          cornerRadii:{tl:0,tr:0,br:0,bl:0},
          pieceSeams:[],
          sinks:[],
          edgeProfiles:{top:'none',right:'none',bottom:'none',left:'none'},
          pieceType:'backsplash',
          tags:['backsplash'],
          splashKind:place.kind,
          splashHeight:DEFAULT_SPLASH_HEIGHT,
          attachment:{
            kind:'backsplash',
            parentPieceId:parent.id,
            sourceEdge:edge,
            linkedLength:true,
            snapped:true
          }
        };
        clampToCanvas(child);
        if(splashPlacementDistance(child,place)>.05)child.attachment.snapped=false;

        const parentIndex=state.pieces.findIndex(piece=>piece.id===parent.id);
        let insertAt=parentIndex>=0?parentIndex+1:state.pieces.length;
        while(insertAt<state.pieces.length && state.pieces[insertAt]?.attachment?.parentPieceId===parent.id){
          insertAt++;
        }
        state.pieces.splice(insertAt,0,child);

        // Keep the parent active so Hold-S can add several sides in one motion.
        selectOnly(parent.id);
        renderList();
        updateInspector();
        sinksUI?.refresh?.();

        const allSplashEdgesComplete=['top','right','bottom','left']
          .every(side=>!!splashChildForEdge(parent.id,side));
        if(allSplashEdgesComplete&&(activeMomentaryTool()==='splash'||activeMomentaryTool()==='splashAll')){
          cancelPlacementTools({redraw:false});
        }

        draw();
        scheduleSave();
        pushHistory();
        return child;
      }

      function roundedRectPathCorners(x, y, w, h, r){
        const rtl=r.tl||0, rtr=r.tr||0, rbr=r.br||0, rbl=r.bl||0;
        return `M${x+rtl},${y} H${x+w-rtr} Q${x+w},${y} ${x+w},${y+rtr} V${y+h-rbr} Q${x+w},${y+h} ${x+w-rbr},${y+h} H${x+rbl} Q${x},${y+h} ${x},${y+h-rbl} V${y+rtl} Q${x},${y} ${x+rtl},${y} Z`;
      }

      const EDGE_PROFILE_VALUES=['none','flat','quarter','bevel','half-bull','full-bull','ogee','miter','seam'];
      const EDGE_PROFILE_LABELS={
        none:'None',
        flat:'Flat',
        quarter:'Quarter',
        bevel:'Bevel',
        'half-bull':'Half bull',
        'full-bull':'Full bull',
        ogee:'Ogee',
        miter:'Miter',
        seam:'Seam'
      };

      function normalizeEdgeProfile(value){
        return EDGE_PROFILE_VALUES.includes(value)?value:'none';
      }

      function migratePieceGeometry(piece){
        if(!piece)return piece;

        if(!piece.edgeProfiles||typeof piece.edgeProfiles!=='object')piece.edgeProfiles={};
        ['top','right','bottom','left'].forEach(side=>{
          piece.edgeProfiles[side]=normalizeEdgeProfile(piece.edgeProfiles[side]);
        });

        if(!piece.cornerRadii||typeof piece.cornerRadii!=='object'){
          piece.cornerRadii={
            tl:piece.rTL?1:0,
            tr:piece.rTR?1:0,
            br:piece.rBR?1:0,
            bl:piece.rBL?1:0
          };
        }

        const maxR=Math.max(0,Math.min(Number(piece.w)||0,Number(piece.h)||0)/2);
        ['tl','tr','br','bl'].forEach(key=>{
          piece.cornerRadii[key]=round3(clamp(Number(piece.cornerRadii[key])||0,0,maxR));
        });

        // Keep legacy booleans synchronized for compatibility with old snapshots.
        piece.rTL=piece.cornerRadii.tl>0;
        piece.rTR=piece.cornerRadii.tr>0;
        piece.rBR=piece.cornerRadii.br>0;
        piece.rBL=piece.cornerRadii.bl>0;
        return piece;
      }

      function pieceCornerPixels(piece){
        migratePieceGeometry(piece);
        return {
          tl:i2p(piece.cornerRadii.tl),
          tr:i2p(piece.cornerRadii.tr),
          br:i2p(piece.cornerRadii.br),
          bl:i2p(piece.cornerRadii.bl)
        };
      }

      function migratePieceSeams(piece){
        if(!Array.isArray(piece.pieceSeams)) piece.pieceSeams=[];
        piece.pieceSeams=piece.pieceSeams.map(ps=>{
          const orientation=ps?.orientation==='horizontal'?'horizontal':'vertical';
          const validRefs=orientation==='horizontal'?['top','bottom']:['left','right'];
          return {
            id: ps?.id || uid(),
            orientation,
            reference: validRefs.includes(ps?.reference)?ps.reference:validRefs[0],
            offset: Math.max(0,Number(ps?.offset)||0)
          };
        });
        return piece.pieceSeams;
      }

      function clampPieceSeams(piece){
        migratePieceSeams(piece);
        piece.pieceSeams.forEach(ps=>{
          const max=ps.orientation==='horizontal'?Math.max(0,Number(piece.h)||0):Math.max(0,Number(piece.w)||0);
          ps.offset=round3(clamp(Number(ps.offset)||0,0,max));
        });
        return piece.pieceSeams;
      }

      // Ensure any piece has a sinks array
      function normalizeSinkFaucetSettings(sink){
        if(!sink)return sink;
        const setback=Number(sink.faucetSetback);
        const diameter=Number(sink.faucetHoleDiameter);
        const spacing=Number(sink.faucetHoleSpacing);
        sink.faucetSetback=Number.isFinite(setback)&&setback>=0?Math.round(setback*1000)/1000:DEFAULT_FAUCET_SETBACK;
        sink.faucetHoleDiameter=Number.isFinite(diameter)&&diameter>0?Math.round(diameter*1000)/1000:DEFAULT_FAUCET_HOLE_DIAMETER;
        sink.faucetHoleSpacing=Number.isFinite(spacing)&&spacing>0?Math.round(spacing*1000)/1000:DEFAULT_FAUCET_SPACING;
        return sink;
      }
      function faucetHoleSetback(sink){
        const n=Number(sink?.faucetSetback);
        return Number.isFinite(n)&&n>=0?n:DEFAULT_FAUCET_SETBACK;
      }
      function faucetHoleDiameter(sink){
        const n=Number(sink?.faucetHoleDiameter);
        return Number.isFinite(n)&&n>0?n:DEFAULT_FAUCET_HOLE_DIAMETER;
      }
      function faucetHoleSpacing(sink){
        const n=Number(sink?.faucetHoleSpacing);
        return Number.isFinite(n)&&n>0?n:DEFAULT_FAUCET_SPACING;
      }
      function migratePieceForSinks(piece){
        if (!Array.isArray(piece.sinks)) piece.sinks = [];
        piece.sinks.forEach(sink=>{
          if(!sink.id)sink.id='sink_'+uid();
          normalizeSinkFaucetSettings(sink);
        });
        return piece;
      }
      function migrateAllSinkSettings(){
        (state.layouts||[]).forEach(layout=>(layout?.pieces||[]).forEach(migratePieceForSinks));
      }

      function applyModelToSink(sink, model){
        if (!model) return;
        sink.modelId = model.id;
        sink.shape   = model.shape;
        sink.w       = model.w;
        sink.h       = model.h;
        sink.cornerR = clamp(model.cornerR ?? 0, 0, 4);
      }

      // Reference side establishes the sink's base orientation. The faucet pattern
      // lives on the sink's local "back" (-Y), so opposite reference sides must
      // differ by 180° even when the bowl itself looks visually unchanged.
      function sinkReferenceAngle(side){
        if(side==='left')return 90;
        if(side==='back')return 180;
        if(side==='right')return 270;
        return 0; // front
      }

      // Compute the sink center & angle in piece space.
      function sinkPoseOnPiece(piece, sink){
        const side    = sink.side || 'front';
        const setback = (sink.setback ?? SINK_STANDARD_SETBACK);
        let cx, cy;
        const angle=(piece.rotation||0)+sinkReferenceAngle(side)+(sink.rotation||0);

        if (side === 'front'){ cx = sink.centerline;                        cy = piece.h - (setback + sink.h/2); }
        else if (side === 'back'){ cx = sink.centerline;                    cy = setback + sink.h/2; }
        else if (side === 'left'){ cx = setback + sink.h/2;                 cy = sink.centerline; }
        else /* right */        { cx = piece.w - (setback + sink.h/2);      cy = sink.centerline; }
      
        const sinkRect = { x: cx - sink.w/2, y: cy - sink.h/2, w: sink.w, h: sink.h };
        return { cx, cy, angle, sinkRect };
      }

      function holeOffsetFromSinkEdge(sink){ return faucetHoleSetback(sink); }

      function svgEl(tag, attrs){
        const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        return n;
      }
      // rename the sinks one:
      function roundedRectPathSimple(x, y, w, h, r){
        if (r<=0) return `M${x},${y} h${w} v${h} h${-w} z`;
        r = Math.min(r, w/2, h/2);
        const x2 = x+w, y2 = y+h;
        return [
          `M${x+r},${y}`, `H${x2-r}`, `A${r},${r} 0 0 1 ${x2},${y+r}`,
          `V${y2-r}`,     `A${r},${r} 0 0 1 ${x2-r},${y2}`,
          `H${x+r}`,      `A${r},${r} 0 0 1 ${x},${y2-r}`,
          `V${y+r}`,      `A${r},${r} 0 0 1 ${x+r},${y}`, 'Z'
        ].join(' ');
      }

      // ===== Multi-overlay drawing (place right above draw) =====
      function ensureOverlaysGroup(){
        let g = svg.querySelector('#lc-overlays');
        if (!g){
          g = document.createElementNS('http://www.w3.org/2000/svg','g');
          g.id = 'lc-overlays';
          g.setAttribute('pointer-events','none');
          svg.appendChild(g);
        }
        return g;
      }

      // Ensure a <defs> node exists to hold our mask
      function ensureDefs(){
        let d = svg.querySelector('defs#ov-defs');
        if (!d){
          d = document.createElementNS(svgNS,'defs');
          d.id = 'ov-defs';
          svg.appendChild(d);
        }
        return d;
      }

      // Build a mask that shows piece areas (white) MINUS sink & faucet cutouts (black)
      function buildOverlayMaskSubtractingCutouts(){
        const defs = ensureDefs();

        // rebuild fresh each draw
        let mask = svg.querySelector('#ov-mask');
        if (mask) mask.remove();

        mask = document.createElementNS(svgNS,'mask');
        mask.id = 'ov-mask';
        mask.setAttribute('maskUnits','userSpaceOnUse');

        // For each piece, draw its outline in white, then its cutouts in black
        const pieces = state.pieces || [];
        for (const p of pieces){
          // Piece geometry
          const rs  = realSize(p);                         // rotated bbox (inches)
          const x   = i2p(p.x), y = i2p(p.y);
          const BW  = i2p(rs.w), BH = i2p(rs.h);
          const W0  = i2p(p.w),  H0 = i2p(p.h);            // unrotated piece size (px)
          const cx  = x + BW/2,  cy = y + BH/2;            // center of rotation
          const r   = pieceCornerPixels(p);

          let rotRaw = Number(p.rotation||0);
          if (!Number.isFinite(rotRaw)) rotRaw = 0;
          const rot  = ((rotRaw % 360) + 360) % 360;

          // Group with the piece rotation applied
          const gPiece = document.createElementNS(svgNS,'g');
          if (rot) gPiece.setAttribute('transform', `rotate(${rot}, ${cx}, ${cy})`);

          // Outer piece area = WHITE (visible)
          const outer = document.createElementNS(svgNS,'path');
          outer.setAttribute('d', roundedRectPathCorners(cx - W0/2, cy - H0/2, W0, H0, r));
          outer.setAttribute('fill', '#fff');
          gPiece.appendChild(outer);

          // --- Cutouts (Sinks + Faucet holes) = BLACK (hidden) ---
          if (Array.isArray(p.sinks) && p.sinks.length){
            const leftPx = cx - W0/2;
            const topPx  = cy - H0/2;

            for (const sink of p.sinks){
              const { cx: sxIn, cy: syIn } = sinkPoseOnPiece(p, sink);
              const sx = leftPx + i2p(sxIn);
              const sy = topPx  + i2p(syIn);

              const localAngle = sinkReferenceAngle(sink.side||'front') + (sink.rotation || 0);

              const gSink = document.createElementNS(svgNS,'g');
              gSink.setAttribute('transform', `translate(${sx}, ${sy}) rotate(${localAngle})`);

              // sink opening
              if (sink.shape === 'oval'){
                const e = document.createElementNS(svgNS,'ellipse');
                e.setAttribute('cx', '0'); e.setAttribute('cy', '0');
                e.setAttribute('rx', String(i2p(sink.w/2)));
                e.setAttribute('ry', String(i2p(sink.h/2)));
                e.setAttribute('fill', '#000'); // cut out
                gSink.appendChild(e);
              } else {
                const w2 = i2p(sink.w/2), h2 = i2p(sink.h/2);
                const rr = i2p(Math.min(sink.cornerR || 0, 4));
                const d  = roundedRectPathSimple(-w2, -h2, w2*2, h2*2, rr);
                const path = document.createElementNS(svgNS,'path');
                path.setAttribute('d', d);
                path.setAttribute('fill', '#000'); // cut out
                gSink.appendChild(path);
              }

              // faucet holes (cut out)
              if (Array.isArray(sink.faucets) && sink.faucets.length){
                const holeOffsetIn = holeOffsetFromSinkEdge(sink);
                const holeSpacingIn = faucetHoleSpacing(sink);
                const holeRadiusIn = faucetHoleDiameter(sink)/2;
                const startIndex = -4;
                sink.faucets.forEach(idx => {
                  const x = (startIndex + idx) * i2p(holeSpacingIn);
                  const y = - (i2p(sink.h/2) + i2p(holeOffsetIn));
                  const c = document.createElementNS(svgNS,'circle');
                  c.setAttribute('cx', String(x));
                  c.setAttribute('cy', String(y));
                  c.setAttribute('r',  String(i2p(holeRadiusIn)));
                  c.setAttribute('fill', '#000'); // cut out
                  gSink.appendChild(c);
                });
              }

              gPiece.appendChild(gSink);
            }
          }

          mask.appendChild(gPiece);
        }

        defs.appendChild(mask);
        return 'url(#ov-mask)';
      }


      function buildOverlayClipPath(){
        const defs = ensureDefs();
        let cp = svg.querySelector('#ov-clip');
        if (cp) cp.remove();
        cp = document.createElementNS(svgNS,'clipPath');
        cp.id = 'ov-clip';
        cp.setAttribute('clipPathUnits','userSpaceOnUse');

        const pieces = state.pieces || [];
        for (const p of pieces){
          // build the same rounded rect used in draw(), apply rotation around piece center
          const rs = realSize(p);
          const x = i2p(p.x), y=i2p(p.y), W=i2p(rs.w), H=i2p(rs.h);
          const W0 = i2p(p.w), H0 = i2p(p.h);
          const cx = x + W/2, cy = y + H/2;
          const r = pieceCornerPixels(p);
          let rot = Number(p.rotation||0);
          if (!Number.isFinite(rot)) rot = 0;

          const path = document.createElementNS(svgNS,'path');
          path.setAttribute('d', roundedRectPathCorners(cx - W0/2, cy - H0/2, W0, H0, r));
          if (rot % 360) path.setAttribute('transform', `rotate(${rot}, ${cx}, ${cy})`);
          // fill is irrelevant for clipping, but we set it anyway
          path.setAttribute('fill', '#fff');
          cp.appendChild(path);
        }

        defs.appendChild(cp);
        return 'url(#ov-clip)';
      }



      function drawOverlays(){
        const g = ensureOverlaysGroup();
        g.innerHTML = '';

        const L = ensureOverlaysOnLayout(activeLayout());
        const arr = (L && Array.isArray(L.overlays)) ? L.overlays : [];
        if (!L || !arr.length) {
          g.removeAttribute('mask');
          g.removeAttribute('clip-path');
          return;
        }

        // Clip to pieces minus cutouts (when enabled)
        if (L.overlayClip && state.workspace!=='slab'){
          const maskRef = buildOverlayMaskSubtractingCutouts();
          g.setAttribute('mask', maskRef);
          g.removeAttribute('clip-path'); // ensure we don't have both
        } else {
          g.removeAttribute('mask');
          g.removeAttribute('clip-path');
        }

        const pxPerIn = state.scale;
        for (const o of arr){
          if (!o || !o.visible || !o.dataURL) continue;

          const wpx = Math.max(1, Math.round((o.slabW || 1) * pxPerIn));
          const hpx = Math.max(1, Math.round((o.slabH || 1) * pxPerIn));
          const xpx = Math.round((o.x || 0) * pxPerIn);
          const ypx = Math.round((o.y || 0) * pxPerIn);

          // subtle backdrop (still shows under the image, also masked)
          const r = document.createElementNS(svgNS,'rect');
          r.setAttribute('x', xpx); r.setAttribute('y', ypx);
          r.setAttribute('width', wpx); r.setAttribute('height', hpx);
          r.setAttribute('fill', '#000'); r.setAttribute('opacity', 0.04);
          g.appendChild(r);

          const im = document.createElementNS(svgNS,'image');
          im.setAttributeNS('http://www.w3.org/1999/xlink','href', o.dataURL);
          im.setAttribute('x', xpx); im.setAttribute('y', ypx);
          im.setAttribute('width', wpx); im.setAttribute('height', hpx);
          im.setAttribute('preserveAspectRatio','none');
          im.setAttribute('opacity', o.opacity == null ? 1 : o.opacity); // default 100%
          g.appendChild(im);
        }
      }

      function beginOverlayCanvasDrag(ev,index){
        if(activeMomentaryTool()!=='overlay')return;
        const L=ensureOverlaysOnLayout(activeLayout());
        const o=L?.overlays?.[index];
        if(!o||!o.visible||!o.dataURL)return;

        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation?.();

        selectOverlay(index);

        const startPt=svgPoint(ev);
        const startX=Number(o.x)||0;
        const startY=Number(o.y)||0;
        let moved=false;
        let finished=false;

        const root=document.querySelector('.lite-cad');
        root?.classList.add('lc-overlay-dragging');

        const move=mv=>{
          if(finished||activeMomentaryTool()!=='overlay')return;
          const q=svgPoint(mv);
          const nextX=round3(startX+p2i(q.x-startPt.x));
          const nextY=round3(startY+p2i(q.y-startPt.y));
          const beforeX=o.x,beforeY=o.y;
          o.x=nextX;
          o.y=nextY;
          clampOverlayToCanvas(o);
          if(Math.abs(o.x-beforeX)>.001||Math.abs(o.y-beforeY)>.001)moved=true;
          draw();
        };

        const finish=()=>{
          if(finished)return;
          finished=true;
          document.removeEventListener('pointermove',move,true);
          document.removeEventListener('pointerup',finish,true);
          document.removeEventListener('pointercancel',finish,true);
          root?.classList.remove('lc-overlay-dragging');
          finishActiveOverlayCanvasDrag=()=>{};

          renderOverlayList?.();
          syncOverlayUI?.();
          updateInspector?.();
          draw();

          if(moved){
            scheduleSave?.();
            pushHistory?.();
          }
        };

        finishActiveOverlayCanvasDrag=finish;
        document.addEventListener('pointermove',move,true);
        document.addEventListener('pointerup',finish,true);
        document.addEventListener('pointercancel',finish,true);

        // Selection is visible immediately, even before the pointer moves.
        draw();
      }

      function drawOverlayInteractionLayer(){
        if(activeMomentaryTool()!=='overlay')return;

        const L=ensureOverlaysOnLayout(activeLayout());
        const arr=Array.isArray(L?.overlays)?L.overlays:[];
        if(!L||!arr.length)return;

        const g=document.createElementNS(svgNS,'g');
        g.setAttribute('class','lc-overlay-interaction-layer');
        g.setAttribute('data-momentary-layer','overlay');

        arr.forEach((o,index)=>{
          if(!o||!o.visible||!o.dataURL)return;

          const hit=document.createElementNS(svgNS,'rect');
          hit.setAttribute('class','lc-overlay-hit'+(L.ovSel===index?' is-selected':''));
          hit.setAttribute('data-overlay-hit','1');
          hit.setAttribute('data-overlay-index',String(index));
          hit.setAttribute('x',i2p(Number(o.x)||0));
          hit.setAttribute('y',i2p(Number(o.y)||0));
          hit.setAttribute('width',Math.max(1,i2p(Number(o.slabW)||1)));
          hit.setAttribute('height',Math.max(1,i2p(Number(o.slabH)||1)));
          hit.setAttribute('vector-effect','non-scaling-stroke');
          hit.setAttribute('pointer-events','all');
          hit.addEventListener('pointerdown',ev=>beginOverlayCanvasDrag(ev,index));
          g.appendChild(hit);
        });

        svg.appendChild(g);
      }

      function drawSplashInteractionLayer(){
        const tool=activeMomentaryTool();
        if(tool!=='splash'&&tool!=='splashAll')return;

        const parents=tool==='splashAll'
          ? state.pieces.filter(piece=>!isBacksplashPiece(piece))
          : [splashParentForTool()].filter(Boolean);
        if(!parents.length)return;

        const master=document.createElementNS(svgNS,'g');
        master.setAttribute('class','lc-splash-interaction-layer');
        master.setAttribute('data-momentary-layer','splash');

        parents.forEach(parent=>{
          const rs=realSize(parent);
          const W0=i2p(Math.max(.25,Number(parent.w)||.25));
          const H0=i2p(Math.max(.25,Number(parent.h)||.25));
          const cx=i2p((Number(parent.x)||0)+rs.w/2);
          const cy=i2p((Number(parent.y)||0)+rs.h/2);
          const left=cx-W0/2;
          const top=cy-H0/2;
          const rot=((Number(parent.rotation)||0)%360+360)%360;
          const splashPx=i2p(DEFAULT_SPLASH_HEIGHT);
          const gapPx=i2p(SPLASH_DRAW_GAP);
          const hitPad=Math.max(11,Math.min(18,state.scale*1.15));

          const layer=document.createElementNS(svgNS,'g');
          layer.setAttribute('class','lc-splash-piece-options');
          layer.setAttribute('data-splash-parent-id',parent.id);
          if(rot)layer.setAttribute('transform',`rotate(${rot} ${cx} ${cy})`);

          const defs={
            top:{hit:[left,top-hitPad,W0,hitPad*2],line:[left,top,left+W0,top],preview:[left,top-gapPx-splashPx,W0,splashPx]},
            right:{hit:[left+W0-hitPad,top,hitPad*2,H0],line:[left+W0,top,left+W0,top+H0],preview:[left+W0+gapPx,top,splashPx,H0]},
            bottom:{hit:[left,top+H0-hitPad,W0,hitPad*2],line:[left,top+H0,left+W0,top+H0],preview:[left,top+H0+gapPx,W0,splashPx]},
            left:{hit:[left-hitPad,top,hitPad*2,H0],line:[left,top,left,top+H0],preview:[left-gapPx-splashPx,top,splashPx,H0]}
          };

          ['top','right','bottom','left'].forEach(edge=>{
            const occupied=!!splashChildForEdge(parent.id,edge);
            const spec=defs[edge];
            const opt=document.createElementNS(svgNS,'g');
            opt.setAttribute('class','lc-splash-edge-option'+(occupied?' is-occupied':''));
            opt.setAttribute('data-splash-edge',edge);

            const preview=document.createElementNS(svgNS,'rect');
            preview.setAttribute('class','lc-splash-edge-preview');
            preview.setAttribute('x',spec.preview[0]);preview.setAttribute('y',spec.preview[1]);
            preview.setAttribute('width',Math.max(1,spec.preview[2]));preview.setAttribute('height',Math.max(1,spec.preview[3]));
            preview.setAttribute('rx','1');preview.setAttribute('pointer-events','none');

            const line=document.createElementNS(svgNS,'line');
            line.setAttribute('class','lc-splash-edge-line');
            line.setAttribute('x1',spec.line[0]);line.setAttribute('y1',spec.line[1]);
            line.setAttribute('x2',spec.line[2]);line.setAttribute('y2',spec.line[3]);
            line.setAttribute('vector-effect','non-scaling-stroke');line.setAttribute('pointer-events','none');

            const hit=document.createElementNS(svgNS,'rect');
            hit.setAttribute('class','lc-splash-edge-hit');
            hit.setAttribute('data-splash-edge-hit','1');
            hit.setAttribute('data-splash-edge',edge);
            hit.setAttribute('x',spec.hit[0]);hit.setAttribute('y',spec.hit[1]);
            hit.setAttribute('width',Math.max(1,spec.hit[2]));hit.setAttribute('height',Math.max(1,spec.hit[3]));
            hit.setAttribute('fill','transparent');hit.setAttribute('pointer-events','all');
            hit.setAttribute('aria-label',occupied?'Splash already attached':'Add 4 inch splash');

            const title=document.createElementNS(svgNS,'title');
            title.textContent=occupied?'Splash already attached to this edge':'Click to add a 4" splash';
            hit.appendChild(title);

            hit.addEventListener('pointerdown',ev=>{
              ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.();
              if(occupied)return;
              createBacksplashFromEdge(parent,edge);
            });

            opt.append(preview,line,hit);
            layer.appendChild(opt);
          });

          master.appendChild(layer);
        });

        svg.appendChild(master);
      }




function createSinkRadiusAnnotation(piece,sink,corner){
  const L=cur();
  const target=sinkRadiusCornerTarget(piece,sink,corner);
  if(!L||!target)return null;
  migratePieceForSinks(piece);
  if(!Array.isArray(L.notes))L.notes=[];
  if(!Array.isArray(L.lines))L.lines=[];

  const existing=sinkRadiusAnnotationForCorner(piece.id,sink.id,corner,L);
  if(existing){
    state.selectedNoteId=null;
    state.selectedLineId=null;
    state.selectedDimId=null;
    selectOnly(piece.id);
    renderList();renderNoteList();renderLineList();updateInspector();draw();
    return existing;
  }

  const noteDistance=10;
  let nx=round3(clamp(target.x+target.outward.x*noteDistance,0,state.cw));
  let ny=round3(clamp(target.y+target.outward.y*noteDistance,0,state.ch));
  if(Math.hypot(nx-target.x,ny-target.y)<3){
    nx=round3(clamp(target.x-target.outward.x*noteDistance,0,state.cw));
    ny=round3(clamp(target.y-target.outward.y*noteDistance,0,state.ch));
  }

  const note={
    id:uid(),
    x:nx,y:ny,
    text:radiusLabelText(target.radius),
    annotationType:'radius',
    radiusRef:{kind:'sink',pieceId:piece.id,sinkId:sink.id,corner,autoText:true}
  };
  const line={
    id:uid(),
    name:'Sink Radius Leader',
    x1:nx,y1:ny,
    x2:target.x,y2:target.y,
    style:'solid',
    color:'#111111',
    thickness:2,
    startCap:'none',
    endCap:'arrow',
    attachedNoteId:note.id,
    attachedEnd:'start',
    annotationType:'radius',
    radiusRef:{kind:'sink',pieceId:piece.id,sinkId:sink.id,corner}
  };
  L.notes.push(note);
  L.lines.push(line);

  state.selectedNoteId=null;
  state.selectedLineId=null;
  state.selectedDimId=null;
  selectOnly(piece.id);
  renderList();renderNoteList();renderLineList();updateInspector();draw();scheduleSave();pushHistory();
  return note;
}


      function drawRadiusInteractionLayer(){
        const tool=activeMomentaryTool();
        if((tool!=='radius'&&tool!=='radiusAll')||state.workspace==='slab')return;

        const parents=tool==='radiusAll'
          ? state.pieces.filter(piece=>!isBacksplashPiece(piece))
          : [splashParentForTool()].filter(Boolean);
        if(!parents.length)return;

        const master=document.createElementNS(svgNS,'g');
        master.setAttribute('class','lc-radius-interaction-layer');
        master.setAttribute('data-momentary-layer','radius');

        parents.forEach(parent=>{
          migratePieceGeometry(parent);
          migratePieceForSinks(parent);

          const rs=realSize(parent);
          const W0=i2p(Math.max(.25,Number(parent.w)||.25));
          const H0=i2p(Math.max(.25,Number(parent.h)||.25));
          const cx=i2p((Number(parent.x)||0)+rs.w/2);
          const cy=i2p((Number(parent.y)||0)+rs.h/2);
          const left=cx-W0/2,top=cy-H0/2,right=left+W0,bottom=top+H0;
          const rot=((Number(parent.rotation)||0)%360+360)%360;

          const pieceLayer=document.createElementNS(svgNS,'g');
          pieceLayer.setAttribute('class','lc-radius-piece-options');
          pieceLayer.setAttribute('data-radius-parent-id',parent.id);
          if(rot)pieceLayer.setAttribute('transform',`rotate(${rot} ${cx} ${cy})`);

          const defs={
            tl:r=>`M ${left} ${top+r} Q ${left} ${top} ${left+r} ${top}`,
            tr:r=>`M ${right-r} ${top} Q ${right} ${top} ${right} ${top+r}`,
            br:r=>`M ${right} ${bottom-r} Q ${right} ${bottom} ${right-r} ${bottom}`,
            bl:r=>`M ${left+r} ${bottom} Q ${left} ${bottom} ${left} ${bottom-r}`
          };

          ['tl','tr','br','bl'].forEach(corner=>{
            const radius=Math.max(0,Number(parent.cornerRadii?.[corner])||0);
            if(radius<=0)return;
            const radiusPx=Math.max(3,i2p(radius));
            const existing=radiusAnnotationForCorner(parent.id,corner);
            const option=document.createElementNS(svgNS,'g');
            option.setAttribute('class','lc-radius-corner-option'+(existing?' is-labeled':''));
            option.setAttribute('data-radius-corner',corner);

            const preview=document.createElementNS(svgNS,'path');
            preview.setAttribute('class','lc-radius-corner-preview');
            preview.setAttribute('d',defs[corner](radiusPx));
            preview.setAttribute('fill','none');
            preview.setAttribute('vector-effect','non-scaling-stroke');
            preview.setAttribute('pointer-events','none');

            const hit=document.createElementNS(svgNS,'path');
            hit.setAttribute('class','lc-radius-corner-hit');
            hit.setAttribute('data-radius-corner-hit','1');
            hit.setAttribute('data-radius-corner',corner);
            hit.setAttribute('d',defs[corner](radiusPx));
            hit.setAttribute('fill','none');
            hit.setAttribute('stroke','rgba(0,0,0,.001)');
            hit.setAttribute('stroke-width','18');
            hit.setAttribute('vector-effect','non-scaling-stroke');
            hit.setAttribute('pointer-events','stroke');
            hit.setAttribute('aria-label',existing?'Select existing radius label':'Create radius label');

            const title=document.createElementNS(svgNS,'title');
            title.textContent=existing
              ? `Radius ${fmtCanvasInches(radius)} already labeled — click to select`
              : `Click to label radius ${fmtCanvasInches(radius)}`;
            hit.appendChild(title);
            hit.addEventListener('pointerdown',ev=>{
              ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.();
              createRadiusAnnotation(parent,corner);
            });

            option.append(preview,hit);
            pieceLayer.appendChild(option);
          });

          const pieceLeft=cx-W0/2;
          const pieceTop=cy-H0/2;
          parent.sinks.forEach(sink=>{
            if(sink.shape==='oval'||!(Number(sink.cornerR)>0))return;
            const radius=Math.max(0,Math.min(Number(sink.cornerR)||0,Number(sink.w||0)/2,Number(sink.h||0)/2));
            if(radius<=0)return;
            const radiusPx=Math.max(3,i2p(radius));
            const pose=sinkPoseOnPiece(parent,sink);
            const sx=pieceLeft+i2p(pose.cx);
            const sy=pieceTop+i2p(pose.cy);
            const localAngle=sinkReferenceAngle(sink.side||'front')+(Number(sink.rotation)||0);
            const sinkG=document.createElementNS(svgNS,'g');
            sinkG.setAttribute('class','lc-radius-sink-options');
            sinkG.setAttribute('transform',`translate(${sx} ${sy}) rotate(${localAngle})`);

            const sw=i2p(Number(sink.w)||0),sh=i2p(Number(sink.h)||0);
            const sl=-sw/2,st=-sh/2,sr=sw/2,sb=sh/2;
            const sinkDefs={
              tl:r=>`M ${sl} ${st+r} Q ${sl} ${st} ${sl+r} ${st}`,
              tr:r=>`M ${sr-r} ${st} Q ${sr} ${st} ${sr} ${st+r}`,
              br:r=>`M ${sr} ${sb-r} Q ${sr} ${sb} ${sr-r} ${sb}`,
              bl:r=>`M ${sl+r} ${sb} Q ${sl} ${sb} ${sl} ${sb-r}`
            };

            ['tl','tr','br','bl'].forEach(corner=>{
              const existing=sinkRadiusAnnotationForCorner(parent.id,sink.id,corner);
              const option=document.createElementNS(svgNS,'g');
              option.setAttribute('class','lc-radius-corner-option lc-radius-sink-corner-option'+(existing?' is-labeled':''));
              option.setAttribute('data-radius-corner',corner);

              const preview=document.createElementNS(svgNS,'path');
              preview.setAttribute('class','lc-radius-corner-preview');
              preview.setAttribute('d',sinkDefs[corner](radiusPx));
              preview.setAttribute('fill','none');
              preview.setAttribute('vector-effect','non-scaling-stroke');
              preview.setAttribute('pointer-events','none');

              const hit=document.createElementNS(svgNS,'path');
              hit.setAttribute('class','lc-radius-corner-hit');
              hit.setAttribute('data-radius-corner-hit','1');
              hit.setAttribute('data-radius-corner',corner);
              hit.setAttribute('d',sinkDefs[corner](radiusPx));
              hit.setAttribute('fill','none');
              hit.setAttribute('stroke','rgba(0,0,0,.001)');
              hit.setAttribute('stroke-width','16');
              hit.setAttribute('vector-effect','non-scaling-stroke');
              hit.setAttribute('pointer-events','stroke');
              hit.setAttribute('aria-label',existing?'Select existing sink radius label':'Create sink radius label');

              const title=document.createElementNS(svgNS,'title');
              title.textContent=existing
                ? `Sink radius ${fmtCanvasInches(radius)} already labeled — click to select`
                : `Click to label sink radius ${fmtCanvasInches(radius)}`;
              hit.appendChild(title);
              hit.addEventListener('pointerdown',ev=>{
                ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.();
                createSinkRadiusAnnotation(parent,sink,corner);
              });

              option.append(preview,hit);
              sinkG.appendChild(option);
            });
            pieceLayer.appendChild(sinkG);
          });

          master.appendChild(pieceLayer);
        });

        svg.appendChild(master);
      }

      // ------- Direct piece dimension editing -------
      function parseDimInches(raw){
        const s = String(raw ?? '').trim().replace(/["']/g, '');
        if (!s) return null;
        const mixed = s.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
        if (mixed) {
          const whole = Number(mixed[1]), den = Number(mixed[3]);
          if (!den) return null;
          const frac = Number(mixed[2]) / den;
          return whole < 0 ? whole - frac : whole + frac;
        }
        const fraction = s.match(/^(-?)(\d+)\/(\d+)$/);
        if (fraction) {
          const den = Number(fraction[3]);
          if (!den) return null;
          return (fraction[1] === '-' ? -1 : 1) * Number(fraction[2]) / den;
        }
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      }

      let activeDimEditor = null;

      // Native Fullscreen renders only the fullscreen element and its descendants.
      // Keep temporary HTML editors inside the CAD fullscreen tree so they remain
      // visible/focusable; normal + Theater modes can continue using document.body.
      function inlineEditorHost(){
        const fs=document.fullscreenElement;
        if(fs instanceof Element && fs.contains(svg))return fs;
        return document.body;
      }

      function openInlineDimEditor(textEl, initialValue, onCommit){
        if (activeDimEditor) activeDimEditor.cancel();

        const r = textEl.getBoundingClientRect();
        const input = document.createElement('input');
        input.type = 'text';
        input.value = initialValue;
        input.setAttribute('aria-label', 'Edit dimension');
        Object.assign(input.style, {
          position:'fixed',
          left:(r.left + r.width/2) + 'px',
          top:(r.top + r.height/2) + 'px',
          transform:'translate(-50%, -50%)',
          width:'82px',
          padding:'4px 6px',
          border:'2px solid #2563eb',
          borderRadius:'4px',
          background:'#fff',
          color:'#111',
          font:'13px system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
          textAlign:'center',
          zIndex:'2147483647',
          boxSizing:'border-box'
        });
        inlineEditorHost().appendChild(input);

        let closed = false;
        const cleanup = ()=>{
          if (closed) return;
          closed = true;
          document.removeEventListener('pointerdown', outside, true);
          input.remove();
          if (activeDimEditor?.input === input) activeDimEditor = null;
        };
        const commit = ()=>{
          if (closed) return;
          const raw = input.value;
          if (onCommit(raw) === false) {
            input.focus();
            input.select();
            return;
          }
          cleanup();
        };
        const cancel = ()=> cleanup();
        const outside = e=>{ if (e.target !== input) commit(); };

        input.addEventListener('keydown', e=>{
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
        input.addEventListener('pointerdown', e=>e.stopPropagation());
        setTimeout(()=>document.addEventListener('pointerdown', outside, true),0);
        activeDimEditor = { input, commit, cancel };
        input.focus();
        input.select();
      }

      function openInlineNoteEditor(textEl,initialValue,onCommit){if(activeDimEditor)activeDimEditor.cancel();const r=textEl.getBoundingClientRect(),ta=document.createElement('textarea');ta.value=initialValue||'';Object.assign(ta.style,{position:'fixed',left:(r.left+r.width/2)+'px',top:(r.top+r.height/2)+'px',transform:'translate(-50%, -50%)',width:'220px',minHeight:'64px',padding:'6px 8px',border:'2px solid #2563eb',borderRadius:'4px',background:'#fff',color:'#111',font:'13px system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif',zIndex:'2147483647',boxSizing:'border-box',resize:'both'});inlineEditorHost().appendChild(ta);let closed=false;const cleanup=()=>{if(closed)return;closed=true;document.removeEventListener('pointerdown',outside,true);ta.remove();if(activeDimEditor?.input===ta)activeDimEditor=null;};const commit=()=>{if(closed)return;if(onCommit(ta.value)===false){ta.focus();return;}cleanup();};const cancel=()=>cleanup();const outside=e=>{if(e.target!==ta)commit();};ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();commit();}else if(e.key==='Escape'){e.preventDefault();cancel();}});ta.addEventListener('pointerdown',e=>e.stopPropagation());setTimeout(()=>document.addEventListener('pointerdown',outside,true),0);activeDimEditor={input:ta,commit,cancel};ta.focus();ta.select();}

      function enablePieceDimEdit(textEl, piece, prop, promptLabel){
        if(prop==='w'&&isLinkedSplash(piece)&&piece.attachment?.linkedLength!==false){
          textEl.style.cursor='default';
          textEl.setAttribute('pointer-events','none');
          return;
        }
        textEl.style.cursor = activeToolCursor() || 'text';
        textEl.setAttribute('pointer-events', 'all');
        textEl.addEventListener('pointerdown', e => { if(!(state.dimTool||state.lineTool||state.noteTool)) e.stopPropagation(); });
        textEl.addEventListener('dblclick', e => {
          e.preventDefault(); e.stopPropagation();
          openInlineDimEditor(textEl, fmt3(piece[prop]), raw=>{
            const next = parseDimInches(raw);
            if (!(next > 0)) return false;
            piece[prop] = round3(next);
            clampToCanvas(piece);
            clampSlabPlacement(piece);
            draw(); updateInspector(); sinksUI?.refresh?.(); scheduleSave(); pushHistory();
            return true;
          });
        });
      }

      function enableSinkCenterlineEdit(textEl, sink, piece){
        textEl.style.cursor = 'text';
        textEl.setAttribute('pointer-events', 'all');
        textEl.addEventListener('pointerdown', e => e.stopPropagation());
        textEl.addEventListener('dblclick', e => {
          e.preventDefault(); e.stopPropagation();
          openInlineDimEditor(textEl, fmt3(sink.centerline ?? 0), raw=>{
            const next = parseDimInches(raw);
            const axisMax = (sink.side === 'left' || sink.side === 'right') ? (piece.h || 0) : (piece.w || 0);
            if (next == null || next < 0 || next > axisMax) return false;
            sink.centerline = round3(next);
            draw(); updateInspector(); sinksUI?.refresh?.(); scheduleSave(); pushHistory();
            return true;
          });
        });
      }

      // ------- Drawing -------
      function draw(){
        syncCanvasWorkspaceTabs();
        if(state.workspace==='slab'){
          drawSlabWorkspace();
          return;
        }
        syncLinkedSplashRelationships();
        syncCanvasToolCursor();
        renderEstimateSummary?.();
        const Wpx = i2p(state.cw), Hpx = i2p(state.ch);
        svg.setAttribute('width', Wpx);
        svg.setAttribute('height', Hpx);
        svg.setAttribute('viewBox', `0 0 ${Wpx} ${Hpx}`);
        while(svg.firstChild) svg.removeChild(svg.firstChild);

        const border = document.createElementNS('http://www.w3.org/2000/svg','rect');
        border.classList.add('lc-canvas-background');
        border.setAttribute('x',0); border.setAttribute('y',0);
        border.setAttribute('width', Wpx); border.setAttribute('height', Hpx);
        // Keep the SVG's actual/export background white. CSS warms it only on screen.
        border.setAttribute('fill','#fff'); border.setAttribute('stroke','#e5e7eb');
        svg.appendChild(border);

        // Raw slab imagery lives in the SLAB workspace. In LAYOUT it is mapped
        // back into individual pieces by appendMappedSlabMaterial().
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

        sorted.forEach((p)=>{
          migratePieceGeometry(p);
          const rs = realSize(p);
          const x = i2p(p.x), y=i2p(p.y), W=i2p(rs.w), H=i2p(rs.h);
          const fg = pickTextColor(p.color || '#ffffff');

          const corners = pieceCornerPixels(p);

          // rotation-aware drawing
          const W0 = i2p(p.w), H0 = i2p(p.h);
          const BW = W, BH = H;
          const cx = x + BW/2, cy = y + BH/2;

          const gg = document.createElementNS(svgNS, 'g');
          let rotRaw = Number(p.rotation||0);
          if (!Number.isFinite(rotRaw)) rotRaw = 0;
          let rot = ((rotRaw % 360) + 360) % 360;
          if (rot) gg.setAttribute('transform', `rotate(${rot}, ${cx}, ${cy})`);

          // main path
          const path = document.createElementNS('http://www.w3.org/2000/svg','path');
          path.setAttribute('d', roundedRectPathCorners(cx - W0/2, cy - H0/2, W0, H0, corners));
          applyPieceFill(path, p);             // << fill/opacity applied here
          path.setAttribute('stroke', '#000');
          path.setAttribute('stroke-width', '1');
          gg.appendChild(path);
          appendMappedSlabMaterial(gg,p,path.getAttribute('d'),cx,cy);

          // selected outline
          if (isSelected(p.id)) {
            const outline = document.createElementNS(svgNS, 'path');
            outline.setAttribute('d', roundedRectPathCorners(cx - W0/2, cy - H0/2, W0, H0, corners));
            outline.setAttribute('fill', 'none');
            outline.setAttribute('stroke', '#0ea5e9');
            outline.setAttribute('stroke-width', '2');
            outline.setAttribute('vector-effect', 'non-scaling-stroke');
            outline.setAttribute('pointer-events', 'none');
            gg.appendChild(outline);
          }

          // After you append the visible path to `gg`
          const hit = document.createElementNS('http://www.w3.org/2000/svg','path');
          hit.setAttribute('d', path.getAttribute('d'));
          hit.setAttribute('fill', '#000');
          hit.setAttribute('fill-opacity', '0.001'); // effectively invisible
          hit.setAttribute('stroke', 'none');
          hit.setAttribute('pointer-events', 'fill'); // only the interior
          hit.setAttribute('class', 'lc-hitbox');
          gg.appendChild(hit);

          // --- Sinks (inside rotated group)
          if (Array.isArray(p.sinks) && p.sinks.length){
            const leftPx = cx - W0/2;
            const topPx  = cy - H0/2;
            const sinksG = document.createElementNS('http://www.w3.org/2000/svg','g');
            sinksG.setAttribute('id', `sinks-for-${p.id}`);

            p.sinks.forEach((sink,sinkIndex) => {
              const { cx: sxIn, cy: syIn } = sinkPoseOnPiece(p, sink);
              const sx = leftPx + i2p(sxIn);
              const sy = topPx  + i2p(syIn);
              const localAngle = sinkReferenceAngle(sink.side||'front') + (sink.rotation || 0);

              const gSink = document.createElementNS('http://www.w3.org/2000/svg','g');
              gSink.setAttribute('transform', `translate(${sx}, ${sy}) rotate(${localAngle})`);

              if (sink.shape === 'oval'){
                const e = svgEl('ellipse', {
                  cx: 0, cy: 0,
                  rx: i2p(sink.w/2), ry: i2p(sink.h/2),
                  fill: 'none', stroke: '#333', 'stroke-width': 1
                });
                gSink.appendChild(e);
              } else {
                const w2 = i2p(sink.w/2), h2 = i2p(sink.h/2);
                const r  = i2p(Math.min(sink.cornerR || 0, 4));
                const d  = roundedRectPathSimple(-w2, -h2, w2*2, h2*2, r);
                gSink.appendChild(svgEl('path', { d, fill: 'none', stroke: '#333', 'stroke-width': 1 }));
              }

              if (Array.isArray(sink.faucets) && sink.faucets.length){
                const holeOffsetIn = holeOffsetFromSinkEdge(sink);
                const holeSpacingIn = faucetHoleSpacing(sink);
                const holeRadiusIn = faucetHoleDiameter(sink)/2;
                const startIndex = -4;
                sink.faucets.forEach(idx => {
                  const x = (startIndex + idx) * i2p(holeSpacingIn);
                  const y = - (i2p(sink.h/2) + i2p(holeOffsetIn));
                  gSink.appendChild(svgEl('circle', {
                    cx: x, cy: y, r: i2p(holeRadiusIn),
                    fill: 'none', stroke: '#333', 'stroke-width': 1
                  }));
                });
              }

              if (state.showSinkCenterlines){
                const dimStroke='#000';
                const tick=6;
                const pieceDimOffset=12;
                const laneGap=18;

                const xL=leftPx, xR=leftPx+W0;
                const yT=topPx, yB=topPx+H0;
                const side=['front','back','left','right'].includes(sink.side)?sink.side:'front';
                const laneIndex=p.sinks
                  .slice(0,sinkIndex)
                  .filter(other=>(['front','back','left','right'].includes(other.side)?other.side:'front')===side)
                  .length;

                if(side==='front'||side==='back'){
                  const xCL=xL+i2p(sxIn);
                  const yDim=side==='back'
                    ? yT-pieceDimOffset-laneGap*(laneIndex+1)
                    : yB+pieceDimOffset+laneGap*laneIndex;

                  const line=svgEl('line',{
                    x1:xL,y1:yDim,x2:xCL,y2:yDim,
                    stroke:dimStroke,'vector-effect':'non-scaling-stroke'
                  });
                  const t1=svgEl('line',{
                    x1:xL,y1:yDim-tick,x2:xL,y2:yDim+tick,
                    stroke:dimStroke,'vector-effect':'non-scaling-stroke'
                  });
                  const t2=svgEl('line',{
                    x1:xCL,y1:yDim-tick,x2:xCL,y2:yDim+tick,
                    stroke:dimStroke,'vector-effect':'non-scaling-stroke'
                  });

                  const clLabel=svgEl('text',{
                    x:(xL+xCL)/2,
                    y:side==='back'?yDim-4:yDim+14,
                    'text-anchor':'middle',
                    'font-size':'12',
                    fill:'#111'
                  });
                  clLabel.textContent=`${fmtCanvasInches(sxIn)} CL`;
                  enableSinkCenterlineEdit(clLabel,sink,p);
                  gg.append(line,t1,t2,clLabel);
                }else{
                  const yCL=yT+i2p(syIn);
                  const xDim=side==='left'
                    ? xL-pieceDimOffset-laneGap*(laneIndex+1)
                    : xR+pieceDimOffset+laneGap*laneIndex;

                  const line=svgEl('line',{
                    x1:xDim,y1:yT,x2:xDim,y2:yCL,
                    stroke:dimStroke,'vector-effect':'non-scaling-stroke'
                  });
                  const t1=svgEl('line',{
                    x1:xDim-tick,y1:yT,x2:xDim+tick,y2:yT,
                    stroke:dimStroke,'vector-effect':'non-scaling-stroke'
                  });
                  const t2=svgEl('line',{
                    x1:xDim-tick,y1:yCL,x2:xDim+tick,y2:yCL,
                    stroke:dimStroke,'vector-effect':'non-scaling-stroke'
                  });

                  const clLabel=svgEl('text',{
                    x:side==='left'?xDim-4:xDim+4,
                    y:(yT+yCL)/2,
                    'text-anchor':side==='left'?'end':'start',
                    'dominant-baseline':'middle',
                    'font-size':'12',
                    fill:'#111'
                  });
                  clLabel.textContent=`${fmtCanvasInches(syIn)} CL`;
                  enableSinkCenterlineEdit(clLabel,sink,p);
                  gg.append(line,t1,t2,clLabel);
                }
              }

              sinksG.appendChild(gSink);
            });

            gg.appendChild(sinksG);
          }

          // Piece-based seams: exact offsets in the piece's own coordinate system.
          if(Array.isArray(p.pieceSeams) && p.pieceSeams.length){
            const seamLeft=cx-W0/2;
            const seamTop=cy-H0/2;
            const seamG=document.createElementNS(svgNS,'g');
            seamG.setAttribute('data-piece-seams',p.id);
            seamG.setAttribute('pointer-events','none');

            p.pieceSeams.forEach(ps=>{
              const orientation=ps.orientation==='horizontal'?'horizontal':'vertical';
              const max=orientation==='horizontal'?p.h:p.w;
              const off=clamp(Number(ps.offset)||0,0,max);
              let x1,y1,x2,y2;

              if(orientation==='vertical'){
                const xIn=ps.reference==='right'?p.w-off:off;
                const xPx=seamLeft+i2p(xIn);
                x1=xPx;y1=seamTop;x2=xPx;y2=seamTop+H0;
              }else{
                const yIn=ps.reference==='bottom'?p.h-off:off;
                const yPx=seamTop+i2p(yIn);
                x1=seamLeft;y1=yPx;x2=seamLeft+W0;y2=yPx;
              }

              seamG.appendChild(svgEl('line',{
                x1,y1,x2,y2,
                stroke:'#111',
                'stroke-width':2,
                'stroke-dasharray':'8 4',
                'vector-effect':'non-scaling-stroke'
              }));
            });

            gg.appendChild(seamG);
          }

         // append rotated geometry group to a piece container g (for pointerdown)
          const gPiece = document.createElementNS('http://www.w3.org/2000/svg','g');
          gPiece.setAttribute('data-id', p.id);
          if(!(state.dimTool||state.lineTool||state.noteTool))gPiece.style.cursor='move';
          gPiece.appendChild(gg);

          // Splash-tagged pieces have independent label + label-dimension visibility.
          const splashTagged=isBacksplashPiece(p);
          const showThisPieceLabel=splashTagged?!!state.showSplashLabels:!!state.showLabels;
          const showThisLabelDims=splashTagged?!!state.showSplashLabelDims:!!state.showLabelDims;
          if (showThisPieceLabel) {
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', x + W/2);
            text.setAttribute('y', y + H/2 + (showThisLabelDims?-6:0));
            text.setAttribute('text-anchor', 'middle');
            if(!showThisLabelDims)text.setAttribute('dominant-baseline','middle');
            text.setAttribute('font-size', '12');
            text.setAttribute('fill', fg);

            const t1 = document.createElementNS(svgNS, 'tspan');
            t1.setAttribute('x', x + W/2);
            t1.setAttribute('dy', 0);
            t1.textContent = p.name || 'Piece';

            const t2 = document.createElementNS(svgNS, 'tspan');
            t2.setAttribute('x', x + W/2);
            t2.setAttribute('dy', 14);
            t2.textContent = `${fmtCanvasInches(p.w)} × ${fmtCanvasInches(p.h)}${(p.rotation ? ` · ${p.rotation}°` : ``)}`;

            text.appendChild(t1);
            if(showThisLabelDims) text.appendChild(t2);
            gPiece.appendChild(text);
          }

          const showThisPieceDims=splashTagged?!!state.showSplashDims:!!state.showDims;
          if (showThisPieceDims) {
            const dimStroke = '#000';
            const off = 12;
            const tick = 6;
            const snappedLinkedSplash=splashTagged&&isSplashSnappedToParent(p);
            const suppressSharedLongDim=!!(snappedLinkedSplash&&state.showDims);

            let topSplashExtra=0;
            let leftSplashExtra=0;
            if(!splashTagged){
              const topSplash=splashChildForEdge(p.id,'top');
              const leftSplash=splashChildForEdge(p.id,'left');
              if(topSplash&&isSplashSnappedToParent(topSplash)){
                topSplashExtra=i2p(SPLASH_DRAW_GAP+Math.max(.25,Number(topSplash.h)||DEFAULT_SPLASH_HEIGHT));
              }
              if(leftSplash&&isSplashSnappedToParent(leftSplash)){
                leftSplashExtra=i2p(SPLASH_DRAW_GAP+Math.max(.25,Number(leftSplash.h)||DEFAULT_SPLASH_HEIGHT));
              }
            }

            const dims = document.createElementNS('http://www.w3.org/2000/svg','g');
            dims.setAttribute('class','dims');

            // WIDTH (top of unrotated rect)
            const yTop = (cy - H0/2) - off - topSplashExtra;
            const xL = cx - W0/2;
            const xR = cx + W0/2;

            const wLine = document.createElementNS('http://www.w3.org/2000/svg','line');
            wLine.setAttribute('x1', xL); wLine.setAttribute('y1', yTop);
            wLine.setAttribute('x2', xR); wLine.setAttribute('y2', yTop);
            wLine.setAttribute('stroke', dimStroke);
            wLine.setAttribute('vector-effect','non-scaling-stroke');

            const wt1 = document.createElementNS('http://www.w3.org/2000/svg','line');
            wt1.setAttribute('x1', xL); wt1.setAttribute('y1', yTop - tick);
            wt1.setAttribute('x2', xL); wt1.setAttribute('y2', yTop + tick);
            wt1.setAttribute('stroke', dimStroke);
            wt1.setAttribute('vector-effect','non-scaling-stroke');

            const wt2 = document.createElementNS('http://www.w3.org/2000/svg','line');
            wt2.setAttribute('x1', xR); wt2.setAttribute('y1', yTop - tick);
            wt2.setAttribute('x2', xR); wt2.setAttribute('y2', yTop + tick);
            wt2.setAttribute('stroke', dimStroke);
            wt2.setAttribute('vector-effect','non-scaling-stroke');

            const wT = document.createElementNS('http://www.w3.org/2000/svg','text');
            wT.setAttribute('x', cx);
            wT.setAttribute('y', yTop - 4);
            wT.setAttribute('text-anchor','middle');
            wT.setAttribute('font-size','12');
            wT.setAttribute('fill','#111');
            wT.textContent = fmtCanvasInches(p.w);
            enablePieceDimEdit(wT, p, 'w', 'Piece width (inches)');

            // HEIGHT (left of unrotated rect)
            const xLeft = (cx - W0/2) - off - leftSplashExtra;
            const yT = cy - H0/2;
            const yB = cy + H0/2;

            const hLine = document.createElementNS('http://www.w3.org/2000/svg','line');
            hLine.setAttribute('x1', xLeft); hLine.setAttribute('y1', yT);
            hLine.setAttribute('x2', xLeft); hLine.setAttribute('y2', yB);
            hLine.setAttribute('stroke', dimStroke);
            hLine.setAttribute('vector-effect','non-scaling-stroke');

            const ht1 = document.createElementNS('http://www.w3.org/2000/svg','line');
            ht1.setAttribute('x1', xLeft - tick); ht1.setAttribute('y1', yT);
            ht1.setAttribute('x2', xLeft + tick); ht1.setAttribute('y2', yT);
            ht1.setAttribute('stroke', dimStroke);
            ht1.setAttribute('vector-effect','non-scaling-stroke');

            const ht2 = document.createElementNS('http://www.w3.org/2000/svg','line');
            ht2.setAttribute('x1', xLeft - tick); ht2.setAttribute('y1', yB);
            ht2.setAttribute('x2', xLeft + tick); ht2.setAttribute('y2', yB);
            ht2.setAttribute('stroke', dimStroke);
            ht2.setAttribute('vector-effect','non-scaling-stroke');

            const hT = document.createElementNS('http://www.w3.org/2000/svg','text');
            hT.setAttribute('x', xLeft - 4);
            hT.setAttribute('y', cy);
            hT.setAttribute('text-anchor','end');
            hT.setAttribute('dominant-baseline','middle');
            hT.setAttribute('font-size','12');
            hT.setAttribute('fill','#111');
            hT.textContent = fmtCanvasInches(p.h);
            enablePieceDimEdit(hT, p, 'h', 'Piece depth / height (inches)');

            // A snapped linked splash shares its long measurement with the parent.
            // If parent Piece Dims are visible, suppress that duplicate long dimension.
            if(!suppressSharedLongDim)dims.append(wLine, wt1, wt2, wT);
            dims.append(hLine, ht1, ht2, hT);

            // append to rotated group so ticks/labels rotate with the piece
            gg.appendChild(dims);
          }

          // --- Edge profile labels on each side ---
          if (state.showEdgeProfiles && p.edgeProfiles) {
            const edges = p.edgeProfiles;

            const labelsG = document.createElementNS(svgNS, 'g');
            labelsG.setAttribute('class', 'edge-profiles');
            labelsG.setAttribute('pointer-events', 'none');

            function addEdgeLabel(text, x, y, anchor, baseline, rotation) {
              const profile=normalizeEdgeProfile(text);
              if (profile === 'none') return;
              const t = document.createElementNS(svgNS, 'text');
              t.setAttribute('x', x);
              t.setAttribute('y', y);
              t.setAttribute('text-anchor', anchor || 'middle');
              if (baseline) t.setAttribute('dominant-baseline', baseline);
              if (rotation) t.setAttribute('transform', `rotate(${rotation} ${x} ${y})`);
              t.setAttribute('font-size', '11');
              t.setAttribute('fill', '#111');
              t.textContent = EDGE_PROFILE_LABELS[profile] || profile;
              labelsG.appendChild(t);
            }

            const MARGIN = 8; // px inside from piece edge

            // Top: normal reading direction
            addEdgeLabel(edges.top, cx, (cy - H0/2) + MARGIN, 'middle', 'middle', 0);

            // Bottom: upside down
            addEdgeLabel(edges.bottom, cx, (cy + H0/2) - MARGIN, 'middle', 'middle', 180);

            // Left: reads upward
            addEdgeLabel(edges.left, (cx - W0/2) + MARGIN, cy, 'middle', 'middle', -90);

            // Right: reads downward
            addEdgeLabel(edges.right, (cx + W0/2) - MARGIN, cy, 'middle', 'middle', 90);

            gg.appendChild(labelsG);
          }


          // selection / drag
          gPiece.addEventListener('pointerdown', (e)=>{
            if(state.lineTool || state.dimTool || state.noteTool) return; // active drawing tool owns the canvas
            const pt = svgPoint(e);                 // SVG px
            const startI = { x: p2i(pt.x), y: p2i(pt.y) }; // inches

            if(e.metaKey || e.ctrlKey){
              toggleSelect(p.id);
            } else {
              if(!isSelected(p.id)) selectOnly(p.id);
            }
            renderList();
            updateInspector();
            sinksUI?.refresh();

            const start = state.pieces
              .filter(x => isSelected(x.id))
              .map(x => ({ id:x.id, x0:x.x, y0:x.y, rs: realSize(x) }));

            // Snapped splash children move with their selected parent even when
            // the child itself is not selected, so include them in drag bounds.
            const startIds=new Set(start.map(gp=>gp.id));
            const boundItems=[...start];
            start.forEach(gp=>{
              state.pieces.forEach(child=>{
                if(!isLinkedSplash(child)||!isSplashSnappedToParent(child))return;
                if(child.attachment.parentPieceId!==gp.id||startIds.has(child.id))return;
                boundItems.push({id:child.id,x0:child.x,y0:child.y,rs:realSize(child),boundOnly:true});
              });
            });

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            boundItems.forEach(gp => {
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

            state.drag = {
              startI,
              group:start,
              snapIgnoreIds:boundItems.map(item=>item.id),
              limits,
              snappedX:false,
              snappedY:false,
              guideX:null,
              guideY:null
            };
            gPiece.setPointerCapture && gPiece.setPointerCapture(e.pointerId);
            e.preventDefault();
          });

          svg.appendChild(gPiece);
        });

        // ----- Manual dimension lines (per-layout) -----
        const L = cur();
        if (L && Array.isArray(L.dims) && L.dims.length && state.showManualDims) {
          const svgNS = 'http://www.w3.org/2000/svg';
          const gAll = document.createElementNS(svgNS, 'g');
          gAll.setAttribute('class', 'dims-manual');

          const offPx = 12; // perpendicular offset in px from the measured segment

            L.dims.forEach(d => {
              const x1px = i2p(d.x1);
              const y1px = i2p(d.y1);
              const x2px = i2p(d.x2);
              const y2px = i2p(d.y2);

              const dx = x2px - x1px;
              const dy = y2px - y1px;
              const lenPx = Math.sqrt(dx*dx + dy*dy) || 1;

              // Unit direction along the dimension line
              const ux = dx / lenPx;
              const uy = dy / lenPx;
              // Unit normal (perpendicular) – this is what we offset along
              const nx = -uy;
              const ny = ux;

              // Perpendicular offset in pixels (store on the dim; default 12px)
              const offPx = (typeof d.offsetPx === 'number' ? d.offsetPx : 12);

              // Base offset vector
              const ox = nx * offPx;
              const oy = ny * offPx;

              const midx = (x1px + x2px) / 2;
              const midy = (y1px + y2px) / 2;

              const distIn = Math.sqrt(
                Math.pow(d.x2 - d.x1, 2) + Math.pow(d.y2 - d.y1, 2)
              );
              const label = fmtCanvasInches(distIn);

              const g = document.createElementNS(svgNS, 'g');
              g.setAttribute('class', 'dim-line');
              g.setAttribute('data-dimid', d.id);
              if (state.selectedDimId === d.id) g.classList.add('selected');

              // --- select dimension; offset dragging is handled by the number label ---
              g.addEventListener('pointerdown',(ev)=>{if(state.dimTool)return;ev.stopPropagation();state.selectedDimId=d.id;state.selectedLineId=null;state.selectedNoteId=null;clearSelection();renderDimList();updateInspector();draw();});

              // --- extension lines ---
              const makeExt = (x, y) => {
                const l = document.createElementNS(svgNS, 'line');
                l.setAttribute('x1', x);
                l.setAttribute('y1', y);
                l.setAttribute('x2', x + ox);
                l.setAttribute('y2', y + oy);
                l.setAttribute('stroke', '#111');
                l.setAttribute('vector-effect', 'non-scaling-stroke');
                return l;
              };

              const ext1 = makeExt(x1px, y1px);
              const ext2 = makeExt(x2px, y2px);

              // --- dimension line itself ---
              const dl = document.createElementNS(svgNS, 'line');
              dl.setAttribute('x1', x1px + ox);
              dl.setAttribute('y1', y1px + oy);
              dl.setAttribute('x2', x2px + ox);
              dl.setAttribute('y2', y2px + oy);
              dl.setAttribute('stroke', '#111');
              dl.setAttribute('vector-effect', 'non-scaling-stroke');
              if (state.selectedDimId === d.id) {
                dl.setAttribute('stroke-width', '2');
              }

              // --- label: pushed further off the line so it doesn’t overlap ---
              const LABEL_GAP_PX = 10; // fixed gap outside the dimension line
              // Follow the sign of the offset: dimensions above/left get their
              // number above/left; dimensions below/right get it below/right.
              const labelSide = offPx < 0 ? -1 : 1;
              const lx = midx + ox + nx * LABEL_GAP_PX * labelSide;
              const ly = midy + oy + ny * LABEL_GAP_PX * labelSide;

              const t = document.createElementNS(svgNS, 'text');
              t.setAttribute('x', lx);
              t.setAttribute('y', ly);
              t.setAttribute('dominant-baseline', 'middle');
              t.setAttribute('text-anchor', 'middle');
              t.setAttribute('font-size', '14');
              t.textContent=label;
              t.style.cursor=activeToolCursor() || 'grab';
              t.style.pointerEvents='all'; // inline style overrides CSS rule that disables dim text clicks
              t.setAttribute('stroke','rgba(0,0,0,0.001)');
              t.setAttribute('stroke-width','12');
              t.setAttribute('paint-order','stroke fill');
              let dimLabelClickTimer=null;
              t.addEventListener('pointerdown',ev=>{
                if(state.dimTool)return;
                ev.preventDefault();ev.stopPropagation();state.selectedDimId=d.id;state.selectedLineId=null;state.selectedNoteId=null;clearSelection();renderDimList();renderLineList();renderNoteList();
                const start=svgPoint(ev),startOff=(typeof d.offsetPx==='number'?d.offsetPx:12);let moved=false,lastOff=startOff,raf=0;
                const move=mv=>{const q=svgPoint(mv);if(Math.hypot(q.x-start.x,q.y-start.y)<=3&&!moved)return;moved=true;if(dimLabelClickTimer){clearTimeout(dimLabelClickTimer);dimLabelClickTimer=null;}lastOff=Math.max(-300,Math.min(300,startOff+(q.x-start.x)*nx+(q.y-start.y)*ny));if(!raf)raf=requestAnimationFrame(()=>{raf=0;d.offsetPx=lastOff;draw();});};
                const up=()=>{window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);if(moved){d.offsetPx=lastOff;draw();scheduleSave();pushHistory();}else{renderDimList();updateInspector();dimLabelClickTimer=setTimeout(()=>{dimLabelClickTimer=null;draw();},350);}};
                window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);
              });
              t.addEventListener('dblclick',ev=>{ev.preventDefault();ev.stopPropagation();if(dimLabelClickTimer){clearTimeout(dimLabelClickTimer);dimLabelClickTimer=null;}openInlineDimEditor(t,distIn.toFixed(2),raw=>{const next=parseDimInches(raw);if(!(next>0))return false;const vx=d.x2-d.x1,vy=d.y2-d.y1,oldLen=Math.sqrt(vx*vx+vy*vy)||1;d.x2=round3(d.x1+(vx/oldLen)*next);d.y2=round3(d.y1+(vy/oldLen)*next);draw();renderDimList();updateInspector();scheduleSave();pushHistory();return true;});});

              // angle in inches space (for upright text)
              let angleDeg = Math.atan2(d.y2 - d.y1, d.x2 - d.x1) * 180 / Math.PI;
              if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;
              t.setAttribute('transform', `rotate(${angleDeg}, ${lx}, ${ly})`);

              g.append(ext1, ext2, dl, t);
              const makeDimHandle=(which,x,y)=>{const h=document.createElementNS(svgNS,'circle');h.setAttribute('cx',x);h.setAttribute('cy',y);h.setAttribute('r','5');h.setAttribute('fill','#fff');h.setAttribute('stroke','#2563eb');h.setAttribute('stroke-width','2');h.setAttribute('vector-effect','non-scaling-stroke');h.style.cursor='crosshair';h.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();state.selectedDimId=d.id;state.selectedLineId=null;state.selectedNoteId=null;clearSelection();renderDimList();renderLineList();renderNoteList();const move=mv=>{const q=svgPoint(mv),raw={x:p2i(q.x),y:p2i(q.y)};let sn=snapDimPoint(raw);const fixed=which===1?{x:d.x2,y:d.y2}:{x:d.x1,y:d.y1};sn=constrainDrawPoint(fixed,sn,!!mv.shiftKey||drawShiftHeld);if(which===1){d.x1=round3(sn.x);d.y1=round3(sn.y);}else{d.x2=round3(sn.x);d.y2=round3(sn.y);}draw();const tol=.001;state.pieces.forEach(p=>{const rs=realSize(p),xs=[p.x,p.x+rs.w],ys=[p.y,p.y+rs.h];xs.forEach(v=>{if(Math.abs(sn.x-v)<tol)svg.appendChild(svgEl('line',{x1:i2p(v),y1:0,x2:i2p(v),y2:i2p(state.workspace==='slab'?slabCanvasH():state.ch),stroke:'#2563eb','stroke-width':1,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke','pointer-events':'none'}));});ys.forEach(v=>{if(Math.abs(sn.y-v)<tol)svg.appendChild(svgEl('line',{x1:0,y1:i2p(v),x2:i2p(state.workspace==='slab'?slabCanvasW():state.cw),y2:i2p(v),stroke:'#2563eb','stroke-width':1,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke','pointer-events':'none'}));});});};const up=()=>{svg.removeEventListener('pointermove',move);svg.removeEventListener('pointerup',up);svg.removeEventListener('pointercancel',up);renderDimList();updateInspector();scheduleSave();pushHistory();};svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);});g.appendChild(h);};if(state.selectedDimId===d.id){makeDimHandle(1,x1px,y1px);makeDimHandle(2,x2px,y2px);}
              gAll.appendChild(g);
            });


          svg.appendChild(gAll);
        }


        syncRadiusAnnotations();
        drawLines();
        drawNotes();
        renderDimList();
        renderNoteList();
        renderLineList();

        meta.textContent = `Design Canvas: ${state.cw}" × ${state.ch}" · Grid ${state.grid}" · Scale ${state.scale}px/in`;
        drawToolPreview();
        drawOverlayInteractionLayer();
        drawSplashInteractionLayer();
        drawRadiusInteractionLayer();
      }


      // ------- UI builders -------
      function colorStack(value, onPreview, onCommit){
        const wrap = document.createElement('div'); wrap.className='lc-color-stack';
        const input = document.createElement('input'); input.type='color'; input.className='lc-color-ghost'; input.value=value||'#DBEAFE';
        const sw = document.createElement('span'); sw.className='lc-swatch'; sw.style.setProperty('--c', value||'#DBEAFE');
        let committedValue=input.value;
        input.addEventListener('input', ()=>{
          sw.style.setProperty('--c', input.value);
          onPreview?.(input.value);
        });
        input.addEventListener('change', ()=>{
          if(input.value===committedValue)return;
          committedValue=input.value;
          onCommit?.(input.value);
        });
        wrap.appendChild(input); wrap.appendChild(sw); return {wrap,input,sw};
        drawToolPreview();
      }

      function mkBtn(label, variant, onClick){ const b=document.createElement('button'); b.className='lc-btn sm '+(variant||''); b.textContent=label; b.onclick=onClick; return b; }

      function makeSidebarDragHandle(label='item'){
        const handle=document.createElement('span');
        handle.className='lc-sidebar-drag';
        handle.title='Drag to reorder '+label;
        handle.setAttribute('aria-label','Drag to reorder '+label);
        handle.innerHTML='<svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3" cy="4" r="1.1"/><circle cx="9" cy="4" r="1.1"/><circle cx="3" cy="9" r="1.1"/><circle cx="9" cy="9" r="1.1"/><circle cx="3" cy="14" r="1.1"/><circle cx="9" cy="14" r="1.1"/></svg>';
        return handle;
      }

      function pieceItem(p, i){
        const div = document.createElement('div');
        div.dataset.pieceId=p.id;
        const isSplash=isBacksplashPiece(p);
        const linkedSplashRow=!!(isSplash&&p.attachment?.parentPieceId);
        if(linkedSplashRow && ['Backsplash','Left Sidesplash','Right Sidesplash'].includes(String(p.name||'').trim())){
          p.name='Splash';
        }
        const hasLinkedChildren=!linkedSplashRow&&state.pieces.some(child=>isLinkedSplash(child)&&child.attachment?.parentPieceId===p.id);
        div.className = 'lc-item nav lc-nav-entity-row' +
          (linkedSplashRow?' lc-backsplash-nav-piece':'') +
          (hasLinkedChildren?' lc-piece-has-linked-children':'') +
          (isSelected(p.id) ? ' selected' : '');
        if(linkedSplashRow)div.dataset.parentPieceId=p.attachment.parentPieceId;

        const bg = p.color || '#DBEAFE';
        div.style.setProperty('--c', bg);
        div.style.setProperty('--fg', pickTextColor(bg));

        div.addEventListener('click', (e)=>{
          if(e.target.closest('button,input')) return;

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
          renderList(); renderDimList(); renderNoteList(); updateInspector(); sinksUI?.refresh(); draw();
        });

        const label=document.createElement('div');
        label.className='lc-nav-main';

        const title=document.createElement('div');
        title.className='lc-nav-title';
        title.textContent=String(p.name||'').trim()||`Piece ${i+1}`;
        title.title=title.textContent;

        const meta=document.createElement('div');
        meta.className='lc-nav-meta';
        meta.textContent=(isSplash?'Splash · ':'')+`${fmtCanvasInches(Number(p.w)||0)} × ${fmtCanvasInches(Number(p.h)||0)}`;

        if(linkedSplashRow)label.append(title);
        else label.append(title,meta);
        const dragHandle=makeSidebarDragHandle('piece');
        let linkedChildSurface=null;
        if(linkedSplashRow){
          const branch=document.createElement('span');
          branch.className='lc-piece-child-branch';
          branch.textContent='↳';
          branch.setAttribute('aria-hidden','true');

          const childMain=document.createElement('div');
          childMain.className='lc-linked-child-main';
          childMain.append(branch,dragHandle,label);

          linkedChildSurface=document.createElement('div');
          linkedChildSurface.className='lc-linked-child-surface';
          linkedChildSurface.appendChild(childMain);
          div.appendChild(linkedChildSurface);
        }else{
          div.append(dragHandle,label);
        }

        const actions=document.createElement('div');
        actions.className='lc-nav-actions';

        const rename=document.createElement('button');
        rename.type='button';
        rename.className='lc-btn ghost lc-iconbtn lc-rename-btn';
        rename.title='Rename piece';
        rename.textContent='✎';
        rename.onclick=e=>{
          e.stopPropagation();
          beginListRename(title,p,`Piece ${i+1}`,renderList);
        };

        const btnDel=document.createElement('button');
        btnDel.type='button';
        btnDel.className='lc-btn red lc-iconbtn lc-delete-btn';
        btnDel.title='Delete piece';
        btnDel.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 11H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z" fill="currentColor"/></svg>';
        btnDel.addEventListener('click',e=>{
          e.stopPropagation();
          const idx=state.pieces.findIndex(x=>x.id===p.id);
          if(idx>-1){
            detachSplashChildren(p.id);
            state.pieces.splice(idx,1);
            setSelection([]);
            state.selectedId=null;
            renderList();
            updateInspector();
            sinksUI?.refresh();
            draw();
            scheduleSave();
            pushHistory();
          }
        });

        actions.append(rename,btnDel);
        if(linkedChildSurface)linkedChildSurface.appendChild(actions);
        else div.appendChild(actions);
        return div;
      }

function updateSidebarCounts(){
  const L=cur();
  const setCount=(listEl,count)=>{
    const title=listEl?.closest('.lc-card')?.querySelector('.lc-card-head h3');
    if(!title)return;
    const base=title.dataset.baseLabel||title.textContent.replace(/\s*\(\d+\)\s*$/,'');
    title.dataset.baseLabel=base;
    title.textContent=`${base} (${count})`;
  };
  setCount(layoutsEl,state.layouts?.length||0);
  setCount(list,state.pieces?.length||0);
  setCount(noteList,Array.isArray(L?.notes)?L.notes.length:0);
  setCount(dimList,Array.isArray(L?.dims)?L.dims.length:0);
  setCount(lineList,Array.isArray(L?.lines)?L.lines.length:0);
}
function renderEmptyState(listEl,text){
  if(!listEl||listEl.children.length)return;
  const empty=document.createElement('div');
  empty.className='lc-item lc-list-empty';
  empty.textContent=text;
  listEl.appendChild(empty);
}

function pieceNavigatorFamilies(){
  const byParent=new Map();
  state.pieces.forEach(piece=>{
    if(!isLinkedSplash(piece))return;
    const parentId=piece.attachment?.parentPieceId;
    if(!byParent.has(parentId))byParent.set(parentId,[]);
    byParent.get(parentId).push(piece);
  });

  const families=[];
  const used=new Set();
  state.pieces.forEach(piece=>{
    if(isLinkedSplash(piece))return;
    const children=(byParent.get(piece.id)||[]).filter(child=>!used.has(child.id));
    const family=[piece,...children];
    family.forEach(item=>used.add(item.id));
    families.push(family);
  });

  // Preserve any orphaned linked children rather than dropping them.
  state.pieces.forEach(piece=>{
    if(!used.has(piece.id)){
      families.push([piece]);
      used.add(piece.id);
    }
  });
  return families;
}

function pieceNavigatorOrder(){
  return pieceNavigatorFamilies().flat();
}

function renderList(){
  list.classList.add('lc-nav');
  list.innerHTML = '';
  pieceNavigatorOrder().forEach((p,i)=> list.appendChild(pieceItem(p,i)));
  renderEmptyState(list,'No pieces');
  installPieceReorder();
  updateSidebarCounts();
  renderEstimateSummary?.();
}

// ------- Drag-to-reorder for Pieces -------
let listDrag = null;
let listReorderWired = false;

function installPieceReorder(){
  if(!list || listReorderWired) return;
  listReorderWired = true;

  const THRESH=4;

  const rowPiece=row=>state.pieces.find(piece=>piece.id===row?.dataset?.pieceId)||null;

  const cleanup=()=>{
    if(!listDrag)return;
    list.classList.remove('reordering');
    listDrag.row?.classList.remove('dragging');
    listDrag.marker?.remove();
    listDrag=null;
  };

  list.addEventListener('pointerdown',e=>{
    const row=e.target.closest('.lc-item.nav');
    if(!row||!e.target.closest('.lc-sidebar-drag'))return;
    if(e.target.closest('button,input,textarea'))return;

    const piece=rowPiece(row);
    if(!piece)return;

    const child=isLinkedSplash(piece);
    listDrag={
      row,
      pieceId:piece.id,
      parentId:child?piece.attachment?.parentPieceId:null,
      mode:child?'child':'family',
      startY:e.clientY,
      moved:false,
      marker:null
    };
    row.setPointerCapture?.(e.pointerId);
  });

  list.addEventListener('pointermove',e=>{
    if(!listDrag)return;
    if(!listDrag.moved&&Math.abs(e.clientY-listDrag.startY)<THRESH)return;

    if(!listDrag.moved){
      listDrag.moved=true;
      list.classList.add('reordering');
      listDrag.row.classList.add('dragging');
      listDrag.marker=document.createElement('div');
      listDrag.marker.className='lc-drop-marker';
    }

    const marker=listDrag.marker;
    const allRows=Array.from(list.querySelectorAll('.lc-item.nav'));

    if(listDrag.mode==='child'){
      const siblings=allRows.filter(row=>
        row!==listDrag.row &&
        row.dataset.parentPieceId===listDrag.parentId
      );

      if(!siblings.length){
        listDrag.row.insertAdjacentElement('afterend',marker);
        return;
      }

      let before=null;
      for(const row of siblings){
        const r=row.getBoundingClientRect();
        if(e.clientY<r.top+r.height/2){before=row;break;}
      }
      if(before){
        list.insertBefore(marker,before);
      }else{
        const last=siblings[siblings.length-1];
        list.insertBefore(marker,last.nextSibling);
      }
      return;
    }

    // Parent/top-level pieces move as one family. Only family boundaries are valid.
    const familyRows=allRows.filter(row=>{
      if(row===listDrag.row)return false;
      const piece=rowPiece(row);
      return !!piece&&!isLinkedSplash(piece);
    });

    let before=null;
    for(const row of familyRows){
      const r=row.getBoundingClientRect();
      if(e.clientY<r.top+r.height/2){before=row;break;}
    }
    if(before)list.insertBefore(marker,before);
    else list.appendChild(marker);
  });

  list.addEventListener('pointerup',()=>{
    if(!listDrag)return;
    if(!listDrag.moved){cleanup();return;}

    const {mode,pieceId,parentId,marker}=listDrag;
    const movedPiece=state.pieces.find(piece=>piece.id===pieceId);
    if(!movedPiece){cleanup();return;}

    if(mode==='child'){
      const parent=state.pieces.find(piece=>piece.id===parentId);
      if(parent){
        const children=state.pieces.filter(piece=>isLinkedSplash(piece)&&piece.attachment?.parentPieceId===parentId);
        const remaining=children.filter(piece=>piece.id!==pieceId);
        const nextRow=marker?.nextElementSibling?.closest?.('.lc-item.nav');
        const nextPiece=nextRow?rowPiece(nextRow):null;
        let to=remaining.length;
        if(nextPiece&&isLinkedSplash(nextPiece)&&nextPiece.attachment?.parentPieceId===parentId){
          const idx=remaining.findIndex(piece=>piece.id===nextPiece.id);
          if(idx>=0)to=idx;
        }
        remaining.splice(to,0,movedPiece);

        const familyIds=new Set([parentId,...children.map(piece=>piece.id)]);
        const parentIndex=Math.max(0,state.pieces.findIndex(piece=>piece.id===parentId));
        const rest=state.pieces.filter(piece=>!familyIds.has(piece.id));
        const insertAt=Math.min(parentIndex,rest.length);
        state.pieces=[
          ...rest.slice(0,insertAt),
          parent,
          ...remaining,
          ...rest.slice(insertAt)
        ];
      }
    }else{
      const families=pieceNavigatorFamilies();
      const from=families.findIndex(family=>family[0]?.id===pieceId);
      if(from>=0){
        const moving=families.splice(from,1)[0];
        const nextRow=marker?.nextElementSibling?.closest?.('.lc-item.nav');
        const nextPiece=nextRow?rowPiece(nextRow):null;
        let to=families.length;
        if(nextPiece&&!isLinkedSplash(nextPiece)){
          const idx=families.findIndex(family=>family[0]?.id===nextPiece.id);
          if(idx>=0)to=idx;
        }
        families.splice(to,0,moving);
        state.pieces=families.flat();
      }
    }

    state.pieces.forEach((piece,i)=>piece.layer=i);
    cleanup();
    renderList();renderDimList();renderNoteList();updateInspector();sinksUI?.refresh();draw();scheduleSave();pushHistory();
  });

  list.addEventListener('pointercancel',cleanup);
}


// ------- Drag-to-reorder for other sidebar lists -------
const sidebarReorderWired=new WeakSet();
function installSidebarReorder(listEl,{rowSelector='.lc-item.nav',startSelector=null,getArray,onMoved}={}){
  if(!listEl||sidebarReorderWired.has(listEl))return;
  sidebarReorderWired.add(listEl);

  const THRESH=4;
  let drag=null;

  const cleanup=()=>{
    if(!drag)return;
    drag.row?.classList.remove('dragging');
    drag.marker?.remove();
    listEl.classList.remove('reordering');
    drag=null;
  };

  listEl.addEventListener('pointerdown',e=>{
    if(e.target.closest('button,input,textarea,select'))return;
    if(startSelector&&!e.target.closest(startSelector))return;
    const row=e.target.closest(rowSelector);
    if(!row||!listEl.contains(row))return;
    const rows=Array.from(listEl.querySelectorAll(rowSelector));
    const from=rows.indexOf(row);
    if(from<0)return;
    drag={row,from,startY:e.clientY,moved:false,marker:null};
    row.setPointerCapture?.(e.pointerId);
  });

  listEl.addEventListener('pointermove',e=>{
    if(!drag)return;
    if(!drag.moved&&Math.abs(e.clientY-drag.startY)<THRESH)return;
    if(!drag.moved){
      drag.moved=true;
      listEl.classList.add('reordering');
      drag.row.classList.add('dragging');
      drag.marker=document.createElement('div');
      drag.marker.className='lc-drop-marker';
      listEl.insertBefore(drag.marker,drag.row.nextSibling);
    }
    const rows=Array.from(listEl.querySelectorAll(rowSelector)).filter(row=>row!==drag.row);
    let before=null;
    for(const row of rows){
      const rect=row.getBoundingClientRect();
      if(e.clientY<rect.top+rect.height/2){before=row;break;}
    }
    if(before)listEl.insertBefore(drag.marker,before);
    else listEl.appendChild(drag.marker);
  });

  listEl.addEventListener('pointerup',()=>{
    if(!drag)return;
    if(!drag.moved){cleanup();return;}
    const {row,from,marker}=drag;
    const rows=Array.from(listEl.querySelectorAll(rowSelector));
    let after=marker.nextElementSibling;
    while(after&&!after.matches?.(rowSelector))after=after.nextElementSibling;
    let to=after?rows.indexOf(after):rows.length;
    if(to>from)to--;
    marker.remove();
    row.classList.remove('dragging');
    listEl.classList.remove('reordering');
    drag=null;
    if(to===from||to<0)return;

    const arr=getArray?.();
    if(!Array.isArray(arr)||from>=arr.length||to>arr.length)return;
    const moved=arr.splice(from,1)[0];
    arr.splice(to,0,moved);
    onMoved?.({from,to,moved,arr});
  });

  listEl.addEventListener('pointercancel',cleanup);
}


const NOTE_LIST_TITLE_MAX=48;

function beginListRename(titleEl,item,fallback,rerender){
  if(!titleEl||!item)return;
  const current=String(item.name||fallback||'').trim();
  const input=document.createElement('input');
  input.type='text';
  input.className='lc-input';
  input.value=current;
  input.setAttribute('aria-label','Rename list item');
  Object.assign(input.style,{width:'100%',minWidth:'0',height:'28px',padding:'2px 6px',boxSizing:'border-box'});
  titleEl.replaceChildren(input);

  let done=false;
  const finish=(save)=>{
    if(done)return;
    done=true;
    if(save){
      const next=input.value.trim();
      const old=String(item.name||'').trim();
      item.name=next;
      if(next!==old){scheduleSave();pushHistory();}
    }
    rerender?.();
  };

  input.addEventListener('click',e=>e.stopPropagation());
  input.addEventListener('pointerdown',e=>e.stopPropagation());
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();finish(true);}
    else if(e.key==='Escape'){e.preventDefault();finish(false);}
  });
  input.addEventListener('blur',()=>finish(true),{once:true});
  input.focus();
  input.select();
}

function renderDimList(){
  if(!dimList)return;
  const L=cur();
  dimList.innerHTML='';
  if(!L||!Array.isArray(L.dims)){renderEmptyState(dimList,'No dimensions');updateSidebarCounts();return;}

  L.dims.forEach((d,idx)=>{
    const li=document.createElement('div');
    li.className='lc-item nav'+(state.selectedDimId===d.id?' selected':'');
    li.style.display='flex';
    li.style.alignItems='center';
    li.style.gap='8px';
    li.style.cursor='pointer';

    const dx=d.x2-d.x1,dy=d.y2-d.y1;
    const dist=Math.sqrt(dx*dx+dy*dy);
    const ang=(Math.atan2(dy,dx)*180/Math.PI+360)%180;
    const orient=ang<=3||ang>=177?'Horizontal':(Math.abs(ang-90)<=3?'Vertical':`${ang.toFixed(1)}°`);

    li.classList.add('lc-nav-entity-row');

    const label=document.createElement('div');
    label.className='lc-nav-main';

    const title=document.createElement('div');
    title.className='lc-nav-title';
    title.textContent=(String(d.name||'').trim()||`Dim ${idx+1}`);
    title.title=title.textContent;

    const meta=document.createElement('div');
    meta.className='lc-nav-meta';
    meta.textContent=`${fmtCanvasInches(dist)} · ${orient}`;

    label.append(title,meta);

    const select=()=>{
      state.selectedDimId=d.id;
      state.selectedLineId=null;
      state.selectedNoteId=null;
      clearSelection();
      renderDimList();
      renderLineList();
      updateInspector();
      draw();
    };
    li.onclick=e=>{if(e.target.closest('button,input'))return;select();};

    const actions=document.createElement('div');
    actions.className='lc-nav-actions';

    const rename=document.createElement('button');
    rename.type='button';
    rename.className='lc-btn ghost lc-iconbtn lc-rename-btn';
    rename.title='Rename dimension';
    rename.textContent='✎';
    rename.onclick=e=>{
      e.stopPropagation();
      beginListRename(title,d,`Dim ${idx+1}`,renderDimList);
    };

    const del=document.createElement('button');
    del.type='button';
    del.className='lc-btn red lc-iconbtn lc-delete-btn';
    del.title='Delete dimension';
    del.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 11H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z" fill="currentColor"/></svg>';
    del.onclick=e=>{
      e.stopPropagation();
      L.dims=L.dims.filter(x=>x.id!==d.id);
      if(state.selectedDimId===d.id)state.selectedDimId=null;
      renderDimList();
      draw();
      scheduleSave();
      pushHistory();
      updateInspector();
    };

    actions.append(rename,del);
    const dragHandle=makeSidebarDragHandle('dimension');
    li.append(dragHandle,label,actions);
    dimList.appendChild(li);
  });

  renderEmptyState(dimList,'No dimensions');
  installSidebarReorder(dimList,{
    startSelector:'.lc-sidebar-drag',
    getArray:()=>cur()?.dims,
    onMoved:()=>{renderDimList();scheduleSave();pushHistory();}
  });
  updateSidebarCounts();
}

function renderLineList(){
  if(!lineList)return;
  const L=cur();
  lineList.innerHTML='';
  if(!L||!Array.isArray(L.lines)){renderEmptyState(lineList,'No lines');updateSidebarCounts();return;}

  L.lines.forEach((lineObj,idx)=>{
    const li=document.createElement('div');
    li.className='lc-item nav'+(state.selectedLineId===lineObj.id?' selected':'');
    li.style.display='block';
    li.style.cursor='pointer';

    const top=document.createElement('div');
    top.style.display='flex';
    top.style.alignItems='center';
    top.style.gap='8px';

    const dx=lineObj.x2-lineObj.x1,dy=lineObj.y2-lineObj.y1;
    const len=Math.sqrt(dx*dx+dy*dy);
    const ang=(Math.atan2(dy,dx)*180/Math.PI+360)%180;
    const orient=ang<=3||ang>=177?'Horizontal':(Math.abs(ang-90)<=3?'Vertical':`${ang.toFixed(1)}°`);

    top.classList.add('lc-nav-entity-row');

    const label=document.createElement('div');
    label.className='lc-nav-main';

    const title=document.createElement('div');
    title.className='lc-nav-title';
    title.textContent=(String(lineObj.name||'').trim()||(lineObj.attachedNoteId?'Note Leader':`Line ${idx+1}`));
    title.title=title.textContent;

    const meta=document.createElement('div');
    meta.className='lc-nav-meta';
    meta.textContent=`${fmtCanvasInches(len)} · ${orient}`;

    label.append(title,meta);

    const select=()=>{
      state.selectedLineId=lineObj.id;
      state.selectedDimId=null;
      state.selectedNoteId=null;
      clearSelection();
      renderLineList();
      renderDimList();
      renderNoteList();
      updateInspector();
      draw();
    };
    top.onclick=e=>{if(e.target.closest('button,input,select'))return;select();};

    const actions=document.createElement('div');
    actions.className='lc-nav-actions';

    const rename=document.createElement('button');
    rename.type='button';
    rename.className='lc-btn ghost lc-iconbtn lc-rename-btn';
    rename.title='Rename line';
    rename.textContent='✎';
    rename.onclick=e=>{
      e.stopPropagation();
      beginListRename(title,lineObj,`Line ${idx+1}`,renderLineList);
    };

    const del=document.createElement('button');
    del.type='button';
    del.className='lc-btn red lc-iconbtn lc-delete-btn';
    del.title='Delete line';
    del.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 11H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z" fill="currentColor"/></svg>';
    del.onclick=e=>{
      e.stopPropagation();
      L.lines=L.lines.filter(x=>x.id!==lineObj.id);
      if(state.selectedLineId===lineObj.id)state.selectedLineId=null;
      renderLineList();
      renderNoteList();
      draw();
      scheduleSave();
      pushHistory();
      updateInspector();
    };

    actions.append(rename,del);
    const dragHandle=makeSidebarDragHandle('line');
    top.append(dragHandle,label,actions);
    li.appendChild(top);


    lineList.appendChild(li);
  });

  renderEmptyState(lineList,'No lines');
  installSidebarReorder(lineList,{
    startSelector:'.lc-sidebar-drag',
    getArray:()=>cur()?.lines,
    onMoved:()=>{renderLineList();renderNoteList();scheduleSave();pushHistory();}
  });
  updateSidebarCounts();
}


function noteLeadersFor(noteId,L=cur()){
  if(!L||!Array.isArray(L.lines))return [];
  return L.lines.filter(lineObj=>lineObj.attachedNoteId===noteId);
}

function syncNoteLeaders(note,L=cur()){
  if(!note||!L)return;
  noteLeadersFor(note.id,L).forEach(lineObj=>{
    if(lineObj.attachedEnd==='end'){
      lineObj.x2=round3(note.x);
      lineObj.y2=round3(note.y);
    }else{
      lineObj.attachedEnd='start';
      lineObj.x1=round3(note.x);
      lineObj.y1=round3(note.y);
    }
  });
}

function removeNoteLeaders(noteId,L=cur()){
  if(!L||!Array.isArray(L.lines))return false;
  const removedIds=new Set(L.lines.filter(lineObj=>lineObj.attachedNoteId===noteId).map(lineObj=>lineObj.id));
  if(!removedIds.size)return false;
  L.lines=L.lines.filter(lineObj=>!removedIds.has(lineObj.id));
  if(removedIds.has(state.selectedLineId))state.selectedLineId=null;
  return true;
}

function deleteNoteAndLeaders(noteId,L=cur()){
  if(!L||!Array.isArray(L.notes))return false;
  const before=L.notes.length;
  L.notes=L.notes.filter(note=>note.id!==noteId);
  if(L.notes.length===before)return false;
  removeNoteLeaders(noteId,L);
  if(state.selectedNoteId===noteId)state.selectedNoteId=null;
  return true;
}

function isRadiusAnnotation(item){
  return !!item&&(item.annotationType==='radius'||item.radiusRef?.pieceId);
}

function radiusAnnotationForCorner(pieceId,corner,L=cur()){
  if(!L||!Array.isArray(L.notes))return null;
  return L.notes.find(note=>
    isRadiusAnnotation(note)&&
    note.radiusRef?.kind!=='sink'&&
    note.radiusRef?.pieceId===pieceId&&
    note.radiusRef?.corner===corner
  )||null;
}

function sinkRadiusAnnotationForCorner(pieceId,sinkId,corner,L=cur()){
  if(!L||!Array.isArray(L.notes))return null;
  return L.notes.find(note=>
    isRadiusAnnotation(note)&&
    note.radiusRef?.kind==='sink'&&
    note.radiusRef?.pieceId===pieceId&&
    note.radiusRef?.sinkId===sinkId&&
    note.radiusRef?.corner===corner
  )||null;
}

function radiusCornerTarget(piece,corner){
  if(!piece)return null;
  migratePieceGeometry(piece);
  const radius=Math.max(0,Number(piece.cornerRadii?.[corner])||0);
  if(radius<=0)return null;

  const rs=realSize(piece);
  const cx=(Number(piece.x)||0)+rs.w/2;
  const cy=(Number(piece.y)||0)+rs.h/2;
  const sx=corner==='tl'||corner==='bl'?-1:1;
  const sy=corner==='tl'||corner==='tr'?-1:1;
  const local={
    x:sx*((Number(piece.w)||0)/2-radius+radius/Math.SQRT2),
    y:sy*((Number(piece.h)||0)/2-radius+radius/Math.SQRT2)
  };
  const rotated=rotateVec(local.x,local.y,Number(piece.rotation)||0);
  const outward=rotateVec(sx/Math.SQRT2,sy/Math.SQRT2,Number(piece.rotation)||0);
  return {
    x:round3(cx+rotated.x),
    y:round3(cy+rotated.y),
    outward,
    radius
  };
}

function sinkRadiusCornerTarget(piece,sink,corner){
  if(!piece||!sink||sink.shape==='oval')return null;
  const radius=Math.max(0,Math.min(
    Number(sink.cornerR)||0,
    Number(sink.w||0)/2,
    Number(sink.h||0)/2
  ));
  if(radius<=0)return null;

  const pieceSize=realSize(piece);
  const pieceCx=(Number(piece.x)||0)+pieceSize.w/2;
  const pieceCy=(Number(piece.y)||0)+pieceSize.h/2;
  const pose=sinkPoseOnPiece(piece,sink);

  const sinkCenterLocal={
    x:(Number(pose.cx)||0)-(Number(piece.w)||0)/2,
    y:(Number(pose.cy)||0)-(Number(piece.h)||0)/2
  };
  const centerOffset=rotateVec(sinkCenterLocal.x,sinkCenterLocal.y,Number(piece.rotation)||0);
  const sinkCx=pieceCx+centerOffset.x;
  const sinkCy=pieceCy+centerOffset.y;

  const sx=corner==='tl'||corner==='bl'?-1:1;
  const sy=corner==='tl'||corner==='tr'?-1:1;
  const localPoint={
    x:sx*((Number(sink.w)||0)/2-radius+radius/Math.SQRT2),
    y:sy*((Number(sink.h)||0)/2-radius+radius/Math.SQRT2)
  };
  const globalAngle=Number(pose.angle)||0;
  const pointOffset=rotateVec(localPoint.x,localPoint.y,globalAngle);
  const outward=rotateVec(sx/Math.SQRT2,sy/Math.SQRT2,globalAngle);

  return {
    x:round3(sinkCx+pointOffset.x),
    y:round3(sinkCy+pointOffset.y),
    outward,
    radius
  };
}

function radiusLabelText(radius){
  return 'R'+fmtCanvasInches(radius);
}

function syncRadiusAnnotations(L=cur()){
  if(!L||!Array.isArray(L.notes))return;
  const removeIds=[];
  L.notes.forEach(note=>{
    if(!isRadiusAnnotation(note))return;
    const ref=note.radiusRef||{};
    const piece=state.pieces.find(candidate=>candidate.id===ref.pieceId);
    let target=null;
    if(piece&&ref.kind==='sink'){
      migratePieceForSinks(piece);
      const sink=piece.sinks.find(candidate=>candidate.id===ref.sinkId);
      target=sink?sinkRadiusCornerTarget(piece,sink,ref.corner):null;
    }else if(piece){
      target=radiusCornerTarget(piece,ref.corner);
    }
    if(!piece||!target){
      removeIds.push(note.id);
      return;
    }
    if(ref.autoText!==false)note.text=radiusLabelText(target.radius);
    noteLeadersFor(note.id,L).forEach(lineObj=>{
      lineObj.annotationType='radius';
      lineObj.radiusRef={...ref};
      if(lineObj.attachedEnd==='end'){
        lineObj.x1=target.x;lineObj.y1=target.y;
      }else{
        lineObj.x2=target.x;lineObj.y2=target.y;
      }
    });
  });
  removeIds.forEach(id=>deleteNoteAndLeaders(id,L));
}

function createRadiusAnnotation(piece,corner){
  const L=cur();
  const target=radiusCornerTarget(piece,corner);
  if(!L||!target)return null;
  if(!Array.isArray(L.notes))L.notes=[];
  if(!Array.isArray(L.lines))L.lines=[];

  const existing=radiusAnnotationForCorner(piece.id,corner,L);
  if(existing){
    // Radius Mode behaves like Splash Mode: keep the countertop selected so
    // additional corners remain available in the same run.
    state.selectedNoteId=null;
    state.selectedLineId=null;
    state.selectedDimId=null;
    selectOnly(piece.id);
    renderList();renderNoteList();renderLineList();updateInspector();draw();
    return existing;
  }

  const noteDistance=12;
  let nx=round3(clamp(target.x+target.outward.x*noteDistance,0,state.cw));
  let ny=round3(clamp(target.y+target.outward.y*noteDistance,0,state.ch));
  if(Math.hypot(nx-target.x,ny-target.y)<3){
    nx=round3(clamp(target.x-target.outward.x*noteDistance,0,state.cw));
    ny=round3(clamp(target.y-target.outward.y*noteDistance,0,state.ch));
  }

  const note={
    id:uid(),
    x:nx,y:ny,
    text:radiusLabelText(target.radius),
    annotationType:'radius',
    radiusRef:{kind:'piece',pieceId:piece.id,corner,autoText:true}
  };
  const line={
    id:uid(),
    name:'Radius Leader',
    x1:nx,y1:ny,
    x2:target.x,y2:target.y,
    style:'solid',
    color:'#111111',
    thickness:2,
    startCap:'none',
    endCap:'arrow',
    attachedNoteId:note.id,
    attachedEnd:'start',
    annotationType:'radius',
    radiusRef:{kind:'piece',pieceId:piece.id,corner}
  };
  L.notes.push(note);
  L.lines.push(line);

  // Keep the source piece active so Radius Mode can label several corners
  // without switching the Inspector over to the generated Note.
  state.selectedNoteId=null;
  state.selectedLineId=null;
  state.selectedDimId=null;
  selectOnly(piece.id);
  renderList();renderNoteList();renderLineList();updateInspector();draw();scheduleSave();pushHistory();
  return note;
}

function renderNoteList(){
  if(!noteList)return;
  const L=cur();
  noteList.innerHTML='';
  if(!L||!Array.isArray(L.notes)){renderEmptyState(noteList,'No notes');updateSidebarCounts();return;}

  L.notes.forEach((n,idx)=>{
    const li=document.createElement('div');
    li.className='lc-item nav'+(state.selectedNoteId===n.id?' selected':'');
    li.style.display='flex';
    li.style.alignItems='center';
    li.style.gap='8px';
    li.style.cursor='pointer';

    const fullText=String(n.text||`Note ${idx+1}`);
    const oneLine=fullText.replace(/\s+/g,' ').trim()||`Note ${idx+1}`;
    const preview=oneLine.length>NOTE_LIST_TITLE_MAX
      ? oneLine.slice(0,NOTE_LIST_TITLE_MAX-1).trimEnd()+'…'
      : oneLine;

    const label=document.createElement('div');
    label.style.flex='1';
    label.style.minWidth='0';
    label.style.whiteSpace='nowrap';
    label.style.overflow='hidden';
    label.style.textOverflow='ellipsis';
    label.textContent=preview;
    label.title=fullText;

    const select=()=>{
      state.selectedNoteId=n.id;
      state.selectedDimId=null;
      state.selectedLineId=null;
      clearSelection();
      renderList();
      renderDimList();
      renderLineList();
      renderNoteList();
      updateInspector();
      draw();
    };
    li.onclick=e=>{if(e.target.closest('button,input,textarea'))return;select();};

    const leader=noteLeadersFor(n.id,L)[0]||null;
    const leaderBtn=document.createElement('button');
    leaderBtn.type='button';
    leaderBtn.className='lc-btn ghost lc-iconbtn lc-note-leader-toggle'+(leader?' is-active':'');
    leaderBtn.title=leader?'Remove leader':'Add leader';
    leaderBtn.textContent='↗';
    leaderBtn.onclick=e=>{
      e.stopPropagation();
      state.selectedNoteId=n.id;
      state.selectedDimId=null;
      state.selectedLineId=null;
      clearSelection();

      if(leader){
        removeNoteLeaders(n.id,L);
      }else{
        if(!Array.isArray(L.lines))L.lines=[];
        const dx=n.x>=12?-12:Math.min(12,Math.max(0,state.cw-n.x));
        const dy=(state.ch-n.y)>=8?8:-Math.min(8,Math.max(0,n.y));
        let tx=round3(clamp(n.x+dx,0,state.cw));
        let ty=round3(clamp(n.y+dy,0,state.ch));
        if(Math.hypot(tx-n.x,ty-n.y)<0.25){
          tx=round3(clamp(n.x+(state.cw-n.x>=n.x?4:-4),0,state.cw));
          ty=round3(clamp(n.y,0,state.ch));
        }
        L.lines.push({
          id:uid(),
          name:'Note Leader',
          x1:round3(n.x),y1:round3(n.y),
          x2:tx,y2:ty,
          style:'solid',
          color:'#111111',
          thickness:2,
          startCap:'none',
          endCap:'arrow',
          attachedNoteId:n.id,
          attachedEnd:'start'
        });
      }

      renderList();
      renderDimList();
      renderLineList();
      renderNoteList();
      updateInspector();
      draw();
      scheduleSave();
      pushHistory();
    };

    const edit=document.createElement('button');
    edit.type='button';
    edit.className='lc-btn ghost lc-iconbtn lc-rename-btn';
    edit.title='Edit note';
    edit.textContent='✎';
    edit.onclick=e=>{
      e.stopPropagation();
      state.selectedNoteId=n.id;
      state.selectedDimId=null;
      state.selectedLineId=null;
      clearSelection();
      renderList();
      renderDimList();
      renderLineList();
      renderNoteList();
      updateInspector();
      draw();

      const selectedRow=Array.from(noteList.children).find(row=>row.classList?.contains('selected'));
      const anchor=selectedRow?.querySelector('div')||label;
      openInlineNoteEditor(anchor,n.text||'',raw=>{
        const v=String(raw??'').trim();
        if(!v)return false;
        n.text=v;
        if(n.radiusRef)n.radiusRef.autoText=false;
        draw();
        renderNoteList();
        scheduleSave();
        pushHistory();
        return true;
      });
    };

    const del=document.createElement('button');
    del.type='button';
    del.className='lc-btn red lc-iconbtn lc-delete-btn';
    del.title='Delete note';
    del.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 11H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z" fill="currentColor"/></svg>';
    del.onclick=e=>{
      e.stopPropagation();
      deleteNoteAndLeaders(n.id,L);
      draw();
      renderNoteList();
      renderLineList();
      scheduleSave();
      pushHistory();
      updateInspector();
    };

    const dragHandle=makeSidebarDragHandle('note');
    li.append(dragHandle,label,leaderBtn,edit,del);
    noteList.appendChild(li);
  });

  renderEmptyState(noteList,'No notes');
  installSidebarReorder(noteList,{
    startSelector:'.lc-sidebar-drag',
    getArray:()=>cur()?.notes,
    onMoved:()=>{renderNoteList();scheduleSave();pushHistory();}
  });
  updateSidebarCounts();
}


function renderLayouts(){
  if(!layoutsEl) return;
  layoutsEl.innerHTML = '';
  state.layouts.forEach((L, idx)=>{
    const row=document.createElement('div');
    row.className='lc-item nav lc-layout-item'+(idx===state.active?' selected':'');
    row.style.setProperty('--c','#f3f4f6');
    row.style.setProperty('--fg','#111');

    const selectLayout=()=>{
      state.active=idx;
      state.selectedId=null;
      state.selectedIds=[];
      state.selectedDimId=null;
      state.selectedLineId=null;
      state.selectedNoteId=null;
      renderLayouts();
      syncToolbarFromLayout();
      renderList();
      renderDimList();
      renderLineList();
      renderNoteList();
      updateInspector();
      sinksUI?.refresh();
      draw();
      renderOverlayList?.();
      syncOverlayUI?.();
      scheduleSave();
    };

    const titleRow=document.createElement('div');
    titleRow.className='lc-layout-title-row';

    const title=document.createElement('div');
    title.className='lc-nav-title lc-layout-title';
    title.textContent=String(L.name||'').trim()||`Layout ${idx+1}`;
    title.title=title.textContent;
    const dragHandle=makeSidebarDragHandle('layout');
    titleRow.append(dragHandle,title);

    row.addEventListener('click',e=>{
      if(e.target.closest('button,input,textarea,select'))return;
      selectLayout();
    });
    row.appendChild(titleRow);

    const actions=document.createElement('div');
    actions.className='lc-layout-actions';

    const btnDup=document.createElement('button');
    btnDup.type='button';
    btnDup.className='lc-btn ghost lc-layout-duplicate';
    btnDup.title='Duplicate layout';
    btnDup.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M5 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Duplicate</span>';
    btnDup.addEventListener('click',e=>{
      e.stopPropagation();
      const copy=JSON.parse(JSON.stringify(L));
      copy.id=uid();
      copy.name=(L.name||`Layout ${idx+1}`)+' Copy';
      state.layouts.splice(idx+1,0,copy);
      renderLayouts();
      scheduleSave();
      pushHistory();
    });

    const rename=document.createElement('button');
    rename.type='button';
    rename.className='lc-btn ghost lc-iconbtn lc-rename-btn';
    rename.title='Rename layout';
    rename.textContent='✎';
    rename.addEventListener('click',e=>{
      e.stopPropagation();
      beginListRename(title,L,`Layout ${idx+1}`,renderLayouts);
    });

    const btnDel=document.createElement('button');
    btnDel.type='button';
    btnDel.className='lc-btn red lc-iconbtn';
    btnDel.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 11H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z" fill="currentColor"/></svg>';
    btnDel.title='Delete layout';
    btnDel.addEventListener('click',e=>{
      e.stopPropagation();
      if(state.layouts.length<=1){alert('Keep at least one layout.');return;}
      if(!confirm('Are you sure you want to delete this layout?'))return;
      state.layouts.splice(idx,1);
      if(state.active>=state.layouts.length)state.active=state.layouts.length-1;
      state.selectedId=null;
      state.selectedIds=[];
      renderLayouts();
      renderList();
      renderDimList();
      renderLineList();
      renderNoteList();
      updateInspector();
      sinksUI?.refresh();
      draw();
      scheduleSave();
      renderOverlayList?.();
      syncOverlayUI?.();
      pushHistory();
    });

    actions.append(btnDup,rename,btnDel);
    row.appendChild(actions);
    layoutsEl.appendChild(row);
  });
  installSidebarReorder(layoutsEl,{
    rowSelector:'.lc-layout-item',
    startSelector:'.lc-sidebar-drag',
    getArray:()=>{
      layoutsEl.dataset.reorderActiveId=state.layouts[state.active]?.id||'';
      return state.layouts;
    },
    onMoved:()=>{
      const activeId=layoutsEl.dataset.reorderActiveId||'';
      delete layoutsEl.dataset.reorderActiveId;
      if(activeId){
        const nextActive=state.layouts.findIndex(layout=>layout.id===activeId);
        if(nextActive>=0)state.active=nextActive;
      }
      renderLayouts();
      scheduleSave();
      pushHistory();
    }
  });
  updateSidebarCounts();
  renderEstimateSummary?.();
}

if(btnAddLayout){
  btnAddLayout.onclick = ()=>{
    const L = makeLayout(`Layout ${state.layouts.length+1}`);
    state.layouts.push(L); state.active = state.layouts.length-1;
    renderLayouts(); renderList(); renderDimList(); renderNoteList(); updateInspector(); sinksUI?.refresh(); draw(); syncToolbarFromLayout(); scheduleSave();
    renderOverlayList?.();   // <-- add
    syncOverlayUI?.();       // <-- add
    pushHistory();
  };
}

      function cornerButton(pos, active){
        var b=document.createElement('button');
        b.className='lc-corner-btn pos-'+pos+(active?' active':'');
        b.innerHTML='<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M3 15V6a3 3 0 0 1 3-3h9" fill="none" stroke="#111" stroke-width="2"/></svg>';
        return b;
        }

      function makeInspectorDisclosure(root,title,key){
        const sec=document.createElement('div');
        sec.className='lc-subcard lc-inspector-collapsible';

        const head=document.createElement('div');
        head.className='lc-subcard-label lc-small lc-inspector-section-toggle';
        const text=document.createElement('span');
        text.textContent=title;
        const arrow=document.createElement('span');
        arrow.className='lc-head-arrow';
        head.append(text,arrow);

        const body=document.createElement('div');
        body.className='lc-subcard-body';

        let open=annotationInspectorOpen[key]!==false;
        const sync=()=>{
          body.hidden=!open;
          arrow.textContent=open?'▾':'▸';
          head.setAttribute('aria-expanded',String(open));
        };
        head.onclick=()=>{open=!open;annotationInspectorOpen[key]=open;sync();};
        head.setAttribute('role','button');
        head.setAttribute('tabindex','0');
        head.onkeydown=e=>{
          if(e.key==='Enter'||e.key===' '){
            e.preventDefault();
            open=!open;annotationInspectorOpen[key]=open;sync();
          }
        };
        sync();

        sec.append(head,body);
        root.appendChild(sec);
        return body;
      }

      function inspectorField(labelText,input){
        const lab=document.createElement('label');
        lab.className='lc-label';
        const cap=document.createElement('span');
        cap.textContent=labelText;
        lab.append(cap,input);
        return lab;
      }

      function inspectorText(value,onCommit){
        const el=document.createElement('input');
        el.className='lc-input';
        el.type='text';
        el.value=value??'';
        el.onchange=()=>onCommit(el.value);
        return el;
      }

      function inspectorSummary(body,items){
        const row=document.createElement('div');
        row.className='lc-annotation-summary';
        items.forEach(([k,v])=>{
          const cell=document.createElement('div');
          const key=document.createElement('span');key.textContent=k;
          const val=document.createElement('strong');val.textContent=v;
          cell.append(key,val);row.appendChild(cell);
        });
        body.appendChild(row);
      }

      function inspectorDeleteButton(labelText,onDelete){
        const b=document.createElement('button');
        b.type='button';
        b.className='lc-btn red sm lc-annotation-delete';
        b.textContent='Delete '+labelText;
        b.onclick=onDelete;
        return b;
      }

      function renderOverlayInspector(){
        const L=ensureOverlaysOnLayout(activeLayout());
        const o=currentOverlay();
        if(!L||!o)return false;
        L.overlayClip=true;

        inspector.className='';
        inspector.innerHTML='';

        const root=document.createElement('div');
        root.className='lc-item selected lc-annotation-inspector lc-overlay-inspector';
        const body=makeInspectorDisclosure(root,'Slab','overlay');

        const name=inspectorText(String(o.name||''),value=>{
          o.name=value.trim()||o.name||'Slab';
          renderOverlayList();scheduleSave();pushHistory();
        });
        body.appendChild(inspectorField('Name',name));

        const sizeGrid=document.createElement('div');
        sizeGrid.className='lc-inspector-property-grid';
        const makeNum=(value,step,onChange)=>{
          const input=document.createElement('input');
          input.className='lc-input';
          input.type='number';
          input.step=String(step);
          input.value=String(value);
          input.onchange=()=>{
            onChange(input);
            renderOverlayList();
            draw();scheduleSave();pushHistory();syncOverlayUI?.();
          };
          return input;
        };
        const w=makeNum(o.slabW??126,0.25,input=>{
          o.slabW=Math.max(1,Number(input.value)||1);clampOverlayToCanvas(o);input.value=String(o.slabW);
        });
        const h=makeNum(o.slabH??63,0.25,input=>{
          o.slabH=Math.max(1,Number(input.value)||1);clampOverlayToCanvas(o);input.value=String(o.slabH);
        });
        sizeGrid.append(inspectorField('Width (in)',w),inspectorField('Height (in)',h));
        body.appendChild(sizeGrid);

        const posGrid=document.createElement('div');
        posGrid.className='lc-inspector-property-grid';
        const x=makeNum(o.x??0,0.25,input=>{o.x=Number(input.value)||0;clampOverlayToCanvas(o);input.value=String(o.x);});
        const y=makeNum(o.y??0,0.25,input=>{o.y=Number(input.value)||0;clampOverlayToCanvas(o);input.value=String(o.y);});
        posGrid.append(inspectorField('X (in)',x),inspectorField('Y (in)',y));
        body.appendChild(posGrid);

        const opacityWrap=document.createElement('label');
        opacityWrap.className='lc-label lc-overlay-opacity-field';
        const opacityHead=document.createElement('div');
        opacityHead.className='lc-overlay-opacity-head';
        const opacityLabel=document.createElement('span');opacityLabel.textContent='Opacity';
        const opacityValue=document.createElement('strong');
        opacityHead.append(opacityLabel,opacityValue);
        const opacity=document.createElement('input');
        opacity.type='range';opacity.min='0.1';opacity.max='1';opacity.step='0.05';
        opacity.className='lc-opacity-range';
        opacity.value=String(o.opacity==null?1:o.opacity);
        const syncOpacity=()=>{
          opacityValue.textContent=Math.round(Number(opacity.value)*100)+'%';
          syncOpacityRangeVisual(opacity);
        };
        syncOpacity();
        opacity.oninput=()=>{
          o.opacity=clamp(Number(opacity.value)||1,.1,1);
          syncOpacity();draw();
        };
        opacity.onchange=()=>{scheduleSave();pushHistory();syncOverlayUI?.();};
        opacityWrap.append(opacityHead,opacity);
        body.appendChild(opacityWrap);

        const toggles=document.createElement('div');
        toggles.className='lc-overlay-toggle-stack';

        const visibleLabel=document.createElement('label');
        visibleLabel.className='lc-overlay-check-row';
        const visible=document.createElement('input');
        visible.type='checkbox';visible.checked=o.visible!==false;
        const visibleText=document.createElement('span');visibleText.textContent='Visible';
        visible.onchange=()=>{
          o.visible=visible.checked;draw();renderOverlayList();scheduleSave();pushHistory();
        };
        visibleLabel.append(visible,visibleText);

        toggles.append(visibleLabel);
        body.appendChild(toggles);

        if(o.natW&&o.natH){
          inspectorSummary(body,[['Source',o.natW+' × '+o.natH+' px'],['Slabs',String(L.overlays.length)]]);
        }

        body.appendChild(inspectorDeleteButton('Slab',()=>{
          const idx=L.overlays.indexOf(o);
          if(idx>=0)L.overlays.splice(idx,1);
          L.ovSel=-1;
          renderOverlayList();syncOverlayUI?.();draw();scheduleSave();pushHistory();updateInspector();
        }));

        inspector.appendChild(root);
        return true;
      }

      function renderAnnotationInspector(){
        const L=cur();
        if(!L)return false;

        const d=state.selectedDimId&&Array.isArray(L.dims)?L.dims.find(x=>x.id===state.selectedDimId):null;
        const lineObj=state.selectedLineId&&Array.isArray(L.lines)?L.lines.find(x=>x.id===state.selectedLineId):null;
        const note=state.selectedNoteId&&Array.isArray(L.notes)?L.notes.find(x=>x.id===state.selectedNoteId):null;
        if(!d&&!lineObj&&!note)return false;

        inspector.className='';
        inspector.innerHTML='';

        const root=document.createElement('div');
        root.className='lc-item selected lc-annotation-inspector';

        if(d){
          const body=makeInspectorDisclosure(root,'Dimension','dimension');
          const dx=d.x2-d.x1,dy=d.y2-d.y1;
          const len=Math.hypot(dx,dy);
          const ang=(Math.atan2(dy,dx)*180/Math.PI+360)%180;
          const orient=ang<=3||ang>=177?'Horizontal':(Math.abs(ang-90)<=3?'Vertical':ang.toFixed(1)+'°');

          body.appendChild(inspectorField('Name',inspectorText(String(d.name||''),value=>{
            d.name=value.trim();renderDimList();scheduleSave();pushHistory();
          })));
          inspectorSummary(body,[['Length',fmtCanvasInches(len)],['Orientation',orient]]);

          const off=document.createElement('input');
          off.className='lc-input';off.type='number';off.step='1';
          off.value=String(typeof d.offsetPx==='number'?d.offsetPx:12);
          off.onchange=()=>{
            d.offsetPx=clamp(Number(off.value)||0,-300,300);
            off.value=String(d.offsetPx);
            draw();scheduleSave();pushHistory();
          };
          body.appendChild(inspectorField('Label offset (px)',off));

          body.appendChild(inspectorDeleteButton('Dimension',()=>{
            L.dims=L.dims.filter(x=>x.id!==d.id);
            state.selectedDimId=null;
            renderDimList();draw();scheduleSave();pushHistory();updateInspector();
          }));
        }

        if(lineObj){
          const body=makeInspectorDisclosure(root,'Line','line');
          const dx=lineObj.x2-lineObj.x1,dy=lineObj.y2-lineObj.y1;
          const len=Math.hypot(dx,dy);
          const ang=(Math.atan2(dy,dx)*180/Math.PI+360)%180;
          const orient=ang<=3||ang>=177?'Horizontal':(Math.abs(ang-90)<=3?'Vertical':ang.toFixed(1)+'°');

          body.appendChild(inspectorField('Name',inspectorText(String(lineObj.name||''),value=>{
            lineObj.name=value.trim();renderLineList();scheduleSave();pushHistory();
          })));
          inspectorSummary(body,[['Length',fmtCanvasInches(len)],['Orientation',orient]]);

          const style=document.createElement('select');
          style.className='lc-input';
          [['solid','Solid'],['dashed','Dashed']].forEach(([v,t])=>{
            const opt=document.createElement('option');opt.value=v;opt.textContent=t;style.appendChild(opt);
          });
          style.value=lineObj.style==='dashed'?'dashed':'solid';
          style.onchange=()=>{lineObj.style=style.value;draw();renderLineList();scheduleSave();pushHistory();};

          const thickness=document.createElement('input');
          thickness.className='lc-input';thickness.type='number';thickness.min='0.5';thickness.max='12';thickness.step='0.5';
          thickness.value=String(Number.isFinite(Number(lineObj.thickness))?clamp(Number(lineObj.thickness),0.5,12):2);
          thickness.onchange=()=>{
            lineObj.thickness=round3(clamp(Number(thickness.value)||2,0.5,12));
            thickness.value=String(lineObj.thickness);
            draw();renderLineList();scheduleSave();pushHistory();
          };

          const mainGrid=document.createElement('div');
          mainGrid.className='lc-inspector-property-grid';
          mainGrid.append(inspectorField('Style',style),inspectorField('Thickness',thickness));
          body.appendChild(mainGrid);

          const color=document.createElement('input');
          color.className='lc-input';color.type='color';
          color.value=/^#[0-9a-f]{6}$/i.test(String(lineObj.color||''))?lineObj.color:'#111111';
          color.oninput=()=>{lineObj.color=color.value;draw();};
          color.onchange=()=>{renderLineList();scheduleSave();pushHistory();};
          body.appendChild(inspectorField('Color',color));

          const capField=(key)=>{
            const sel=document.createElement('select');
            sel.className='lc-input';
            [['none','None'],['arrow','Arrow'],['dot','Dot']].forEach(([v,t])=>{
              const opt=document.createElement('option');opt.value=v;opt.textContent=t;sel.appendChild(opt);
            });
            sel.value=['arrow','dot'].includes(lineObj[key])?lineObj[key]:'none';
            sel.onchange=()=>{lineObj[key]=sel.value;draw();renderLineList();scheduleSave();pushHistory();};
            return sel;
          };

          const endpointStack=document.createElement('div');
          endpointStack.className='lc-line-endpoint-stack';
          endpointStack.append(
            inspectorField('Start',capField('startCap')),
            inspectorField('End',capField('endCap'))
          );
          body.appendChild(endpointStack);

          body.appendChild(inspectorDeleteButton('Line',()=>{
            L.lines=L.lines.filter(x=>x.id!==lineObj.id);
            state.selectedLineId=null;
            renderLineList();renderNoteList();draw();scheduleSave();pushHistory();updateInspector();
          }));
        }

        if(note){
          const body=makeInspectorDisclosure(root,'Note','note');

          const textArea=document.createElement('textarea');
          textArea.className='lc-input lc-annotation-textarea';
          textArea.rows=4;textArea.value=String(note.text||'');
          textArea.onchange=()=>{
            const next=textArea.value.trim();
            if(next){
              note.text=next;
              if(note.radiusRef)note.radiusRef.autoText=false;
            }
            textArea.value=note.text||'';
            renderNoteList();draw();scheduleSave();pushHistory();
          };
          body.appendChild(inspectorField('Text',textArea));

          const leader=noteLeadersFor(note.id,L)[0]||null;
          const leaderBtn=document.createElement('button');
          leaderBtn.type='button';
          leaderBtn.className='lc-btn ghost sm lc-inspector-full-action lc-note-leader-action';
          leaderBtn.textContent=leader?'Remove Leader':'Add Leader';
          leaderBtn.onclick=()=>{
            if(leader){
              removeNoteLeaders(note.id,L);
            }else{
              const dx=note.x>=12?-12:Math.min(12,Math.max(0,state.cw-note.x));
              const dy=(state.ch-note.y)>=8?8:-Math.min(8,Math.max(0,note.y));
              L.lines.push({
                id:uid(),name:'Note Leader',
                x1:round3(note.x),y1:round3(note.y),
                x2:round3(clamp(note.x+dx,0,state.cw)),
                y2:round3(clamp(note.y+dy,0,state.ch)),
                style:'solid',color:'#111111',thickness:2,
                startCap:'none',endCap:'arrow',
                attachedNoteId:note.id,attachedEnd:'start'
              });
            }
            renderLineList();renderNoteList();draw();scheduleSave();pushHistory();updateInspector();
          };
          body.appendChild(leaderBtn);

          const deleteNote=inspectorDeleteButton('Note',()=>{
            deleteNoteAndLeaders(note.id,L);
            renderNoteList();renderLineList();draw();scheduleSave();pushHistory();updateInspector();
          });
          deleteNote.classList.add('lc-inspector-full-action');
          body.appendChild(deleteNote);
        }

        inspector.appendChild(root);
        return true;
      }

      function updateInspector(){
        sinkCenterlineInspectorEye=null;
        if(renderAnnotationInspector())return;
        if(renderOverlayInspector())return;
        const p = state.pieces.find(x => x.id === state.selectedId);
        if (!p) {
            inspector.className = 'lc-small';
            inspector.textContent = 'Select a piece, dimension, note, line, or overlay.';
            return;
        }
        inspector.className = '';
        inspector.innerHTML = '';

        const root = document.createElement('div');
        root.className = 'lc-item selected';

        // Compact Inspector sections; selected sections can collapse like property panels.
        function makeSection(title,{collapsible=false,key=null,collapsed=false}={}){
            const sec = document.createElement('div');
            sec.className = 'lc-subcard';

            const label = document.createElement('div');
            label.className = 'lc-subcard-label lc-small';
            const titleSpan=document.createElement('span');
            titleSpan.textContent=title;
            label.appendChild(titleSpan);

            const body = document.createElement('div');
            body.className = 'lc-subcard-body';

            if(collapsible){
              sec.classList.add('lc-inspector-collapsible');
              if(key)sec.dataset.inspectorKey=key;
              label.classList.add('lc-inspector-section-toggle');
              const arrow=document.createElement('span');
              arrow.className='lc-head-arrow';
              if(key&&!(key in inspectorSectionOpen))inspectorSectionOpen[key]=!collapsed;
              label.appendChild(arrow);
              label.setAttribute('role','button');
              label.setAttribute('tabindex','0');
              const toggle=()=>{
                if(!key)return;
                setExclusiveInspectorSection(key,!inspectorSectionOpen[key]);
              };
              label.onclick=toggle;
              label.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};
            }

            sec.append(label,body);
            root.appendChild(sec);
            return body;
        }

        // --- 1) Piece Info -------------------------------------------------------
        const pieceBody = makeSection('Piece Info',{collapsible:true,key:'pieceInfo'});

        // Row 1: name (2/3) + copy/delete (1/3)
        const r1 = document.createElement('div');
        r1.className = 'lc-row lc-inspector-name-row';
        r1.style.display = 'grid';
        r1.style.gridTemplateColumns = 'minmax(0,1fr) auto';
        r1.style.gap = '4px';

        const nameWrap = document.createElement('label');
        nameWrap.className = 'lc-label';
        nameWrap.textContent = 'Name';
        const nameInput = document.createElement('input');
        nameInput.className = 'lc-input';
        nameInput.value = p.name || '';
        nameInput.oninput = () => {
            p.name = nameInput.value;
            renderList();
            draw();
        };
        nameInput.onblur = () => {
            scheduleSave();
            pushHistory();
        };
        nameWrap.appendChild(nameInput);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'flex-end';
        actions.style.gap = '6px';

        // Duplicate button
        const btnDup = document.createElement('button');
        btnDup.className = 'lc-btn ghost lc-iconbtn';
        btnDup.title = 'Duplicate';
        btnDup.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24"><path d="M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M5 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btnDup.onclick = (e) => {
            e.preventDefault();
            const rs = realSize(p);
            const np = JSON.parse(JSON.stringify(p));
            np.id = uid();
            const sourceWasSplash=isBacksplashPiece(p);
            np.name = sourceWasSplash ? 'Splash' : (p.name || 'Piece') + ' Copy';
            if(sourceWasSplash){
              np.pieceType='backsplash';
              np.tags=Array.from(new Set([...(Array.isArray(np.tags)?np.tags:[]),'backsplash']));
              delete np.attachment;
            }
            np.x = clamp(snap(p.x + state.grid, state.grid), 0, state.cw - rs.w);
            np.y = clamp(snap(p.y + state.grid, state.grid), 0, state.ch - rs.h);
            const srcSlab=ensureSlabPlacement(p);
            np.slabPlacement={x:srcSlab.x+state.grid,y:srcSlab.y+state.grid,rotation:srcSlab.rotation};
            clampSlabPlacement(np);
            state.pieces.push(np);
            state.selectedId = np.id;
            renderList();
            updateInspector();
            sinksUI?.refresh?.();
            draw();
            scheduleSave();
            pushHistory();
        };

        // Delete button
        const btnDel = document.createElement('button');
        btnDel.className = 'lc-btn red lc-iconbtn';
        btnDel.title = 'Delete';
        btnDel.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 11H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z" fill="currentColor"/></svg>';
        btnDel.onclick = (e) => {
            e.preventDefault();
            const idx = state.pieces.findIndex(x => x.id === p.id);
            if (idx >= 0) {
            detachSplashChildren(p.id);
            state.pieces.splice(idx, 1);
            setSelection([]);
            state.selectedId = null;
            renderList();
            inspector.className = 'lc-small';
            inspector.textContent = 'Select a piece from the canvas or list.';
            draw();
            scheduleSave();
            pushHistory();
            }
        };

        actions.appendChild(btnDup);
        actions.appendChild(btnDel);

        r1.appendChild(nameWrap);
        r1.appendChild(actions);
        pieceBody.appendChild(r1);

        // Row 2: Width, Height, Rotation
        const r2 = document.createElement('div');
        r2.className = 'lc-row lc-inspector-size-row';
        r2.style.marginTop = '4px';
        r2.style.display = 'grid';
        r2.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        r2.style.gap = '4px';

        function makeNumField(label, value, id, step, onChange){
            const lab = document.createElement('label');
            lab.className = 'lc-label';
            lab.textContent = label;
            const input = document.createElement('input');
            input.id = id;
            input.type = 'number';
            input.className = 'lc-input';
            input.step = String(step);
            input.value = value;
            input.addEventListener('change', () => onChange(parseFloat(input.value) || 0));
            lab.appendChild(input);
            return lab;
        }

        const wField = makeNumField('Width (in)', p.w, 'insp-w', 0.25, (v) => {
            p.w = Math.max(0.25, v);
            migratePieceGeometry(p);
            clampPieceSeams(p);
            clampSlabPlacement(p);
            draw();
            updateInspector();
            scheduleSave();
            pushHistory();
        });
        const hField = makeNumField('Height (in)', p.h, 'insp-h', 0.25, (v) => {
            p.h = Math.max(0.25, v);
            migratePieceGeometry(p);
            clampPieceSeams(p);
            clampSlabPlacement(p);
            draw();
            updateInspector();
            scheduleSave();
            pushHistory();
        });
        const rotField = makeNumField('Rotation (°)', state.workspace==='slab' ? ensureSlabPlacement(p).rotation : (p.rotation || 0), 'insp-rot', 1, (v) => {
            const r = ((v % 360) + 360) % 360;
            if(state.workspace==='slab'){
              ensureSlabPlacement(p).rotation=r;
              clampSlabPlacement(p);
            }else{
              p.rotation=r;
              clampToCanvas(p);
            }
            draw();
            scheduleSave();
            pushHistory();
        });

        r2.appendChild(wField);
        r2.appendChild(hField);
        pieceBody.appendChild(r2);

        if(isLinkedSplash(p)&&p.attachment?.linkedLength!==false){
          const widthInput=wField.querySelector('input');
          if(widthInput){
            widthInput.disabled=true;
            widthInput.title='Unlink this splash from its parent to edit its length independently.';
          }
        }

        const sfField=document.createElement('label');
        sfField.className='lc-label';
        sfField.textContent='Square Feet';
        const sfInput=document.createElement('input');
        sfInput.className='lc-input lc-estimate-readonly';
        sfInput.type='text';
        sfInput.value=pieceSquareFeet(p).toFixed(2);
        sfInput.readOnly=true;
        sfInput.tabIndex=-1;
        sfInput.setAttribute('aria-label','Square Feet');
        sfField.appendChild(sfInput);

        const r3=document.createElement('div');
        r3.className='lc-row lc-inspector-rotation-row';
        r3.style.marginTop='4px';
        r3.style.display='grid';
        r3.style.gridTemplateColumns='repeat(2, minmax(0, 1fr))';
        r3.style.gap='4px';
        r3.append(rotField,sfField);
        pieceBody.appendChild(r3);

        const splashTagRow=document.createElement('label');
        splashTagRow.className='lc-overlay-check-row lc-piece-splash-tag-row';
        const splashTagCheck=document.createElement('input');
        splashTagCheck.type='checkbox';
        splashTagCheck.checked=isBacksplashPiece(p);
        const splashTagText=document.createElement('span');
        splashTagText.textContent='Splash Piece';
        splashTagCheck.onchange=()=>{
          if(splashTagCheck.checked){
            p.pieceType='backsplash';
            p.tags=Array.from(new Set([...(Array.isArray(p.tags)?p.tags:[]),'backsplash']));
          }else{
            p.tags=Array.isArray(p.tags)?p.tags.filter(tag=>tag!=='backsplash'):[];
            delete p.pieceType; delete p.splashKind; delete p.splashHeight; delete p.attachment;
          }
          renderList(); updateInspector(); draw(); scheduleSave(); pushHistory();
        };
        splashTagRow.append(splashTagCheck,splashTagText);
        if(state.workspace!=='slab')pieceBody.appendChild(splashTagRow);

        if(state.workspace!=='slab'&&isLinkedSplash(p)){
          const linkedRow=document.createElement('label');
          linkedRow.className='lc-overlay-check-row lc-piece-splash-link-row';
          const linkedCheck=document.createElement('input');
          linkedCheck.type='checkbox';
          linkedCheck.checked=true;
          const linkedText=document.createElement('span');
          linkedText.textContent='Linked to Parent';
          linkedCheck.onchange=()=>{
            if(linkedCheck.checked)return;
            delete p.attachment;
            renderList(); updateInspector(); draw(); scheduleSave(); pushHistory();
          };
          linkedRow.append(linkedCheck,linkedText);
          pieceBody.appendChild(linkedRow);
        }

        if(state.workspace!=='slab'&&!isBacksplashPiece(p)){
          const addSplash=document.createElement('button');
          addSplash.type='button';
          addSplash.className='lc-btn ghost sm lc-inspector-full-action lc-add-splash-action';
          addSplash.textContent='+ Add Splash';
          addSplash.title='Lock Add Splash mode. Click a piece edge to create a 4" splash. Hold S for momentary mode; Esc exits locked mode.';
          addSplash.setAttribute('aria-pressed',String(momentaryToolState.locked==='splash'));
          addSplash.onclick=e=>{
            e.preventDefault();
            e.stopPropagation();
            toggleLockedTool('splash');
          };
          pieceBody.appendChild(addSplash);
          syncMomentaryToolUI();
        }else if(isBacksplashPiece(p)){
          const splashMeta=document.createElement('div');
          splashMeta.className='lc-splash-link-summary';
          const parent=state.pieces.find(piece=>piece.id===p.attachment?.parentPieceId);
          const edge=String(p.attachment?.sourceEdge||'').replace(/^./,c=>c.toUpperCase());
          splashMeta.textContent=parent
            ? `Splash · linked to ${parent.name||'Parent Piece'} · ${edge} edge · ${isSplashSnappedToParent(p)?'Snapped':'Free position'}`
            : 'Splash piece · unlinked';
          pieceBody.appendChild(splashMeta);
        }

        // --- 2) Canvas Appearance -------------------------------------------------
        const appBody = makeSection('Appearance',{collapsible:true,key:'appearance'});

        // Row 1: full-width color selector.
        const colorRow=document.createElement('label');
        colorRow.className='lc-label lc-piece-color-row';
        colorRow.textContent='Color';
        const cs=colorStack(
          p.color,
          val=>{
            p.color=val;
            renderList();
            draw();
          },
          val=>{
            p.color=val;
            renderList();
            draw();
            scheduleSave();
            pushHistory();
          }
        );
        colorRow.appendChild(cs.wrap);
        appBody.appendChild(colorRow);

        // Row 2: opacity gets the wide track; Fill stays compact on the right.
        const rowA=document.createElement('div');
        rowA.className='lc-row lc-inspector-appearance-row lc-piece-opacity-row';
        rowA.style.display='grid';
        rowA.style.gridTemplateColumns='minmax(0,1fr) auto';
        rowA.style.gap='6px';

        const opacityCol=document.createElement('label');
        opacityCol.className='lc-label lc-piece-opacity-field';
        const opacityHead=document.createElement('div');
        opacityHead.className='lc-opacity-head';
        const opacityText=document.createElement('span');
        opacityText.textContent='Opacity';
        const lblPct=document.createElement('span');
        lblPct.className='lc-small';
        opacityHead.append(opacityText,lblPct);

        const inFill=document.createElement('input');
        inFill.id='insp-fill';
        inFill.type='range';
        inFill.min='0';
        inFill.max='100';
        inFill.step='5';
        inFill.className='lc-input lc-opacity-range';
        opacityCol.append(opacityHead,inFill);

        const fillToggleCol=document.createElement('div');
        fillToggleCol.className='lc-label lc-piece-fill-field';
        const fillLabel=document.createElement('span');
        fillLabel.textContent='Fill';
        const btnFill=document.createElement('button');
        btnFill.type='button';
        btnFill.className='lc-btn ghost sm lc-fill-toggle';
        fillToggleCol.append(fillLabel,btnFill);

        rowA.append(opacityCol,fillToggleCol);
        appBody.appendChild(rowA);

        function syncFillControls(){
          const pct=Math.round(getFillOpacity(p)*100);
          inFill.value=String(pct);
          lblPct.textContent=pct+'%';
          syncOpacityRangeVisual(inFill);
          inFill.disabled=!!p.noFill;
          const on=!p.noFill;
          btnFill.textContent=on?'Fill: On':'Fill: Off';
          btnFill.classList.toggle('alt',on);
          btnFill.classList.toggle('ghost',!on);
        }

        inFill.addEventListener('input',()=>{
          const pct=parseFloat(inFill.value)||0;
          p.fillOpacity=Math.max(0,Math.min(1,pct/100));
          lblPct.textContent=Math.round(p.fillOpacity*100)+'%';
          syncOpacityRangeVisual(inFill);
          draw();
        });
        inFill.addEventListener('change',()=>{
          scheduleSave();
          pushHistory();
        });

        btnFill.addEventListener('click',()=>{
          p.noFill=!p.noFill;
          syncFillControls();
          draw();
          scheduleSave();
          pushHistory();
        });

        syncFillControls();

        // Row 3: full-width layer control.
        const rowB=document.createElement('div');
        rowB.className='lc-row lc-inspector-layer-row lc-piece-layer-row';
        rowB.style.marginTop='2px';

        function mkBtn(label,cls,handler){
          const b=document.createElement('button');
          b.type='button';
          b.className='lc-btn '+cls;
          b.textContent=label;
          b.onclick=handler;
          return b;
        }

        const bBack=mkBtn('','ghost sm lc-iconbtn lc-layer-action',()=>{
          sendBackward(p);
          renderList();
          updateInspector();
          sinksUI?.refresh?.();
          draw();
          scheduleSave();
          pushHistory();
        });
        bBack.title='Send Backward';
        bBack.setAttribute('aria-label','Send Backward');
        bBack.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24"><path d="M7 7h10v10H7zM4 4h10v10H4z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

        const layerDisplay=document.createElement('div');
        layerDisplay.className='lc-layer-display';
        layerDisplay.textContent='Layer '+String(p.layer??0);

        const bFwd=mkBtn('','ghost sm lc-iconbtn lc-layer-action',()=>{
          bringForward(p);
          renderList();
          updateInspector();
          sinksUI?.refresh?.();
          draw();
          scheduleSave();
          pushHistory();
        });
        bFwd.title='Bring Forward';
        bFwd.setAttribute('aria-label','Bring Forward');
        bFwd.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24"><path d="M4 4h10v10H4zM7 7h10v10H7z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

        rowB.append(bBack,layerDisplay,bFwd);
        if(state.workspace!=='slab')appBody.appendChild(rowB);

        // --- 3) Sinks -------------------------------------------------------------
        if(sinksMountEl){
          const sinksSec=document.createElement('div');
          sinksSec.className='lc-subcard lc-inspector-collapsible lc-sinks-section';
          sinksSec.dataset.inspectorKey='sinks';

          const sinksHead=document.createElement('div');
          sinksHead.className='lc-subcard-label lc-small lc-inspector-section-toggle';
          const sinksTitle=document.createElement('span');
          sinksTitle.textContent='Sinks';
          const sinksArrow=document.createElement('span');
          sinksArrow.className='lc-head-arrow';

          sinkCenterlineInspectorEye=document.createElement('button');
          sinkCenterlineInspectorEye.type='button';
          sinkCenterlineInspectorEye.className='lc-btn ghost lc-iconbtn lc-sinks-dims-eye';
          sinkCenterlineInspectorEye.onclick=e=>{
            e.preventDefault();
            e.stopPropagation();
            state.showSinkCenterlines=!state.showSinkCenterlines;
            syncSinkCenterlineVisibilityUI();
            syncViewMenuUI?.();
            draw();
            scheduleSave?.();
            pushHistory();
            syncTopBar?.();
          };

          const sinksHeadActions=document.createElement('span');
          sinksHeadActions.className='lc-sinks-head-actions';
          sinksHeadActions.append(sinkCenterlineInspectorEye,sinksArrow);
          sinksHead.append(sinksTitle,sinksHeadActions);
          syncSinkCenterlineVisibilityUI();

          const sinksBody=document.createElement('div');
          sinksBody.className='lc-subcard-body lc-sinks-collapse-body';

          const addSink=document.createElement('button');
          addSink.type='button';
          addSink.className='lc-btn ghost sm lc-add-inspector-item';
          addSink.textContent='+ Add Sink';
          addSink.title='Add Sink';
          addSink.onclick=e=>{
            e.preventDefault();e.stopPropagation();
            sinksOpen=true;
            setExclusiveInspectorSection('sinks',true);
            syncSinks();
            sinksUI?.add?.();
          };
          sinksBody.append(addSink,sinksMountEl);

          const syncSinks=()=>{
            const open=!!inspectorSectionOpen.sinks;
            sinksSec.classList.toggle('is-open',open);
            sinksBody.hidden=!open;
            sinksArrow.textContent=open?'▾':'▸';
            sinksHead.setAttribute('aria-expanded',String(open));
          };
          sinksHead.setAttribute('role','button');
          sinksHead.setAttribute('tabindex','0');
          sinksHead.onclick=e=>{
            if(e.target.closest('button'))return;
            setExclusiveInspectorSection('sinks',!inspectorSectionOpen.sinks);
            syncSinks();
          };
          sinksHead.onkeydown=e=>{
            if(e.key==='Enter'||e.key===' '){
              e.preventDefault();
              setExclusiveInspectorSection('sinks',!inspectorSectionOpen.sinks);
              syncSinks();
            }
          };
          syncSinks();

          sinksSec.append(sinksHead,sinksBody);
          root.appendChild(sinksSec);
        }

        // --- 4) Piece Seams --------------------------------------------------------
        const seamBody = makeSection('Seams',{collapsible:true,key:'seams',collapsed:true});
        clampPieceSeams(p);

        const seamRows=document.createElement('div');
        seamRows.className='lc-seam-list';
        seamRows.style.display='grid';
        seamRows.style.gap='4px';

        p.pieceSeams.forEach((ps,idx)=>{
            const card=document.createElement('div');
            card.className='lc-seam-row';
            card.style.border='1px solid var(--border, #ddd)';
            card.style.borderRadius='3px';
            card.style.padding='5px';

            const head=document.createElement('div');
            head.style.display='flex';
            head.style.alignItems='center';
            head.style.justifyContent='space-between';
            head.style.gap='8px';

            const title=document.createElement('div');
            title.className='lc-small';
            title.style.fontWeight='600';
            title.textContent=`Seam ${idx+1}`;

            const del=document.createElement('button');
            del.type='button';
            del.className='lc-btn red lc-iconbtn';
    del.title='Delete seam';
    del.innerHTML='<svg class="lc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 11H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z" fill="currentColor"/></svg>';
            del.onclick=e=>{
              e.preventDefault();
              p.pieceSeams=p.pieceSeams.filter(x=>x.id!==ps.id);
              updateInspector();
              draw();
              scheduleSave();
              pushHistory();
            };

            head.append(title,del);
            card.appendChild(head);

            const fields=document.createElement('div');
            fields.style.display='grid';
            fields.style.gridTemplateColumns='repeat(3, minmax(0, 1fr))';
            fields.style.gap='4px';
            fields.style.marginTop='4px';

            const dirLab=document.createElement('label');
            dirLab.className='lc-label';
            dirLab.textContent='Direction';
            const dir=document.createElement('select');
            dir.className='lc-input';
            [['vertical','Vertical'],['horizontal','Horizontal']].forEach(([v,t])=>{
              const o=document.createElement('option');o.value=v;o.textContent=t;dir.appendChild(o);
            });
            dir.value=ps.orientation;
            dir.onchange=()=>{
              ps.orientation=dir.value==='horizontal'?'horizontal':'vertical';
              ps.reference=ps.orientation==='horizontal'?'top':'left';
              const max=ps.orientation==='horizontal'?p.h:p.w;
              ps.offset=round3(clamp(Number(ps.offset)||0,0,max));
              updateInspector();
              draw();
              scheduleSave();
              pushHistory();
            };
            dirLab.appendChild(dir);

            const refLab=document.createElement('label');
            refLab.className='lc-label';
            refLab.textContent='From';
            const ref=document.createElement('select');
            ref.className='lc-input';
            const refOpts=ps.orientation==='horizontal'
              ? [['top','Top'],['bottom','Bottom']]
              : [['left','Left'],['right','Right']];
            refOpts.forEach(([v,t])=>{
              const o=document.createElement('option');o.value=v;o.textContent=t;ref.appendChild(o);
            });
            ref.value=ps.reference;
            ref.onchange=()=>{
              ps.reference=ref.value;
              draw();
              scheduleSave();
              pushHistory();
            };
            refLab.appendChild(ref);

            const offLab=document.createElement('label');
            offLab.className='lc-label';
            offLab.textContent='Offset (in)';
            const off=document.createElement('input');
            off.type='number';
            off.className='lc-input';
            off.step='0.25';
            off.min='0';
            off.max=String(ps.orientation==='horizontal'?p.h:p.w);
            off.value=fmt3(ps.offset);
            off.onchange=()=>{
              const max=ps.orientation==='horizontal'?p.h:p.w;
              ps.offset=round3(clamp(Number(off.value)||0,0,max));
              off.value=fmt3(ps.offset);
              draw();
              scheduleSave();
              pushHistory();
            };
            offLab.appendChild(off);

            fields.append(dirLab,refLab,offLab);
            card.appendChild(fields);
            seamRows.appendChild(card);
        });

        if(!p.pieceSeams.length){
          const empty=document.createElement('div');
          empty.className='lc-small';
          empty.textContent='No seams on this piece.';
          empty.style.opacity='.7';
          seamRows.appendChild(empty);
        }

        const addSeam=document.createElement('button');
        addSeam.type='button';
        addSeam.className='lc-btn ghost sm lc-add-inspector-item';
        addSeam.textContent='+ Add Seam';
        addSeam.style.marginTop='4px';
        addSeam.onclick=e=>{
          e.preventDefault();
          migratePieceSeams(p);
          p.pieceSeams.push({
            id:uid(),
            orientation:'vertical',
            reference:'left',
            offset:round3(Math.max(0,p.w/2))
          });
          updateInspector();
          draw();
          scheduleSave();
          pushHistory();
        };
        seamBody.append(addSeam,seamRows);

        // --- 5) Edges & Corners ---------------------------------------------------
        const edgeBody = makeSection('Edges & Corners',{collapsible:true,key:'edgeOptions',collapsed:true});

        const edgeRow = document.createElement('div');
        edgeRow.className = 'lc-row lc-inspector-edge-row';
        edgeRow.style.display = 'grid';
        edgeRow.style.gridTemplateColumns = 'minmax(0,1fr)';
        edgeRow.style.gap = '5px';

        // Spatial edge/corner editor: edge profiles outside, radii inside.
        migratePieceGeometry(p);

        const edgeOptions = [
          { v:'none', t:'None' },
          { v:'flat', t:'Flat' },
          { v:'quarter', t:'Quarter' },
          { v:'bevel', t:'Bevel' },
          { v:'half-bull', t:'Half bull' },
          { v:'full-bull', t:'Full bull' },
          { v:'ogee', t:'Ogee' },
          { v:'miter', t:'Miter' },
          { v:'seam', t:'Seam' }
        ];

        const edgeProfileIcon=value=>{
          const v=normalizeEdgeProfile(value);
          const paths={
            none:'<path d="M3 8h18" opacity=".35"/>',
            flat:'<path d="M3 4h16v8H3"/>',
            quarter:'<path d="M3 4h12c3 0 5 2 5 5v3H3"/>',
            bevel:'<path d="M3 4h12l5 5v3H3"/>',
            'half-bull':'<path d="M3 4h12c3 0 5 2 5 4v4H3"/>',
            'full-bull':'<path d="M3 4h11c4 0 7 1.8 7 4s-3 4-7 4H3"/>',
            ogee:'<path d="M3 4h10c4 0 3 3 6 3 2 0 2 2 2 5H3"/>',
            miter:'<path d="M3 4H21M3 4V12H16L21 7"/>',
            seam:'<path d="M3 4h18M3 12h18M12 4v8"/>'
          };
          return '<svg class="lc-edge-profile-icon" viewBox="0 0 24 16" aria-hidden="true">'+
            '<g fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">'+paths[v]+'</g></svg>';
        };

        const edgeDesigner=document.createElement('div');
        edgeDesigner.className='lc-edge-designer';

        const edgeDiagram=document.createElement('div');
        edgeDiagram.className='lc-edge-designer-diagram';

        function makeEdgeSelect(side,labelText){
          const wrap=document.createElement('div');
          wrap.className='lc-edge-control lc-edge-control-'+side;
          wrap.title=labelText+' edge profile';

          const button=document.createElement('button');
          button.type='button';
          button.className='lc-edge-profile-picker-button lc-edge-profile-picker-button-'+side;
          button.setAttribute('aria-label',labelText+' edge profile');
          button.setAttribute('aria-haspopup','listbox');
          button.setAttribute('aria-expanded','false');

          const icon=document.createElement('span');
          icon.className='lc-edge-profile-picker-icon';
          const text=document.createElement('span');
          text.className='lc-edge-profile-picker-text';
          const chevron=document.createElement('span');
          chevron.className='lc-edge-profile-picker-chevron';
          chevron.innerHTML='<svg viewBox="0 0 10 6" aria-hidden="true"><path d="m1 1 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          button.append(icon,text,chevron);

          const menu=document.createElement('div');
          menu.className='lc-edge-profile-picker-menu lc-edge-profile-picker-menu-'+side;
          menu.hidden=true;
          menu.setAttribute('role','listbox');

          const sync=()=>{
            const value=normalizeEdgeProfile(p.edgeProfiles[side]);
            const opt=edgeOptions.find(item=>item.v===value)||edgeOptions[0];
            icon.innerHTML=edgeProfileIcon(value);
            text.textContent=opt.t;
            menu.querySelectorAll('[data-edge-profile]').forEach(row=>{
              const selected=row.dataset.edgeProfile===value;
              row.classList.toggle('is-selected',selected);
              row.setAttribute('aria-selected',String(selected));
            });
          };

          edgeOptions.forEach(opt=>{
            const row=document.createElement('button');
            row.type='button';
            row.className='lc-edge-profile-option';
            row.dataset.edgeProfile=opt.v;
            row.setAttribute('role','option');
            row.innerHTML=edgeProfileIcon(opt.v)+'<span>'+opt.t+'</span>';
            row.onclick=e=>{
              e.preventDefault();
              e.stopPropagation();
              p.edgeProfiles[side]=normalizeEdgeProfile(opt.v);
              closePicker();
              sync();
              draw();
              scheduleSave();
              pushHistory();
            };
            menu.appendChild(row);
          });

          let outsidePickerHandler=null;
          const closePicker=({focus=false}={})=>{
            menu.hidden=true;
            button.setAttribute('aria-expanded','false');
            wrap.classList.remove('is-open');
            if(outsidePickerHandler){
              document.removeEventListener('pointerdown',outsidePickerHandler,true);
              outsidePickerHandler=null;
            }
            if(focus)button.focus();
          };
          const openPicker=()=>{
            edgeDiagram.querySelectorAll('.lc-edge-control.is-open').forEach(other=>{
              if(other!==wrap){
                other.classList.remove('is-open');
                const otherButton=other.querySelector('.lc-edge-profile-picker-button');
                const otherMenu=other.querySelector('.lc-edge-profile-picker-menu');
                if(otherButton)otherButton.setAttribute('aria-expanded','false');
                if(otherMenu)otherMenu.hidden=true;
              }
            });
            menu.hidden=false;
            button.setAttribute('aria-expanded','true');
            wrap.classList.add('is-open');
            setTimeout(()=>{
              outsidePickerHandler=event=>{
                if(wrap.contains(event.target))return;
                closePicker();
              };
              document.addEventListener('pointerdown',outsidePickerHandler,true);
            },0);
          };

          button.onclick=e=>{
            e.preventDefault();
            e.stopPropagation();
            if(menu.hidden)openPicker();
            else closePicker();
          };
          wrap.onkeydown=e=>{
            if(e.key==='Escape'){
              e.preventDefault();
              closePicker({focus:true});
            }
          };
          wrap.onfocusout=e=>{
            if(!wrap.contains(e.relatedTarget))closePicker();
          };

          wrap.append(button,menu);
          sync();
          return wrap;
        }

        const pieceBox=document.createElement('div');
        pieceBox.className='lc-edge-piece-box';

        const crossV=document.createElement('div');
        crossV.className='lc-edge-cross lc-edge-cross-v';
        const crossH=document.createElement('div');
        crossH.className='lc-edge-cross lc-edge-cross-h';
        const pieceWord=document.createElement('span');
        pieceWord.className='lc-edge-piece-word';
        pieceWord.textContent='PIECE';
        pieceBox.append(crossV,crossH,pieceWord);

        const maxRadius=Math.max(0,Math.min(Number(p.w)||0,Number(p.h)||0)/2);
        const cornerKeys=[
          ['tl','Top-left'],
          ['tr','Top-right'],
          ['bl','Bottom-left'],
          ['br','Bottom-right']
        ];
        const cornerButtons={};
        let manualRadiusActive=false;
        let manualRadiusInputs=[];
        let manualRadiusOutsideHandler=null;

        const cornerValueLabel=value=>{
          const n=round3(Number(value)||0);
          return Number.isInteger(n)?String(n):String(n).replace(/0+$/,'').replace(/\.$/,'');
        };

        function syncCornerButton(key){
          const button=cornerButtons[key];
          if(!button)return;
          const value=round3(Number(p.cornerRadii[key])||0);
          button.textContent=cornerValueLabel(value);
          button.classList.toggle('active',value>0);
          button.setAttribute('aria-pressed',String(value>0));
          button.title=(value>0?'Turn off ':'Set 1" ')+button.dataset.cornerTitle+' radius';
        }

        function setCornerRadiusValue(key,value,{history=true}={}){
          p.cornerRadii[key]=round3(clamp(Number(value)||0,0,maxRadius));
          migratePieceGeometry(p);
          syncCornerButton(key);
          draw();
          scheduleSave();
          if(history)pushHistory();
        }

        function makeCornerButton(key,titleText){
          const button=document.createElement('button');
          button.type='button';
          button.className='lc-edge-corner-toggle lc-edge-corner-toggle-'+key;
          button.dataset.cornerKey=key;
          button.dataset.cornerTitle=titleText;
          button.setAttribute('aria-label',titleText+' radius toggle');
          button.onclick=e=>{
            e.preventDefault();
            e.stopPropagation();
            if(manualRadiusActive)return;
            const current=Number(p.cornerRadii[key])||0;
            setCornerRadiusValue(key,current>0?0:Math.min(1,maxRadius));
          };
          cornerButtons[key]=button;
          pieceBox.appendChild(button);
          syncCornerButton(key);
        }

        function exitManualRadiusMode({commit=true}={}){
          if(!manualRadiusActive)return;
          if(commit){
            manualRadiusInputs.forEach(input=>{
              const key=input.dataset.cornerKey;
              p.cornerRadii[key]=round3(clamp(Number(input.value)||0,0,maxRadius));
            });
            migratePieceGeometry(p);
            scheduleSave();
            pushHistory();
            draw();
          }
          manualRadiusInputs.forEach(input=>input.remove());
          manualRadiusInputs=[];
          Object.values(cornerButtons).forEach(button=>{
            button.hidden=false;
            syncCornerButton(button.dataset.cornerKey);
          });
          pieceBox.classList.remove('is-manual-radius');
          manualRadiusActive=false;
          manualRadiusButton.classList.remove('is-active');
          manualRadiusButton.setAttribute('aria-pressed','false');
          if(manualRadiusOutsideHandler){
            document.removeEventListener('pointerdown',manualRadiusOutsideHandler,true);
            manualRadiusOutsideHandler=null;
          }
        }

        function enterManualRadiusMode(){
          if(manualRadiusActive)return;
          manualRadiusActive=true;
          pieceBox.classList.add('is-manual-radius');
          manualRadiusButton.classList.add('is-active');
          manualRadiusButton.setAttribute('aria-pressed','true');
          Object.values(cornerButtons).forEach(button=>{button.hidden=true;});

          cornerKeys.forEach(([key,titleText])=>{
            const input=document.createElement('input');
            input.type='number';
            input.className='lc-edge-corner-manual-input lc-edge-corner-manual-input-'+key;
            input.dataset.cornerKey=key;
            input.min='0';
            input.max=String(round3(maxRadius));
            input.step='0.25';
            input.value=cornerValueLabel(p.cornerRadii[key]);
            input.title=titleText+' radius (in)';
            input.setAttribute('aria-label',titleText+' manual radius in inches');
            input.oninput=()=>{
              p.cornerRadii[key]=round3(clamp(Number(input.value)||0,0,maxRadius));
              migratePieceGeometry(p);
              draw();
            };
            input.onkeydown=e=>{
              if(e.key==='Enter'){
                e.preventDefault();
                e.stopPropagation();
                exitManualRadiusMode({commit:true});
              }else if(e.key==='Escape'){
                e.preventDefault();
                e.stopPropagation();
                exitManualRadiusMode({commit:true});
              }
            };
            input.addEventListener('pointerdown',e=>e.stopPropagation());
            manualRadiusInputs.push(input);
            pieceBox.appendChild(input);
          });

          setTimeout(()=>{
            manualRadiusOutsideHandler=e=>{
              if(!manualRadiusActive)return;
              if(pieceBox.contains(e.target)||manualRadiusButton.contains(e.target))return;
              exitManualRadiusMode({commit:true});
            };
            document.addEventListener('pointerdown',manualRadiusOutsideHandler,true);
          },0);
        }

        cornerKeys.forEach(([key,titleText])=>makeCornerButton(key,titleText));

        edgeDiagram.append(
          makeEdgeSelect('top','Top'),
          makeEdgeSelect('left','Left'),
          pieceBox,
          makeEdgeSelect('right','Right'),
          makeEdgeSelect('bottom','Bottom')
        );

        const manualRadiusButton=document.createElement('button');
        manualRadiusButton.type='button';
        manualRadiusButton.className='lc-edge-manual-radius-action';
        manualRadiusButton.setAttribute('aria-pressed','false');
        manualRadiusButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.6-10.6-3.2-3.2L5 15.8 4 20Zm9.9-13 3.2 3.2M14.7 6.1l2-2a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1l-2 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Manual Radius</span>';
        manualRadiusButton.onclick=e=>{
          e.preventDefault();
          e.stopPropagation();
          if(manualRadiusActive)exitManualRadiusMode({commit:true});
          else enterManualRadiusMode();
        };

        const radiusLabelButton=document.createElement('button');
        radiusLabelButton.type='button';
        radiusLabelButton.className='lc-edge-manual-radius-action lc-radius-label-action';
        radiusLabelButton.setAttribute('aria-pressed','false');
        radiusLabelButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M7 5h12v12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Label Radius</span>';
        radiusLabelButton.onclick=e=>{
          e.preventDefault();
          e.stopPropagation();
          if(manualRadiusActive)exitManualRadiusMode({commit:true});
          toggleLockedTool('radius');
        };

        const edgeHint=document.createElement('div');
        edgeHint.className='lc-small lc-edge-designer-hint';
        edgeHint.textContent='Click a corner to toggle a 1" radius. Manual Radius allows custom values; Label Radius creates linked canvas callouts.';

        edgeDesigner.append(edgeDiagram,manualRadiusButton,radiusLabelButton,edgeHint);
        syncMomentaryToolUI();
        edgeRow.appendChild(edgeDesigner);
        edgeBody.appendChild(edgeRow);

        // Keep the property flow aligned with the drawing workflow:
        // Piece Info → Appearance → Edges & Corners → Sinks → Seams.
        ['pieceInfo','appearance','edgeOptions','sinks','seams'].forEach(key=>{
          const section=root.querySelector(':scope > [data-inspector-key="'+key+'"]');
          if(section)root.appendChild(section);
        });

        inspector.appendChild(root);
        syncInspectorAccordionDom();

        // Inspector card is intentionally content-sized.
        }
  

      function drawLines(){
        const L=cur(); if(!state.showLines||!L||!Array.isArray(L.lines)) return;
        L.lines.forEach(lineObj=>{
          if(isRadiusAnnotation(lineObj)&&state.showRadiusLabels===false)return;
          // A leader is part of its Note annotation, so Hide Notes hides the leader too.
          if(lineObj.attachedNoteId&&!state.showNotes)return;

          if(lineObj.attachedNoteId&&Array.isArray(L.notes)){
            const attachedNote=L.notes.find(note=>note.id===lineObj.attachedNoteId);
            if(attachedNote){
              if(lineObj.attachedEnd==='end'){
                lineObj.x2=round3(attachedNote.x);lineObj.y2=round3(attachedNote.y);
              }else{
                lineObj.attachedEnd='start';
                lineObj.x1=round3(attachedNote.x);lineObj.y1=round3(attachedNote.y);
              }
            }
          }

          const style=lineObj.style==='dashed'?'dashed':'solid';
          const color=/^#[0-9a-f]{6}$/i.test(String(lineObj.color||''))?lineObj.color:'#111111';
          const rawThickness=Number(lineObj.thickness);
          const thickness=Number.isFinite(rawThickness)?clamp(rawThickness,0.5,12):2;
          const selected=state.selectedLineId===lineObj.id;

          const g=document.createElementNS(svgNS,'g');
          g.setAttribute('data-line-id',lineObj.id);
          g.style.cursor=activeToolCursor()||'pointer';

          const x1px=i2p(lineObj.x1),y1px=i2p(lineObj.y1),x2px=i2p(lineObj.x2),y2px=i2p(lineObj.y2);
          const vx=x2px-x1px,vy=y2px-y1px,vlen=Math.hypot(vx,vy);
          const ux=vlen>0.001?vx/vlen:0,uy=vlen>0.001?vy/vlen:0;
          const arrowLen=Math.max(9,thickness*3.5);
          const arrowHalf=Math.max(4,thickness*1.8);
          const dotR=Math.max(3.5,thickness*1.35);
          const startCap=['arrow','dot'].includes(lineObj.startCap)?lineObj.startCap:'none';
          const endCap=['arrow','dot'].includes(lineObj.endCap)?lineObj.endCap:'none';

          const hit=svgEl('line',{
            x1:x1px,y1:y1px,x2:x2px,y2:y2px,
            stroke:'rgba(0,0,0,0.001)',
            'stroke-width':Math.max(14,thickness+10),
            'vector-effect':'non-scaling-stroke'
          });

          // Keep the editable geometry at the true endpoints, but visually stop the
          // stroke at the base of an arrowhead so the arrow tip remains crisp.
          const maxTrim=vlen*0.45;
          const startTrim=startCap==='arrow'?Math.min(arrowLen,maxTrim):0;
          const endTrim=endCap==='arrow'?Math.min(arrowLen,maxTrim):0;
          const drawX1=x1px+ux*startTrim,drawY1=y1px+uy*startTrim;
          const drawX2=x2px-ux*endTrim,drawY2=y2px-uy*endTrim;

          const attrs={
            x1:drawX1,y1:drawY1,x2:drawX2,y2:drawY2,
            stroke:color,
            'stroke-width':selected?thickness+1:thickness,
            'vector-effect':'non-scaling-stroke',
            'pointer-events':'none',
            class:'lc-free-line-visible',
            'data-base-width':thickness
          };
          if(style==='dashed')attrs['stroke-dasharray']='8 4';
          const visible=svgEl('line',attrs);
          g.append(hit,visible);

          // Optional endpoint decorations. Start/End refer to point 1 / point 2.
          if(vlen>0.001){
            const addCap=(kind,x,y,dirX,dirY)=>{
              if(kind==='dot'){
                g.appendChild(svgEl('circle',{
                  cx:x,cy:y,r:dotR,fill:color,stroke:'none','pointer-events':'none',
                  class:'lc-line-cap'
                }));
              }else if(kind==='arrow'){
                const bx=x-dirX*arrowLen,by=y-dirY*arrowLen;
                const perpX=-dirY,perpY=dirX;
                const points=[
                  `${x},${y}`,
                  `${bx+perpX*arrowHalf},${by+perpY*arrowHalf}`,
                  `${bx-perpX*arrowHalf},${by-perpY*arrowHalf}`
                ].join(' ');
                g.appendChild(svgEl('polygon',{
                  points,fill:color,stroke:'none','pointer-events':'none',
                  class:'lc-line-cap'
                }));
              }
            };

            addCap(startCap,x1px,y1px,-ux,-uy);
            addCap(endCap,x2px,y2px,ux,uy);
          }

          g.addEventListener('pointerdown',ev=>{
            if(state.dimTool||state.lineTool)return;
            ev.preventDefault();ev.stopPropagation();
            state.selectedLineId=lineObj.id;state.selectedDimId=null;state.selectedNoteId=null;clearSelection();renderLineList();renderDimList();renderNoteList();updateInspector();draw();

            const p0=svgPoint(ev),sx=p2i(p0.x),sy=p2i(p0.y);
            const x1=lineObj.x1,y1=lineObj.y1,x2=lineObj.x2,y2=lineObj.y2;
            let moved=false;

            const move=mv=>{
              const q=svgPoint(mv),dx=p2i(q.x)-sx,dy=p2i(q.y)-sy;
              if(!moved&&Math.hypot(q.x-p0.x,q.y-p0.y)<=3)return;
              moved=true;
              const minX=Math.min(x1,x2),maxX=Math.max(x1,x2),minY=Math.min(y1,y2),maxY=Math.max(y1,y2);
              const cdx=clamp(dx,-minX,state.cw-maxX),cdy=clamp(dy,-minY,state.ch-maxY);
              lineObj.x1=round3(x1+cdx);lineObj.y1=round3(y1+cdy);
              lineObj.x2=round3(x2+cdx);lineObj.y2=round3(y2+cdy);
              draw();
            };

            const up=()=>{
              document.removeEventListener('pointermove',move,true);
              document.removeEventListener('pointerup',up,true);
              document.removeEventListener('pointercancel',up,true);
              if(moved){renderLineList();updateInspector();scheduleSave();pushHistory();}
            };
            document.addEventListener('pointermove',move,true);
            document.addEventListener('pointerup',up,true);
            document.addEventListener('pointercancel',up,true);
          });

          if(selected){
            const handle=(which,x,y)=>{
              const h=svgEl('circle',{cx:i2p(x),cy:i2p(y),r:5,fill:'#fff',stroke:'#2563eb','stroke-width':2,'vector-effect':'non-scaling-stroke',class:'lc-line-handle'});
              h.style.cursor='crosshair';
              h.addEventListener('pointerdown',ev=>{
                if(state.dimTool||state.lineTool)return;
                ev.preventDefault();ev.stopPropagation();

                const move=mv=>{
                  const q=svgPoint(mv);
                  let sn=snapLinePoint({x:p2i(q.x),y:p2i(q.y)});
                  const fixed=which===1?{x:lineObj.x2,y:lineObj.y2}:{x:lineObj.x1,y:lineObj.y1};
                  sn=constrainDrawPoint(fixed,sn,!!mv.shiftKey||drawShiftHeld);
                  if(which===1){lineObj.x1=round3(sn.x);lineObj.y1=round3(sn.y);}
                  else{lineObj.x2=round3(sn.x);lineObj.y2=round3(sn.y);}
                  draw();
                };

                const up=()=>{
                  document.removeEventListener('pointermove',move,true);
                  document.removeEventListener('pointerup',up,true);
                  document.removeEventListener('pointercancel',up,true);
                  renderLineList();scheduleSave();pushHistory();
                };
                document.addEventListener('pointermove',move,true);
                document.addEventListener('pointerup',up,true);
                document.addEventListener('pointercancel',up,true);
              });
              g.appendChild(h);
            };
            const attachedEnd=lineObj.attachedNoteId?(lineObj.attachedEnd==='end'?'end':'start'):null;
            if(attachedEnd!=='start')handle(1,lineObj.x1,lineObj.y1);
            if(attachedEnd!=='end')handle(2,lineObj.x2,lineObj.y2);
          }

          svg.appendChild(g);
        });
      }

      function clearNonNoteCanvasSelectionVisuals(){
        // Notes can be selected without rebuilding the SVG so double-click editing
        // remains reliable. Clear any previously-painted selection chrome manually.
        svg.querySelectorAll('g.dim-line.selected').forEach(g=>{
          g.classList.remove('selected');
          g.querySelectorAll('line').forEach(line=>line.setAttribute('stroke-width','1'));
          g.querySelectorAll('circle').forEach(handle=>handle.remove());
        });

        svg.querySelectorAll('g[data-line-id]').forEach(g=>{
          const line=g.querySelector('line.lc-free-line-visible');
          if(line)line.setAttribute('stroke-width',line.getAttribute('data-base-width')||'2');
          g.querySelectorAll('circle.lc-line-handle').forEach(handle=>handle.remove());
        });

        svg.querySelectorAll('g[data-id] path').forEach(path=>{
          if(path.getAttribute('stroke')==='#0ea5e9') path.remove();
        });
      }

      function drawNotes(){
        const L=cur();
        if(!state.showNotes||!L||!Array.isArray(L.notes))return;

        L.notes.forEach(note=>{
          if(isRadiusAnnotation(note)&&state.showRadiusLabels===false)return;
          const g=document.createElementNS(svgNS,'g');
          g.setAttribute('data-note-id',note.id);
          g.style.cursor='move';

          const t=document.createElementNS(svgNS,'text');
          t.setAttribute('x',i2p(note.x));
          t.setAttribute('y',i2p(note.y));
          t.setAttribute('font-size','13');
          t.setAttribute('font-weight','600');
          t.setAttribute('fill',state.selectedNoteId===note.id?'#2563eb':'#111');
          t.setAttribute('paint-order','stroke');
          t.setAttribute('stroke','#fff');
          t.setAttribute('stroke-width','3');

          String(note.text||'Note').split('\n').forEach((row,i)=>{
            const sp=document.createElementNS(svgNS,'tspan');
            sp.setAttribute('x',i2p(note.x));
            sp.setAttribute('dy',i?'1.25em':'0');
            sp.textContent=row||' ';
            t.appendChild(sp);
          });

          g.appendChild(t);

          if(state.selectedNoteId===note.id){
            const h=document.createElementNS(svgNS,'circle');
            h.setAttribute('data-note-selection','1');
            h.setAttribute('cx',i2p(note.x));
            h.setAttribute('cy',i2p(note.y));
            h.setAttribute('r','4');
            h.setAttribute('fill','#fff');
            h.setAttribute('stroke','#2563eb');
            h.setAttribute('stroke-width','2');
            h.setAttribute('vector-effect','non-scaling-stroke');
            h.setAttribute('pointer-events','none');
            g.insertBefore(h,t);
          }

          t.addEventListener('dblclick',e=>{
            e.preventDefault();
            e.stopPropagation();
            state.selectedNoteId=note.id;
            state.selectedDimId=null;
            state.selectedLineId=null;
            clearSelection();
            renderList();
            renderDimList();
            renderLineList();
            renderNoteList();
            updateInspector();
            openInlineNoteEditor(t,note.text||'',raw=>{
              const v=String(raw??'').trim();
              if(!v)return false;
              note.text=v;
              if(note.radiusRef)note.radiusRef.autoText=false;
              draw();
              renderNoteList();
              scheduleSave();
              pushHistory();
              return true;
            });
          });

          g.addEventListener('pointerdown',e=>{
            if(state.noteTool)return;
            e.preventDefault();
            e.stopPropagation();

            state.selectedNoteId=note.id;
            state.selectedDimId=null;
            state.selectedLineId=null;
            clearSelection();
            renderList();
            renderDimList();
            renderLineList();
            renderNoteList();
            updateInspector();
            clearNonNoteCanvasSelectionVisuals();

            // Show selection immediately without rebuilding the SVG so double-click remains reliable.
            svg.querySelectorAll('g[data-note-id] text').forEach(el=>el.setAttribute('fill','#111'));
            svg.querySelectorAll('[data-note-selection]').forEach(el=>el.remove());
            t.setAttribute('fill','#2563eb');
            const sel=document.createElementNS(svgNS,'circle');
            sel.setAttribute('data-note-selection','1');
            sel.setAttribute('cx',i2p(note.x));
            sel.setAttribute('cy',i2p(note.y));
            sel.setAttribute('r','4');
            sel.setAttribute('fill','#fff');
            sel.setAttribute('stroke','#2563eb');
            sel.setAttribute('stroke-width','2');
            sel.setAttribute('vector-effect','non-scaling-stroke');
            sel.setAttribute('pointer-events','none');
            g.insertBefore(sel,t);

            const p0=svgPoint(e);
            const sx=p2i(p0.x),sy=p2i(p0.y),nx=note.x,ny=note.y;
            let moved=false;

            const move=ev=>{
              const q=svgPoint(ev);
              const nextX=clamp(nx+p2i(q.x)-sx,0,state.cw);
              const nextY=clamp(ny+p2i(q.y)-sy,0,state.ch);
              if(Math.abs(nextX-note.x)>0.001||Math.abs(nextY-note.y)>0.001)moved=true;
              note.x=nextX;
              note.y=nextY;
              syncNoteLeaders(note,L);
              draw();
            };

            const up=()=>{
              svg.removeEventListener('pointermove',move);
              svg.removeEventListener('pointerup',up);
              svg.removeEventListener('pointercancel',up);
              renderNoteList();
              if(moved){
                draw();
                scheduleSave();
                pushHistory();
              }
            };

            svg.addEventListener('pointermove',move);
            svg.addEventListener('pointerup',up);
            svg.addEventListener('pointercancel',up);
          });

          svg.appendChild(g);
        });
      }

      // ------- Canvas interactions -------

      const blockNonMomentaryInteraction=e=>{
        const tool=activeMomentaryTool();
        if(!tool)return;
        const target=e.target;
        if(target instanceof Element){
          if(tool==='overlay' && target.closest('[data-overlay-hit="1"]'))return;
          if((tool==='splash'||tool==='splashAll') && target.closest('[data-splash-edge-hit="1"]'))return;
          if((tool==='radius'||tool==='radiusAll') && target.closest('[data-radius-corner-hit="1"]'))return;

          // Blank canvas is always an escape hatch. Let the normal blank-click
          // selection handler continue after we cancel the active tool.
          const onCanvasEntity=target.closest(
            'g[data-id], g[data-note-id], [data-overlay-hit="1"], [data-splash-edge-hit="1"], [data-radius-corner-hit="1"], [data-dim-id], [data-line-id]'
          );
          if(!onCanvasEntity){
            cancelPlacementTools({redraw:false});
            return;
          }
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
      };
      svg.addEventListener('pointerdown',blockNonMomentaryInteraction,true);
      svg.addEventListener('click',blockNonMomentaryInteraction,true);
      svg.addEventListener('dblclick',blockNonMomentaryInteraction,true);

      svg.addEventListener('pointermove',e=>{
        if(state.workspace!=='slab'||!slabDrag)return;
        const pt=svgPoint(e);
        const curI={x:p2i(pt.x),y:p2i(pt.y)};
        const rawDx=curI.x-slabDrag.startI.x,rawDy=curI.y-slabDrag.startI.y;
        const {dxMin,dxMax,dyMin,dyMax}=slabDrag.limits;
        let dx=Math.max(dxMin,Math.min(dxMax,rawDx));
        let dy=Math.max(dyMin,Math.min(dyMax,rawDy));
        slabDrag.snappedX=false;slabDrag.snappedY=false;slabDrag.guideX=null;slabDrag.guideY=null;

        if(state.pieceSnap){
          const SNAP_TOL=1.0,movingIds=new Set(slabDrag.group.map(gp=>gp.id));
          let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
          slabDrag.group.forEach(gp=>{
            minX=Math.min(minX,gp.x0);minY=Math.min(minY,gp.y0);
            maxX=Math.max(maxX,gp.x0+gp.rs.w);maxY=Math.max(maxY,gp.y0+gp.rs.h);
          });
          const movingX=[minX+dx,maxX+dx],movingY=[minY+dy,maxY+dy];
          let bestX=null,bestY=null;
          state.pieces.forEach(other=>{
            if(movingIds.has(other.id))return;
            const osp=ensureSlabPlacement(other),ors=slabRealSize(other);
            const targetX=[osp.x,osp.x+ors.w],targetY=[osp.y,osp.y+ors.h];
            movingX.forEach(mx=>targetX.forEach(tx=>{const d=tx-mx,ad=Math.abs(d);if(ad<=SNAP_TOL&&(!bestX||ad<bestX.ad))bestX={d,ad,guide:tx};}));
            movingY.forEach(my=>targetY.forEach(ty=>{const d=ty-my,ad=Math.abs(d);if(ad<=SNAP_TOL&&(!bestY||ad<bestY.ad))bestY={d,ad,guide:ty};}));
          });
          if(bestX){dx+=bestX.d;slabDrag.snappedX=true;slabDrag.guideX=bestX.guide;}
          if(bestY){dy+=bestY.d;slabDrag.snappedY=true;slabDrag.guideY=bestY.guide;}
          dx=Math.max(dxMin,Math.min(dxMax,dx));
          dy=Math.max(dyMin,Math.min(dyMax,dy));
        }

        slabDrag.group.forEach(gp=>{
          const piece=state.pieces.find(x=>x.id===gp.id);
          if(!piece)return;
          const sp=ensureSlabPlacement(piece);
          sp.x=round3(gp.x0+dx);
          sp.y=round3(gp.y0+dy);
        });
        draw();
        if(slabDrag.guideX!=null)svg.appendChild(svgEl('line',{x1:i2p(slabDrag.guideX),y1:0,x2:i2p(slabDrag.guideX),y2:i2p(state.workspace==='slab'?slabCanvasH():state.ch),stroke:'#2563eb','stroke-width':1,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
        if(slabDrag.guideY!=null)svg.appendChild(svgEl('line',{x1:0,y1:i2p(slabDrag.guideY),x2:i2p(state.workspace==='slab'?slabCanvasW():state.cw),y2:i2p(slabDrag.guideY),stroke:'#2563eb','stroke-width':1,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
      });

      svg.addEventListener('pointermove', (e) => {
      if (!state.drag) return;
      const pt = svgPoint(e);
      const curI = { x: p2i(pt.x), y: p2i(pt.y) };
      const rawDx = curI.x - state.drag.startI.x, rawDy = curI.y - state.drag.startI.y;
      const { dxMin, dxMax, dyMin, dyMax } = state.drag.limits;
      let dx=Math.max(dxMin,Math.min(dxMax,rawDx)), dy=Math.max(dyMin,Math.min(dyMax,rawDy));
      state.drag.snappedX=false; state.drag.snappedY=false; state.drag.guideX=null; state.drag.guideY=null;

      if(state.pieceSnap){
        const SNAP_TOL=1.0, movingIds=new Set(state.drag.snapIgnoreIds||state.drag.group.map(gp=>gp.id));
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        state.drag.group.forEach(gp=>{minX=Math.min(minX,gp.x0);minY=Math.min(minY,gp.y0);maxX=Math.max(maxX,gp.x0+gp.rs.w);maxY=Math.max(maxY,gp.y0+gp.rs.h);});
        const movingX=[minX+dx,maxX+dx], movingY=[minY+dy,maxY+dy];
        let bestX=null,bestY=null;
        state.pieces.forEach(other=>{
          if(movingIds.has(other.id)) return;
          const ors=realSize(other), targetX=[other.x,other.x+ors.w], targetY=[other.y,other.y+ors.h];
          movingX.forEach(mx=>targetX.forEach(tx=>{const d=tx-mx,ad=Math.abs(d);if(ad<=SNAP_TOL&&(!bestX||ad<bestX.ad))bestX={d,ad,guide:tx};}));
          movingY.forEach(my=>targetY.forEach(ty=>{const d=ty-my,ad=Math.abs(d);if(ad<=SNAP_TOL&&(!bestY||ad<bestY.ad))bestY={d,ad,guide:ty};}));
        });
        if(bestX){dx+=bestX.d;state.drag.snappedX=true;state.drag.guideX=bestX.guide;}
        if(bestY){dy+=bestY.d;state.drag.snappedY=true;state.drag.guideY=bestY.guide;}
        dx=Math.max(dxMin,Math.min(dxMax,dx));dy=Math.max(dyMin,Math.min(dyMax,dy));
      }

      const dragMovingIds=new Set(state.drag.group.map(gp=>gp.id));
      if(Math.abs(dx)>.001||Math.abs(dy)>.001){
        state.drag.group.forEach(gp=>{
          const piece=state.pieces.find(x=>x.id===gp.id);
          if(isLinkedSplash(piece)&&isSplashSnappedToParent(piece)&&!dragMovingIds.has(piece.attachment.parentPieceId)){
            piece.attachment.snapped=false;
          }
        });
      }
      state.drag.group.forEach(gp=>{const piece=state.pieces.find(x=>x.id===gp.id);if(piece){piece.x=gp.x0+dx;piece.y=gp.y0+dy;}});
      draw();
      if(state.drag.guideX!=null) svg.appendChild(svgEl('line',{x1:i2p(state.drag.guideX),y1:0,x2:i2p(state.drag.guideX),y2:i2p(state.workspace==='slab'?slabCanvasH():state.ch),stroke:'#2563eb','stroke-width':1,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
      if(state.drag.guideY!=null) svg.appendChild(svgEl('line',{x1:0,y1:i2p(state.drag.guideY),x2:i2p(state.workspace==='slab'?slabCanvasW():state.cw),y2:i2p(state.drag.guideY),stroke:'#2563eb','stroke-width':1,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
    });

      // --- Deselect all when clicking blank canvas (no drag) ---
      // Place this AFTER the pointermove handler and AFTER your endDrag wiring.
      let blankDown = null;
      const CLICK_THRESH = 4; // px of wiggle allowed and still treat as a click

      function activeToolCursor(){
        if(activeMomentaryTool()==='overlay')return 'default';
        if(activeMomentaryTool()==='splash'||activeMomentaryTool()==='splashAll'||activeMomentaryTool()==='radius'||activeMomentaryTool()==='radiusAll')return 'default';
        return state.noteTool?'text':((state.dimTool||state.lineTool)?'crosshair':'');
      }
      function syncCanvasToolCursor(){
        if(!svg)return;
        const cursor=activeToolCursor();
        if(cursor)svg.style.setProperty('cursor',cursor,'important');
        else svg.style.removeProperty('cursor');
      }
      // SVG cursor is resolved from the deepest hit element, so override that element
      // while a drawing tool is active instead of relying only on the parent SVG.
      svg.addEventListener('pointermove',e=>{
        const cursor=activeToolCursor();
        if(cursor && e.target instanceof Element){
          let el=e.target;
          while(el && el!==svg){
            el.style?.setProperty?.('cursor',cursor,'important');
            el=el.parentElement;
          }
        }
      },true);


      // ---- Dim Tool button (toggle + styling) ----
      function syncDimToolUI(){
        if(!btnDimTool)return;
        const on=!!state.dimTool;
        btnDimTool.textContent=on?'Dim Tool: On':'Dim Tool: Off';
        btnDimTool.classList.toggle('alt',on);
        btnDimTool.classList.toggle('ghost',!on);
        btnDimTool.style.background=on?'#e5e7eb':'#fff';
        btnDimTool.style.color='#111';
        syncCanvasToolCursor();
      }

      // Initialize once on load
      syncDimToolUI();

      btnDimTool && (btnDimTool.onclick=()=>{state.dimTool=!state.dimTool;if(state.dimTool){state.noteTool=false;state.lineTool=false;syncNoteToolUI();syncLineToolUI?.();}if(!state.dimTool)dimTempStart=null;syncDimToolUI();});

      svg.addEventListener('pointermove', (e) => {
        if (!dimDrag) return;

        const L = cur();
        if (!L || !Array.isArray(L.dims)) return;
        const d = L.dims.find(dd => dd.id === dimDrag.dimId);
        if (!d) return;

        const pt = svgPoint(e);
        const vx = pt.x - dimDrag.x1px;
        const vy = pt.y - dimDrag.y1px;

        // New perpendicular offset (signed) in px
        let newOff = vx * dimDrag.nx + vy * dimDrag.ny;

        // Clamp so it doesn't go crazy far
        const MAX = 300;
        newOff = Math.max(-MAX, Math.min(MAX, newOff));

        d.offsetPx = newOff;
        draw(); // live update; history/save on pointerup
      });


      let drawShiftHeld=false;
      window.addEventListener('keydown',e=>{if(e.key==='Shift')drawShiftHeld=true;});
      window.addEventListener('keyup',e=>{if(e.key==='Shift')drawShiftHeld=false;});
      window.addEventListener('blur',()=>{drawShiftHeld=false;});

      // --- Line Tool: click two snapped points to place a free canvas line ---
      let lineTempStart=null;
      svg.addEventListener('click',e=>{
        if(!state.lineTool) return;
        const L=cur(); if(!L)return; if(!Array.isArray(L.lines))L.lines=[];
        const pt=svgPoint(e); if(!pt)return;
        const raw={x:p2i(pt.x),y:p2i(pt.y)}; const snapped=snapLinePoint(raw)||raw;
        if(!lineTempStart){lineTempStart=snapped;state.selectedLineId=null;}
        else{
          const end=constrainDrawPoint(lineTempStart,snapped,!!e.shiftKey||drawShiftHeld);
          const cdx=end.x-lineTempStart.x,cdy=end.y-lineTempStart.y;
          if(Math.hypot(cdx,cdy)<0.25){e.stopPropagation();return;}
          const lineObj={id:uid(),x1:lineTempStart.x,y1:lineTempStart.y,x2:end.x,y2:end.y,style:'solid',color:'#111111',thickness:2,startCap:'none',endCap:'none'};
          L.lines.push(lineObj);state.selectedLineId=lineObj.id;state.selectedDimId=null;state.selectedNoteId=null;clearSelection();lineTempStart=null;toolPreview=null;state.lineTool=false;syncLineToolUI();draw();renderLineList();updateInspector();scheduleSave();pushHistory();
        }
        e.stopPropagation();
      });

      // Delete selected free line with Delete/Backspace.
      window.addEventListener('keydown',e=>{
        const ael=document.activeElement,tag=(ael&&ael.tagName||'').toLowerCase();
        if(tag==='input'||tag==='textarea'||tag==='select'||(ael&&ael.isContentEditable))return;
        if(e.key!=='Delete'&&e.key!=='Backspace')return;
        const L=cur();if(!L||!state.selectedLineId)return;
        const idx=L.lines.findIndex(lineObj=>lineObj.id===state.selectedLineId);if(idx<0)return;
        L.lines.splice(idx,1);state.selectedLineId=null;draw();renderLineList();renderNoteList();scheduleSave();pushHistory();updateInspector();e.preventDefault();
      });

      // --- Manual dimensions tool ---
      let dimTempStart = null;  // { x, y } in inches for first click

      svg.addEventListener('click', (e) => {
        // Only when Dim Tool is active
        if (!state.dimTool) return;

        const L = cur();
        if (!L) return;
        if (!Array.isArray(L.dims)) L.dims = [];

        // If click landed on an existing dimension, don't create a new one;
        // that click will be used to select the dim instead.
        

        // Convert click to SVG px, then to inches
        const pt = svgPoint(e);
        if (!pt) return; // safety

        const raw = { x: p2i(pt.x), y: p2i(pt.y) };

        // Try to snap to a nearby corner/edge; if nothing close, use raw point
        let snapped = snapDimPoint(raw);
        if (!snapped) snapped = raw;

        if (!dimTempStart) {
          // First point
          dimTempStart = snapped;
          state.selectedDimId = null;
        } else {
          // Second point => create a dimension
          snapped=constrainDrawPoint(dimTempStart,snapped,!!e.shiftKey||drawShiftHeld);
          const cdx=snapped.x-dimTempStart.x,cdy=snapped.y-dimTempStart.y;
          if(Math.hypot(cdx,cdy)<0.25){e.stopPropagation();return;}
          const d = {
            id: uid(),
            x1: dimTempStart.x,
            y1: dimTempStart.y,
            x2: snapped.x,
            y2: snapped.y
          };
          L.dims.push(d);
          state.selectedDimId = d.id;
          state.selectedLineId = null;
          state.selectedNoteId = null;
          clearSelection();
          dimTempStart = null;
          state.dimTool = false;
          syncDimToolUI();

          draw();
          renderDimList();
          updateInspector();
          scheduleSave();
          pushHistory();
        }

        e.stopPropagation();
      });





      svg.addEventListener('pointermove',e=>{
        const mode=state.dimTool?'dim':(state.lineTool?'line':null);
        const start=mode==='dim'?dimTempStart:(mode==='line'?lineTempStart:null);
        if(!mode){if(toolPreview){toolPreview=null;draw();}return;}
        const pt=svgPoint(e),raw={x:p2i(pt.x),y:p2i(pt.y)};
        const info=previewSnapInfo(raw,mode);
        if(!start){
          toolPreview={mode,firstPoint:true,point:info.point,snapped:info.snapped};
          draw();
          return;
        }
        const end=constrainDrawPoint(start,info.point,!!e.shiftKey||drawShiftHeld);
        toolPreview={mode,start,end,snapped:info.snapped};
        draw();
      });
      svg.addEventListener('pointerleave',()=>{if(toolPreview){toolPreview=null;draw();}});

      // Note Tool captures any click inside the SVG before piece/canvas handlers.
      document.addEventListener('pointerdown', (e)=>{
        if(activeMomentaryTool()) return;
        if(!state.noteTool) return;
        const target=e.target;
        if(!(target instanceof Element) || !svg.contains(target)) return;
        if(target.closest('g[data-note-id]')) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        const pt=svgPoint(e), L=cur();
        if(!L) return;
        if(!Array.isArray(L.notes)) L.notes=[];
        const note={id:uid(),x:round3(p2i(pt.x)),y:round3(p2i(pt.y)),text:'Note'};
        L.notes.push(note);
        state.selectedNoteId=note.id;
        state.selectedDimId=null;
        state.selectedLineId=null;
        clearSelection();
        state.noteTool=false; syncNoteToolUI();
        draw(); renderNoteList(); updateInspector(); scheduleSave(); pushHistory();

        requestAnimationFrame(()=>{
          const el=svg.querySelector(`g[data-note-id="${note.id}"] text`);
          if(!el) return;
          openInlineNoteEditor(el,'',raw=>{
            const v=String(raw??'').trim();
            if(!v){deleteNoteAndLeaders(note.id,L);renderNoteList();renderLineList();draw();scheduleSave();return true;}
            note.text=v;draw();renderNoteList();scheduleSave();pushHistory();return true;
          });
        });
        blankDown=null;
      }, true);

      svg.addEventListener('pointerdown', (e)=>{
      // When Dim Tool is active, we don't track blank clicks – they’re for dimension points
      if (state.dimTool || state.lineTool) { blankDown = null; return; }

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
        state.selectedDimId = null;
        state.selectedLineId = null;
        state.selectedNoteId = null;
        renderList(); renderDimList(); renderNoteList(); updateInspector(); sinksUI?.refresh(); draw();
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
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      };
      inScale.addEventListener(
        'input',
        e => {
          state.scale = +e.target.value;
          lblScale.textContent = String(state.scale);
          draw();                          // live preview, no history
        },
        { passive: true }
      );

      inScale.addEventListener('change', e => {
        state.scale = +e.target.value;
        lblScale.textContent = String(state.scale);
        draw();
        scheduleSave();
        pushHistory();                     // commit once when user releases
        syncTopBar?.();
      });

      inCW.onchange = e => { state.cw = Math.max(12, Number(e.target.value||0)); state.pieces.forEach(p=>{clampToCanvas(p);clampSlabPlacement(p);}); draw(); scheduleSave(); pushHistory(); syncTopBar?.(); };
      inCH.onchange = e => { state.ch = Math.max(12, Number(e.target.value||0)); state.pieces.forEach(p=>{clampToCanvas(p);clampSlabPlacement(p);}); draw(); scheduleSave(); pushHistory(); syncTopBar?.(); };
      inGrid.onchange = e => { state.grid = Math.max(0.25, Number(e.target.value||0)); draw(); scheduleSave(); pushHistory(); syncTopBar?.(); };
      btnSnapAll && (btnSnapAll.onclick = () => {
        state.pieces = state.pieces.map(p=>{
          const rs = realSize(p);
          return { ...p,
            x: clamp(snap(p.x,state.grid),0,state.cw-rs.w),
            y: clamp(snap(p.y,state.grid),0,state.ch-rs.h)
          };
        });
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });

      // Deselect All removed from the toolbar; blank-canvas click and Escape already clear selection.


      // Undo / Redo
      btnUndoTop && (btnUndoTop.onclick = (e)=>{ e.preventDefault(); undo();  syncTopBar(); });
      btnRedoTop && (btnRedoTop.onclick = (e)=>{ e.preventDefault(); redo();  syncTopBar(); });

      // Show/Hide toggles
      togGrid && (togGrid.onclick = ()=>{
        state.showGrid = !state.showGrid;
        saveCurrentWorkspaceViewState();
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });
      togDims && (togDims.onclick = ()=>{
        // per-piece dims
        state.showDims = !state.showDims;
        saveCurrentWorkspaceViewState();
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });

      togManualDims && (togManualDims.onclick = ()=> {
        state.showManualDims = !state.showManualDims;
        saveCurrentWorkspaceViewState();
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });

      togLabels && (togLabels.onclick = ()=>{
        state.showLabels = !state.showLabels;
        saveCurrentWorkspaceViewState();
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });

      togEdges && (togEdges.onclick = () => {
        state.showEdgeProfiles = !state.showEdgeProfiles;
        saveCurrentWorkspaceViewState();
        syncTopBar();
        draw();
        scheduleSave();
        pushHistory();
      });

      if (btnDimTool) {
        const updateDimToolLabel = () => {
          btnDimTool.textContent = state.dimTool ? 'Dim Tool: ON' : 'Dim Tool: Off';
          syncCanvasToolCursor();
        };

        btnDimTool.onclick = () => {
          state.dimTool = !state.dimTool;
          // reset any half-finished segment
          dimTempStart = null;
          state.selectedDimId = null;
          updateDimToolLabel();
        };

        updateDimToolLabel();
      }


      // ------- Project fields -------
      if (!state.projectDate) {
        inDate.value = todayISO();
        state.projectDate = inDate.value;
      } else {
        inDate.value = state.projectDate;
      }

      inProject.oninput = () => {
        state.projectName = inProject.value;
        syncCanvasContext?.();
        scheduleSave();
      };

      inDate.onchange = () => {
        state.projectDate = inDate.value || todayISO();
        scheduleSave();
      };

      inNotes && (inNotes.oninput = () => {
        state.notes = inNotes.value;
        scheduleSave();
      });

      if (inNotes) inNotes.value = state.notes || '';
 

      // ------- Pieces -------
      btnAdd.onclick = () => {
        cancelPlacementTools({redraw:false});
        const idx = state.pieces.length; const top = Math.max(0,...state.pieces.map(x=>x.layer||0))+1;
        const grid=Math.max(.001,Math.abs(Number(state.grid)||1));
        const splashClearance=Math.max(
          grid*3,
          DEFAULT_SPLASH_HEIGHT+SPLASH_DRAW_GAP+grid*2
        );
        const spawnInset=snap(splashClearance,grid);
        const p = { 
          id: uid(), 
          name: `Piece ${idx+1}`, 
          w:40, 
          h:25.5, 
          x:Math.min(spawnInset,Math.max(0,state.cw-40-spawnInset)), 
          y:Math.min(spawnInset,Math.max(0,state.ch-25.5-spawnInset)), 
          rotation:0, 
          color:'#ffffff', 
          layer: top, 
          rTL:false, 
          rTR:false, 
          rBL:false, 
          rBR:false, 
          cornerRadii:{tl:0,tr:0,br:0,bl:0},
          pieceSeams: [],
          edgeProfiles: {
            top: 'none',
            right: 'none',
            bottom: 'none',
            left: 'none',
          } 
        };
        clampToCanvas(p); 
        state.pieces.push(p); 
        state.selectedId=p.id; 
        renderList(); 
        updateInspector(); 
        sinksUI?.refresh(); 
        draw(); 
        scheduleSave();
        pushHistory();
        typeof syncTopBar==='function' && syncTopBar()
      };

      function duplicatePiece(p){
        const top=Math.max(0,...state.pieces.map(x=>x.layer||0))+1; 
        const rs = realSize(p);
        const sourceWasSplash=isBacksplashPiece(p);
        const srcSlab=ensureSlabPlacement(p);
        const d={...p, pieceSeams:Array.isArray(p.pieceSeams)?p.pieceSeams.map(ps=>({...ps,id:uid()})):[], slabPlacement:{x:srcSlab.x+state.grid,y:srcSlab.y+state.grid,rotation:srcSlab.rotation}, id: uid(), name: sourceWasSplash?'Splash':p.name+' Copy', x:clamp(p.x+state.grid,0,state.cw-rs.w), y:clamp(p.y+state.grid,0,state.ch-rs.h), layer:top};
        clampSlabPlacement(d);
        if(sourceWasSplash){
          d.pieceType='backsplash';
          d.tags=Array.from(new Set([...(Array.isArray(d.tags)?d.tags:[]),'backsplash']));
          delete d.attachment;
        }
        state.pieces.push(d); 
        state.selectedId=d.id; 
        renderList(); renderDimList(); renderNoteList(); updateInspector(); sinksUI?.refresh(); draw();
        scheduleSave();
        pushHistory();
        typeof syncTopBar==='function' && syncTopBar();
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
        if(typeof parsed.showGrid==='boolean'){ state.showGrid = parsed.showGrid;}
        if(typeof parsed.showDims==='boolean'){ state.showDims = parsed.showDims;}
        if(typeof parsed.showSinkCenterlines==='boolean') state.showSinkCenterlines=parsed.showSinkCenterlines;
        else if(typeof parsed.showDims==='boolean') state.showSinkCenterlines=parsed.showDims;
        if(typeof parsed.showPieceFills==='boolean'){ state.showPieceFills = parsed.showPieceFills;}
        if(typeof parsed.showSlabMaterial==='boolean'){ state.showSlabMaterial = parsed.showSlabMaterial;}
        if (Array.isArray(parsed.pieces)) {
          state.pieces = parsed.pieces.map(q => {
            const p = {
              id: uid(),
              name: q.name || 'Piece',
              w: Number(q.w) || 1, h: Number(q.h) || 1,
              x: Number(q.x) || 0, y: Number(q.y) || 0,
              rotation: (q.rotation === 90 ? 90 : Number(q.rotation) || 0),
              slabPlacement: q.slabPlacement && typeof q.slabPlacement==='object' ? {
                x:Number(q.slabPlacement.x)||0,
                y:Number(q.slabPlacement.y)||0,
                rotation:Number(q.slabPlacement.rotation)||0
              } : undefined,
              color: q.color || '#ffffff',
              layer: Number(q.layer) || 0,
              pieceType: typeof q.pieceType==='string' ? q.pieceType : undefined,
              tags: Array.isArray(q.tags) ? q.tags.map(String) : [],
              splashKind: typeof q.splashKind==='string' ? q.splashKind : undefined,
              splashHeight: Number.isFinite(Number(q.splashHeight)) ? Number(q.splashHeight) : undefined,
              attachment: q.attachment && typeof q.attachment==='object' ? {
                kind: q.attachment.kind||null,
                parentPieceId: q.attachment.parentPieceId||null,
                sourceEdge: ['top','right','bottom','left'].includes(q.attachment.sourceEdge)?q.attachment.sourceEdge:null,
                linkedLength: q.attachment.linkedLength!==false,
                snapped: typeof q.attachment.snapped==='boolean' ? q.attachment.snapped : undefined
              } : null,
              rTL: !!q.rTL, rTR: !!q.rTR, rBL: !!q.rBL, rBR: !!q.rBR,
              cornerRadii: q.cornerRadii && typeof q.cornerRadii==='object' ? {
                tl: Math.max(0,Number(q.cornerRadii.tl)||0),
                tr: Math.max(0,Number(q.cornerRadii.tr)||0),
                br: Math.max(0,Number(q.cornerRadii.br)||0),
                bl: Math.max(0,Number(q.cornerRadii.bl)||0)
              } : {
                tl:q.rTL?1:0,tr:q.rTR?1:0,br:q.rBR?1:0,bl:q.rBL?1:0
              },
              edgeProfiles: {
                top: normalizeEdgeProfile(q.edgeProfiles?.top),
                right: normalizeEdgeProfile(q.edgeProfiles?.right),
                bottom: normalizeEdgeProfile(q.edgeProfiles?.bottom),
                left: normalizeEdgeProfile(q.edgeProfiles?.left)
              },
              pieceSeams: Array.isArray(q.pieceSeams) ? q.pieceSeams.map(ps => ({
                id: ps.id || ('pseam_' + Math.random().toString(36).slice(2,9)),
                orientation: ps.orientation === 'horizontal' ? 'horizontal' : 'vertical',
                reference: ['left','right','top','bottom'].includes(ps.reference) ? ps.reference : (ps.orientation === 'horizontal' ? 'top' : 'left'),
                offset: Math.max(0, Number(ps.offset) || 0)
              })) : [],
              // NEW: bring sinks back in
              sinks: Array.isArray(q.sinks) ? q.sinks.map(s => ({
                id: s.id || ('sink_' + Math.random().toString(36).slice(2,9)),
                name: typeof s.name==='string' ? s.name : '',
                type: s.type || (s.modelId ? 'model' : 'custom'),
                modelId: s.modelId ?? null,
                shape: s.shape || 'rect',
                w: Number(s.w) || 16,
                h: Number(s.h) || 16,
                cornerR: clamp(Number(s.cornerR) || 0, 0, 4),
                side: s.side || 'front',
                centerline: Number(s.centerline) || 20,
                setback: Number(s.setback) || SINK_STANDARD_SETBACK,
                rotation: clamp(Number(s.rotation) || 0, 0, 360),
                faucets: Array.isArray(s.faucets) ? s.faucets.filter(n => Number.isFinite(n)).slice(0, 9) : [],
                faucetSetback: Number.isFinite(Number(s.faucetSetback)) ? Math.max(0,Number(s.faucetSetback)) : DEFAULT_FAUCET_SETBACK,
                faucetHoleDiameter: Number.isFinite(Number(s.faucetHoleDiameter)) && Number(s.faucetHoleDiameter)>0 ? Number(s.faucetHoleDiameter) : DEFAULT_FAUCET_HOLE_DIAMETER,
                faucetHoleSpacing: Number.isFinite(Number(s.faucetHoleSpacing)) && Number(s.faucetHoleSpacing)>0 ? Number(s.faucetHoleSpacing) : DEFAULT_FAUCET_SPACING
              })) : []
            };

            // Optional: if it’s a model sink, re-apply model dims to be safe
            (p.sinks || []).forEach(sink => {
              if (sink.type === 'model' && sink.modelId) {
                const model = SINK_MODELS.find(m => m.id === sink.modelId);
                if (model) applyModelToSink(sink, model);
              }
            });

            migratePieceForSinks(p);
            migratePieceGeometry(p);
            return p;
          });
          migrateSinkSideConvention([{pieces:state.pieces}],parsed.sinkSideConvention);
        }

        const importedLayout=cur();
        if(importedLayout){
          importedLayout.dims=Array.isArray(parsed.dims)?parsed.dims.map(d=>({...d,id:d.id||uid()})):[];
          importedLayout.lines=Array.isArray(parsed.lines)?parsed.lines.map(lineObj=>({
            ...lineObj,
            id:lineObj.id||uid(),
            style:lineObj.style==='dashed'?'dashed':'solid',
            color:/^#[0-9a-f]{6}$/i.test(String(lineObj.color||''))?lineObj.color:'#111111',
            thickness:round3(clamp(Number(lineObj.thickness)||2,0.5,12)),
            startCap:['arrow','dot'].includes(lineObj.startCap)?lineObj.startCap:'none',
            endCap:['arrow','dot'].includes(lineObj.endCap)?lineObj.endCap:'none',
            attachedNoteId:typeof lineObj.attachedNoteId==='string'?lineObj.attachedNoteId:null,
            attachedEnd:lineObj.attachedEnd==='end'?'end':'start'
          })):[];
        }

        state.selectedId = null;
        renderList(); renderDimList(); renderNoteList(); updateInspector(); sinksUI?.refresh(); draw(); syncTopBar();
      }
      
      inImport.onchange = (e)=>{
        const file = e.target.files && e.target.files[0];
        if(!file) return;

        if (importName) importName.textContent = file.name;

        const reader = new FileReader();
        reader.onload = () => {
          try{
            const parsed = JSON.parse(String(reader.result||''));

            if (Array.isArray(parsed.layouts)) {
              // full project
              state.layouts = parsed.layouts.map(L => ({ ...L, id: L.id || uid() }));
              migrateSinkSideConvention(state.layouts,parsed.sinkSideConvention);
              migrateAllSinkSettings();
              state.active  = Number.isInteger(parsed.active) ? parsed.active : 0;
              state.projectName = parsed.project?.name  || '';
              state.projectDate = parsed.project?.date  || todayISO();
              state.notes       = parsed.project?.notes || '';

              if(parsed.ui){
                state.workspace=parsed.ui.workspace==='slab'?'slab':'layout';
                if('showGrid' in parsed.ui) state.showGrid=!!parsed.ui.showGrid;
                if('showLines' in parsed.ui) state.showLines=!!parsed.ui.showLines;
                if('showNotes' in parsed.ui) state.showNotes=!!parsed.ui.showNotes;
                if('showPieceFills' in parsed.ui) state.showPieceFills=!!parsed.ui.showPieceFills;
                if('showSlabMaterial' in parsed.ui) state.showSlabMaterial=!!parsed.ui.showSlabMaterial;
                if('showDims' in parsed.ui) state.showDims=!!parsed.ui.showDims;
                if('showManualDims' in parsed.ui) state.showManualDims=!!parsed.ui.showManualDims;
                if('showEdgeProfiles' in parsed.ui) state.showEdgeProfiles=!!parsed.ui.showEdgeProfiles;
                if('showLabels' in parsed.ui) state.showLabels=!!parsed.ui.showLabels;
                if('showLabelDims' in parsed.ui) state.showLabelDims=!!parsed.ui.showLabelDims;
                if('showSplashLabels' in parsed.ui) state.showSplashLabels=!!parsed.ui.showSplashLabels;
                if('showSplashDims' in parsed.ui) state.showSplashDims=!!parsed.ui.showSplashDims;
                if('showSplashLabelDims' in parsed.ui) state.showSplashLabelDims=!!parsed.ui.showSplashLabelDims;
                if('showRadiusLabels' in parsed.ui) state.showRadiusLabels=!!parsed.ui.showRadiusLabels;
                state.showSinkCenterlines='showSinkCenterlines' in parsed.ui
                  ? !!parsed.ui.showSinkCenterlines
                  : state.showDims;
                state.workspaceViews=parsed.ui.workspaceViews&&typeof parsed.ui.workspaceViews==='object'
                  ? parsed.ui.workspaceViews
                  : null;
                if(state.workspaceViews)loadWorkspaceViewState(state.workspace);
                else ensureWorkspaceViewStates();
              }

              if (inProject) inProject.value = state.projectName;
              if (inDate)    inDate.value    = state.projectDate;
              if (inNotes)   inNotes.value   = state.notes;

              syncToolbarFromLayout();
              syncShowNotesUI?.();
              syncShowLinesUI?.();
              renderLayouts(); renderList(); updateInspector();
              sinksUI?.refresh?.(); draw();
              renderOverlayList?.(); syncOverlayUI?.();
              scheduleSave(); pushHistory(); syncTopBar?.();

            } else {
              // legacy single-layout file
              loadLayout(parsed);
              syncToolbarFromLayout?.();
              renderLayouts?.(); renderList(); updateInspector();
              sinksUI?.refresh?.(); draw();
              renderOverlayList?.(); syncOverlayUI?.();
              scheduleSave(); pushHistory(); syncTopBar?.();
            }
          }catch(_){
            alert('Failed to parse JSON');
          }
          e.target.value=''; // allow re-selecting same file later
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
        renderLayouts(); 
        renderList(); 
        updateInspector(); 
        sinksUI?.refresh(); 
        draw(); 
        renderOverlayList?.();   // <-- add
        syncOverlayUI?.();       // <-- add

        try{ localStorage.removeItem(SAVE_KEY); }catch(_){}
        scheduleSave();
        pushHistory(); 
      });


      btnExportJSON.onclick = () => {
        if(!requireProjectName()) return;
        const data = exportApp();  // <-- full project (all layouts + overlays)
        const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `${fileBase()}.json`;
        a.click();
        URL.revokeObjectURL(url);
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
      inProject.value = state.projectName;
      inDate.value = state.projectDate || todayISO();
      syncToolbarFromLayout();
      renderLayouts();

      // Try URL share first. If none, fall back to restore().
      let loadedFromHash = tryLoadFromHash();
      if (!loadedFromHash && !restore()) {
        // first-time load
        draw();
        renderOverlayList?.();
        syncOverlayUI?.();
        renderList();
        updateInspector();
        sinksUI?.refresh();
      }
      pushHistory();
      syncTopBar?.();
      renderOverlayList?.();
      syncOverlayUI?.();
      syncClipTop?.(); 

      // --- expose a minimal API for external modules (like the Sinks card) ---
      // (Always do this, regardless of restore())
      window.CADLITE = { state, svg, draw, scheduleSave, updateInspector };

      // fire a custom event so modules can safely hook in even if scripts load out of order
      document.dispatchEvent(new CustomEvent('cad:ready', { detail: window.CADLITE }));

    } // <-- end of init()
  document.addEventListener('DOMContentLoaded', init);
    })();
