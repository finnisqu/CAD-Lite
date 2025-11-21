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
        showDims: false,        // per-piece dims
        showManualDims: true,   // NEW: manual dims visibility
        showEdgeProfiles: true,  // NEW: edge profiles visibility
        dimTool: false,
        showLabels: true,
        selectedDimId: null
      };



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
        return L;
      }
      function overlays(){ const L = ensureOverlaysOnLayout(activeLayout()); return L ? L.overlays : []; }
      function currentOverlay(){
        const L = ensureOverlaysOnLayout(activeLayout());
        if (!L || L.ovSel < 0) return null;
        return L.overlays[L.ovSel] || null;
      }
      function selectOverlay(i){
        const L = ensureOverlaysOnLayout(activeLayout());
        if (!L) return;
        L.ovSel = (i>=0 && i < L.overlays.length) ? i : -1;
        renderOverlayList?.(); syncOverlayUI?.();
      }

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
        addOverlaySafe(url, name);
        closeSlabModal();
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


      // Add overlays
      function addOverlayFromDataURL(name, dataURL, natW, natH){
        const L = ensureOverlaysOnLayout(activeLayout());
        if (!L) return;
        if ((L.overlays?.length || 0) >= 2) return; // enforce limit
        const o = {
          id: uid(), name: name || 'Overlay',
          dataURL: dataURL || '', natW: natW||0, natH: natH||0,
          slabW: 126, slabH: 63, x:0, y:0, opacity:1, visible:true
        };
        L.overlays.push(o);
        L.ovSel = L.overlays.length - 1;
        renderOverlayList(); syncOverlayUI(); draw(); scheduleSave(); pushHistory();
      }

      function loadOverlayFromFileToLayout(file){
        const reader = new FileReader();
        reader.onload = async () => {
          try{
            const src = String(reader.result || '');
            // Compress right away so autosave doesn't exceed quota
            const compact = await downscaleDataURL(src, 1600, 0.82);

            // We still want the natural dimensions from the original for reference.
            const probe = new Image();
            probe.onload = () => {
              addOverlayFromDataURL(file.name || 'Overlay', compact, probe.naturalWidth, probe.naturalHeight);
            };
            probe.src = src;
          }catch(err){
            console.warn('Overlay load/compress failed:', err);
            // Fall back: add original (may fail to autosave if too big)
            addOverlayFromDataURL(file.name || 'Overlay', String(reader.result || ''), 0, 0);
          }
        };
        reader.readAsDataURL(file);
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
      if (!list) return;

      const L = ensureOverlaysOnLayout(activeLayout());
      const arr = L?.overlays || [];
      const sel = L?.ovSel ?? -1;

      // Enforce/reflect limit
      const atLimit = arr.length >= 2;
      if (btnAdd) btnAdd.disabled = atLimit;
      if (hint) hint.textContent = atLimit ? 'Limit 2 overlays per layout reached.' : '';

      list.innerHTML = '';
      if (!arr.length){
        list.innerHTML = '<div class="lc-small" style="opacity:.7;">No overlays yet. Click “Add Overlay”.</div>';
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
      const ICON_TRASH   = 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10z';

      arr.forEach((o, idx)=>{
        const row = document.createElement('div');
        row.className = 'lc-ov-row' + (idx===sel ? ' selected' : '');
        row.dataset.index = idx;

        // Eye button (tiny)
        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'lc-btn ghost xs lc-iconbtn ov-eye';
        eye.title = o.visible ? 'Hide overlay' : 'Show overlay';
        eye.appendChild(mkIcon(o.visible ? ICON_EYE : ICON_EYE_OFF));

        // Name (file name shown; full name in tooltip)
        const name = document.createElement('div');
        name.className = 'ov-name';
        name.textContent = basename(o.name || `Overlay ${idx+1}`);
        name.title = o.name || `Overlay ${idx+1}`;

        // Actions (trash only—delete)
        const actions = document.createElement('div');
        actions.className = 'ov-actions';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'lc-btn red xs lc-iconbtn ov-del';
        del.title = 'Delete overlay';
        del.appendChild(mkIcon(ICON_TRASH));
        actions.appendChild(del);

        // Click row to select (like Sinks); ignore clicks on the buttons themselves
        row.addEventListener('click', (e)=>{
          if ((e.target).closest('button')) return;
          selectOverlay(idx);
          setOverlayAccordion?.(true);
          syncOverlayUI?.();
          renderOverlayList(); // refresh selected style
        });

        // Show/Hide
        eye.addEventListener('click', (e)=>{
          e.preventDefault(); e.stopPropagation();
          o.visible = !o.visible;
          draw(); scheduleSave(); pushHistory();
          renderOverlayList();  // rebuild icon/title
          syncOverlayUI?.();
        });

        // Delete
        del.addEventListener('click', (e)=>{
          e.preventDefault(); e.stopPropagation();
          arr.splice(idx,1);
          if (L.ovSel >= arr.length) L.ovSel = arr.length - 1;
          draw(); scheduleSave(); pushHistory();
          renderOverlayList();
          syncOverlayUI?.();
        });

        row.append(eye, name, actions);
        list.appendChild(row);
      });
    }



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
        const step = (e.shiftKey ? 4 : 1) * state.grid;
        if (e.key === 'ArrowLeft')      dx = -step;
        else if (e.key === 'ArrowRight') dx = step;
        else if (e.key === 'ArrowUp')    dy = -step;
        else if (e.key === 'ArrowDown')  dy = step;
        else return;

        e.preventDefault();

        targets.forEach(p => {
          const rs = realSize(p);
          p.x = clamp(snap(p.x + dx, state.grid), 0, state.cw - rs.w);
          p.y = clamp(snap(p.y + dy, state.grid), 0, state.ch - rs.h);
        });
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
          showManualDims: true  
        };
      }

      state.layouts = [ makeLayout('Layout 1') ];
      const cur = () => {
        const L = state.layouts[state.active];
        if (!L) return null;
        if (!Array.isArray(L.dims)) L.dims = [];
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

      const togLabels   = document.getElementById('lc-toggle-labels');
      const togDims     = document.getElementById('lc-toggle-dims');
      const togManualDims  = document.getElementById('lc-toggle-manual-dims'); 
      const togGrid     = document.getElementById('lc-toggle-grid');
      const btnDimTool = document.getElementById('lc-dim-tool');

      // Dim snap marker
      function initDimSnapMarker(){
        if (!svg || dimSnapMarker) return;
        const svgNS = 'http://www.w3.org/2000/svg';
        const c = document.createElementNS(svgNS, 'circle');
        c.setAttribute('r', 4);
        c.setAttribute('fill', '#111'); // dark dot
        c.setAttribute('stroke', '#fff');
        c.setAttribute('stroke-width', 1.2);
        c.setAttribute('vector-effect', 'non-scaling-stroke');
        c.setAttribute('opacity', '0.9');
        c.style.pointerEvents = 'none';
        c.style.display = 'none';
        c.classList.add('dim-snap-marker');
        dimSnapMarker = c;
        svg.appendChild(c);
      }


      // Accordion toggle for Slab Overlay
      const accBtn  = document.getElementById('ov-acc-toggle');
      const accBody = document.getElementById('ov-acc-body');

      function setOverlayAccordion(open){
        if (!accBtn || !accBody) return;
        accBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        accBtn.classList.toggle('open', !!open);
        accBody.hidden = !open;       // starts closed
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
      const btnClip   = document.getElementById('ov-clip-toggle');

      function syncOverlayAddButton(){
        const L = ensureOverlaysOnLayout(activeLayout());
        const atLimit = (L?.overlays?.length || 0) >= 2;
        if (btnOvAdd) btnOvAdd.disabled = atLimit;
        const hint = document.getElementById('ov-add-hint');
        if (hint) hint.textContent = atLimit ? 'Limit 2 overlays per layout reached.' : '';
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

        // Clip toggle reflects per-layout flag
        const L = ensureOverlaysOnLayout(activeLayout());
        const on = !!(L && L.overlayClip);
        if (btnClip){
          btnClip.textContent = on ? 'Clip to Pieces: On' : 'Clip to Pieces: Off';
          btnClip.classList.toggle('alt', on);
          btnClip.classList.toggle('ghost', !on);
        }

        syncOverlayAddButton();
      }

      // Add Overlay (single entry point)
      btnOvAdd && (btnOvAdd.onclick = ()=> inOvAdd?.click());
      inOvAdd && (inOvAdd.onchange = e => {
        const f = e.target.files?.[0];
        const L = ensureOverlaysOnLayout(activeLayout());
        if (!L) return;
        if ((L.overlays?.length || 0) >= 2){ e.target.value=''; return; }
        if (f) loadOverlayFromFileToLayout(f);
        e.target.value='';
      });

      // Numeric fields
      inOVW && (inOVW.onchange = e => { const o=currentOverlay(); if(!o) return; o.slabW=Math.max(1,+e.target.value||0); draw(); scheduleSave(); pushHistory(); });
      inOVH && (inOVH.onchange = e => { const o=currentOverlay(); if(!o) return; o.slabH=Math.max(1,+e.target.value||0); draw(); scheduleSave(); pushHistory(); });
      inOVX && (inOVX.onchange = e => { const o=currentOverlay(); if(!o) return; o.x=+e.target.value||0; draw(); scheduleSave(); pushHistory(); });
      inOVY && (inOVY.onchange = e => { const o=currentOverlay(); if(!o) return; o.y=+e.target.value||0; draw(); scheduleSave(); pushHistory(); });

      // Opacity slider: live + commit
      inOVOP && (inOVOP.oninput  = e => { const o=currentOverlay(); if(!o) return; o.opacity=Math.max(.1,+e.target.value||.75); draw(); });
      inOVOP && (inOVOP.onchange = ()=> { scheduleSave(); pushHistory(); });

      // Clip to pieces (per layout)
      btnClip && (btnClip.onclick = ()=>{
        const L = ensureOverlaysOnLayout(activeLayout()); if(!L) return;
        L.overlayClip = !L.overlayClip;
        draw(); scheduleSave(); pushHistory();
        syncOverlayUI();
      });



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

        function snapshotState(){
          try{
            return JSON.stringify({
              active: state.active,
              cw: state.cw, ch: state.ch, scale: state.scale, grid: state.grid,
              showGrid: !!state.showGrid, showDims: !!state.showDims, showManualDims: !!state.showManualDims, showEdgeProfiles: !!state.showEdgeProfiles, showLabels: !!state.showLabels,
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
        }

        function applySnapshot(snap){
          if (!snap) return;
          const data = JSON.parse(snap);
          history.quiet = true;
          try{
            if (Array.isArray(data.layouts)) {
              state.layouts = data.layouts;
              state.active  = Number.isInteger(data.active) ? data.active : 0;
              // derive top-level canvas from active layout if that’s your model,
              // otherwise keep these explicit fields:
              state.cw = data.cw; state.ch = data.ch; state.scale = data.scale; state.grid = data.grid;
              state.pieces = (data.pieces||[]).map(p=>({...p}));
            } else {
              // fallback for older payloads
              state.cw = data.cw; state.ch = data.ch; state.scale = data.scale; state.grid = data.grid;
              state.pieces = (data.pieces||[]).map(p=>({...p}));
            }
            state.showGrid   = 'showGrid'   in data ? !!data.showGrid   : state.showGrid;
            state.showDims   = 'showDims'   in data ? !!data.showDims   : state.showDims;
            state.showManualDims = 'showManualDims' in data ? !!data.showManualDims : state.showManualDims;
            state.showEdgeProfiles = 'showEdgeProfiles' in data ? !!data.showEdgeProfiles : state.showEdgeProfiles;
            state.showLabels = 'showLabels' in data ? !!data.showLabels : state.showLabels;
            state.overlay    = data.overlay ? { ...data.overlay } : state.overlay;
            state.selectedId = data.selectedId ?? null;
            if ('project'  in data) state.project  = data.project;
            if ('settings' in data) state.settings = data.settings;
          } finally { history.quiet = false; }

          renderList();
          renderDimList();  
          updateInspector(); sinksUI?.refresh?.(); draw();
          renderLayouts?.();
          syncToolbarFromLayout?.();
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

      // ===== Canvas Toggle Buttons =====
      function setToggle(btn, on, label){
        if (!btn) return;
        btn.classList.toggle('alt',   on);    // ON = filled (selected)
        btn.classList.toggle('ghost', !on);   // OFF = outline
        btn.textContent = (on ? `Hide ${label}` : `Show ${label}`);
      }

      function syncTopBar(){
        if (btnUndoTop) btnUndoTop.disabled = !canUndo();
        if (btnRedoTop) btnRedoTop.disabled = !canRedo();
        setToggle(togGrid,       !!state.showGrid,       'Grid');
        setToggle(togDims,       !!state.showDims,       'Piece Dims');
        setToggle(togManualDims, !!state.showManualDims, 'Manual Dims');
        setToggle(togLabels,     !!state.showLabels,     'Labels');
        setToggle(togEdges,     !!state.showEdgeProfiles, 'Edge Profiles');
        if (lblScale) lblScale.textContent = String(state.scale);
      }


      // Canvas Toolbar Clip toggle
      const btnClipTop = document.getElementById('btn-clip-top');

      function syncClipTop(){
        const L = ensureOverlaysOnLayout(activeLayout());
        const on = !!(L && L.overlayClip);
        if (!btnClipTop) return;
        btnClipTop.textContent = on ? 'Clip to Pieces: On' : 'Clip to Pieces: Off';
        btnClipTop.classList.toggle('alt', on);
        btnClipTop.classList.toggle('ghost', !on);
      }

      btnClipTop && (btnClipTop.onclick = ()=>{
        const L = ensureOverlaysOnLayout(activeLayout()); if (!L) return;
        L.overlayClip = !L.overlayClip;
        draw(); scheduleSave(); pushHistory();
        syncClipTop();
        syncOverlayUI?.();   // keeps the accordion UI in sync if it’s open
      });


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


      // ===== Sinks: config =====
      const SINK_STANDARD_SETBACK = 3.125; // inches
      const MAX_SINKS_PER_PIECE = 4;
      const HOLE_DIAMETER = 1.5;                 // inches
      const HOLE_RADIUS = HOLE_DIAMETER / 2;
      const HOLE_BACKSET_FROM_SINK_EDGE = 2.5;   // center of hole from sink edge (in)
      const HOLE_SPACING = 2;                    // center-to-center (in)

      // Example presets (adjust to your catalog)
      const SINK_MODELS = [
        { id:'k3218-single', label:'Kitchen SS 3218', shape:'rect', w:31, h:17, cornerR:4 },
        { id:'oval-1714',    label:'Oval 1714 Vanity',         shape:'oval', w:17, h:14, cornerR:0 },
        { id:'rect-1813',    label:'Rectangle 1813 Vanity',    shape:'rect', w:18, h:13, cornerR:0.25 },
      ];
      
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

      function endPointerDrag(){
        let changed = false;

        // Piece dragging
        if (state.drag) {
          state.drag.group.forEach(gp => {
            const piece = state.pieces.find(x => x.id === gp.id);
            if (!piece) return;
            piece.x = snap(piece.x, state.grid);
            piece.y = snap(piece.y, state.grid);
          });
          state.drag = null;
          changed = true;
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


      const STARTER_LAYOUT = {
        "project": {
    "name": "World Stone",
    "date": "0001-01-01",
    "notes": ""
  },
  "layoutName": "Layout 1",
  "canvas": {
    "w": 180,
    "h": 120
  },
  "grid": 1,
  "scale": 6,
  "showGrid": true,
  "pieces": [
    { "id": "xnradsk", "name": "Kitchen Island", "w": 96, "h": 42, "x": 9, "y": 62, "rotation": 0, "color": "#e0aeae", "layer": 0, "rTL": true, "rTR": true, "rBL": true, "rBR": true, "sinks": [
        { "id": "sink_aen7dew", "type": "model", "modelId": "k3218-single", "shape": "rect", "w": 31, "h": 17, "cornerR": 4, "side": "front", "centerline": 20, "setback": 3.125, "faucets": [ 4 ], "rotation": 180 }
      ]
    },
    { "id": "9qkwkcx", "name": "Range Right", "w": 36, "h": 25.5, "x": 72, "y": 9, "rotation": 0, "color": "#e0aeae", "layer": 1, "rTL": false, "rTR": false, "rBL": false, "rBR": true, "sinks": [] },
    { "id": "57i56pm", "name": "Range Left", "w": 36, "h": 25.5, "x": 6, "y": 9, "rotation": 0, "color": "#e0aeae", "layer": 2, "rTL": false, "rTR": false, "rBL": true, "rBR": false, "sinks": [] },
    { "id": "o21iodt", "name": "Backsplash", "w": 36, "h": 4, "x": 6, "y": 4, "rotation": 0, "color": "#efd8d8", "layer": 3, "rTL": false, "rTR": false, "rBL": false, "rBR": false, "sinks": [] },
    { "id": "da40080", "name": "Backsplash", "w": 36, "h": 4, "x": 72, "y": 4, "rotation": 0, "color": "#efd8d8", "layer": 4, "rTL": false, "rTR": false, "rBL": false, "rBR": false },
    { "id": "fez0c6s", "name": "RANGE", "w": 30, "h": 25.5, "x": 42, "y": 9, "rotation": 0, "color": "#ffffff", "layer": 5, "rTL": false, "rTR": false, "rBL": false, "rBR": false, "sinks": [
        { "id": "sink_8smx1py", "type": "custom", "modelId": "oval-1714", "shape": "oval", "w": 8, "h": 8, "cornerR": 0, "side": "back", "centerline": 22, "setback": 3.125, "faucets": [], "rotation": 0 },
        { "id": "sink_8smx1py", "type": "custom", "modelId": "oval-1714", "shape": "oval", "w": 8, "h": 8, "cornerR": 0, "side": "front", "centerline": 22, "setback": 3.125, "faucets": [], "rotation": 0 },
        { "id": "sink_towtzn4", "type": "custom", "modelId": "oval-1714", "shape": "oval", "w": 8, "h": 8, "cornerR": 0, "side": "front", "centerline": 8, "setback": 3.125, "faucets": [], "rotation": 0 },
        { "id": "sink_towtzn4", "type": "custom", "modelId": "oval-1714", "shape": "oval", "w": 8, "h": 8, "cornerR": 0, "side": "back", "centerline": 8, "setback": 3.125, "faucets": [], "rotation": 0 }
      ]
    },
    { "id": "bazjesv", "name": "Vanity", "w": 31, "h": 22.5, "x": 127, "y": 10, "rotation": 0, "color": "#d5f0f0", "layer": 6, "rTL": false, "rTR": false, "rBL": true, "rBR": false, "sinks": [
        { "id": "sink_e2sdnn9", "type": "model", "modelId": "oval-1714", "shape": "oval", "w": 17, "h": 14, "cornerR": 0, "side": "back", "centerline": 15, "setback": 3.125, "faucets": [ 4 ], "rotation": 0 }
      ]
    },
    { "id": "dx3dpcm", "name": "Backsplash", "w": 31, "h": 4, "x": 127, "y": 5, "rotation": 0, "color": "#d5f0f0", "layer": 7, "rTL": false, "rTR": false, "rBL": false, "rBR": false, "sinks": [] },
    { "id": "ycid73l", "name": "Backsplash", "w": 4, "h": 22.5, "x": 159, "y": 10, "rotation": 0, "color": "#d5f0f0", "layer": 8, "rTL": false, "rTR": false, "rBL": false, "rBR": false, "sinks": [] }
  ]
      };

      const list = document.getElementById('lc-list');
      const dimList   = document.getElementById('lc-dim-list');
      const inspector = document.getElementById('lc-inspector');
      const btnAdd = document.getElementById('lc-add');

      const btnExportPDFAll = document.getElementById('btn-export-pdf-all');
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

      function initSinksCard({ uiMountEl, getSelectedPiece, onStateChange }) {
        const root = document.createElement('div');
        uiMountEl.innerHTML = '';
        const openIndex = new Map();
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
            type: 'model',
            modelId: m.id, shape: m.shape, w: m.w, h: m.h, cornerR: m.cornerR,
            side: 'back',
            centerline: 20,                   
            setback: SINK_STANDARD_SETBACK,
            faucets: [4],
            rotation: 0
          };
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
            const add = el('button','lc-btn alt','+ Add sink');
            add.onclick = () => { piece.sinks.push(createDefaultSink()); onStateChange?.(); };
            header.appendChild(add);
          }


          if(!piece.sinks.length){
            const row = el('div','lc-row');
            const btn = el('button','lc-btn','Add sink');
            btn.onclick = ()=>{ piece.sinks.push(createDefaultSink()); onStateChange?.(); };
            row.appendChild(btn);
            root.appendChild(row);
            return;
          }

          // --- list (like Pieces) ---
          const list = el('div','lc-list lc-nav');
          const open = openIndex.has(piece.id) ? openIndex.get(piece.id) : 0;

          piece.sinks.forEach((sink, idx)=>{
            const row = el('div','lc-item nav' + (open===idx?' selected':''));
            const line = el('span','lc-line');
            const model = sink.type==='model'
              ? (SINK_MODELS.find(m=>m.id===sink.modelId)?.label || 'Model')
              : 'Custom';
            line.innerHTML = `<strong>Sink #${idx+1}</strong> · ${model} · CL ${fmt3(sink.centerline||0)}"`;
            row.appendChild(line);

            const actions = el('div', null);
            actions.style.display='flex'; actions.style.gap='6px';

            const btnDup = el('button','lc-btn ghost lc-iconbtn');
            btnDup.title='Duplicate';
            btnDup.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24"><path d="M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M5 9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            btnDup.onclick = (e)=>{ e.stopPropagation(); if(piece.sinks.length<MAX_SINKS_PER_PIECE){ piece.sinks.splice(idx+1,0, JSON.parse(JSON.stringify(sink)) ); onStateChange?.(); }};

            const btnDel = el('button','lc-btn red lc-iconbtn');
            btnDel.title='Delete';
            btnDel.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            btnDel.onclick = (e)=>{ e.stopPropagation(); piece.sinks.splice(idx,1); openIndex.set(piece.id, Math.max(0, Math.min(open, piece.sinks.length-1))); onStateChange?.(); };

            actions.append(btnDup, btnDel);
            row.appendChild(actions);

            row.addEventListener('click', (e)=>{ if(e.target.closest('button')) return; openIndex.set(piece.id, idx); render(); });
            list.appendChild(row);

            // accordion: render editor right under the selected row
            if(open===idx){
              list.appendChild(buildSinkEditor(sink, idx, piece));
            }
          });

          root.appendChild(list);
        }

        function buildSinkEditor(sink, idx, piece){
          const card = el('div','sink-editor');

          // Row 1: type/model/side
          const row1 = el('div','row');

          const typeSel = select(
            [{v:'model',t:'Model'},{v:'custom',t:'Custom'}],
            sink.type || 'model'
          );
          typeSel.onchange = ()=>{
            sink.type = typeSel.value;
            if (sink.type === 'model') {
              const m = SINK_MODELS.find(m=>m.id=== (sink.modelId || SINK_MODELS[0].id)) || SINK_MODELS[0];
              applyModelToSink(sink, m);
            }
            onStateChange?.(); // rebuild once
          };

          const modelSel = select(
            SINK_MODELS.map(m=>({v:m.id,t:m.label})),
            sink.modelId || SINK_MODELS[0].id
          );
          modelSel.onchange = ()=>{
            sink.modelId = modelSel.value;
            const m = SINK_MODELS.find(m=>m.id===sink.modelId);
            applyModelToSink(sink, m);
            onStateChange?.();
          };

          // --- Row: Custom dimensions (only visible when sink.type === 'custom') ---
          const rowCustom = el('div','row'); // same layout class as your other rows
          // Length
          const len = numInput(sink.w ?? 32, 0.125, 0);
          len.oninput = ()=>{
            sink.w = clamp(round3(len.value), 0, 999);
            draw();        // live update, no UI rebuild
            scheduleSave?.();
          };
          // Width
          const wid = numInput(sink.h ?? 18, 0.125, 0);
          wid.oninput = ()=>{
            sink.h = clamp(round3(wid.value), 0, 999);
            draw();
            scheduleSave?.();
          };

          rowCustom.append(
            labelWrap('Length (in)', len),
            labelWrap('Width (in)',  wid)
          );

          // Show only for custom sinks
          rowCustom.style.display = (sink.type === 'custom') ? '' : 'none';

          card.appendChild(rowCustom);


          // NEW: Reference Side selector
          const sideSel = select(
            [
              { v:'front', t:'Front' },
              { v:'back',  t:'Back'  },
              { v:'left',  t:'Left'  },
              { v:'right', t:'Right' }
            ],
            sink.side || 'front'
          );
          sideSel.onchange = ()=>{
            sink.side = sideSel.value;
            // clamp centerline against the axis length for the chosen side
            const axisMax = (sink.side === 'left' || sink.side === 'right') ? (piece.h || 0) : (piece.w || 0);
            sink.centerline = clamp(round3(sink.centerline ?? 0), 0, axisMax);
            draw();                       // live update
            scheduleSave?.();
            onStateChange?.();            // refresh labels once
          };

          row1.append(
            labelWrap('Type',  typeSel),
            labelWrap('Model', modelSel),
            labelWrap('Reference side', sideSel)
          );
          card.appendChild(row1);

          

          // Row 2: 2×2 grid → Centerline, Setback, Rotation (0–360), Corner Radius
          const row2 = el('div','row'); // this grid is 2 cols; 4 fields flow 2×2
          const cl = numInput(sink.centerline ?? 20, 0.125, 0);
          cl.oninput = ()=>{ sink.centerline = round3(cl.value); draw(); scheduleSave?.(); };

          const setback = numInput(sink.setback ?? SINK_STANDARD_SETBACK, 0.125, 0);
          setback.oninput = ()=>{ sink.setback = clamp(round3(setback.value),0,999); draw(); scheduleSave?.(); };

          const rot = numInput(sink.rotation||0, 1, 0, 360);
          rot.oninput = ()=>{ sink.rotation = clamp(Math.round(rot.value||0),0,360); draw(); scheduleSave?.(); };

          const rad = numInput(sink.cornerR ?? 0, 0.125, 0, 4);
          rad.oninput = ()=>{ sink.cornerR = clamp(round3(rad.value),0,4); draw(); scheduleSave?.(); };

          row2.append(
            labelWrap('Centerline (in)', cl),
            labelWrap('Setback (in)', setback),
            labelWrap('Rotation (°)', rot),
            labelWrap('Corner R (0–4″)', rad)
          );
          card.appendChild(row2);

          // Row 3: faucet holes — single tight row
          const row3 = el('div','row');
          const rack = el('div', 'holes-row');
          for(let i=0;i<9;i++){
            const cb=document.createElement('input'); cb.type='checkbox'; cb.style.margin='0';
            cb.checked = !!(sink.faucets||[]).includes(i);
            cb.onchange = ()=>{ const s=new Set(sink.faucets||[]); cb.checked ? s.add(i) : s.delete(i); sink.faucets = Array.from(s).sort((a,b)=>a-b); onStateChange?.(); };
            rack.appendChild(cb);
          }
          row3.appendChild(labelWrap('Faucet holes', rack));
          card.appendChild(row3);

          // when user finishes typing, rebuild once (to refresh labels)
          [cl,setback,rot,rad].forEach(inp=> inp.onchange = ()=> onStateChange?.());

          return card;
        }

      render();
      return { refresh: render };
    
    }


    // Ensure sinks array exists on any existing pieces
    state.pieces.forEach(migratePieceForSinks);

    // Build Sinks UI
    sinksUI = initSinksCard({
      uiMountEl: document.getElementById('lc-sinks-card'),
      getSelectedPiece: () => state.pieces.find(p => p.id === state.selectedId) || null,
      onStateChange: () => { draw(); scheduleSave?.(); sinksUI.refresh(); }
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




      // --- Fill helpers ---
      function getFillOpacity(p){
        // default to 1 if not set; clamp to [0,1]
        const v = typeof p.fillOpacity === 'number' ? p.fillOpacity : 1;
        return Math.max(0, Math.min(1, v));
      }

      function applyPieceFill(el, p){
        const noFill = !!p.noFill;
        const color  = p.color || '#999';

        el.setAttribute('fill', noFill ? 'none' : color);
        if (noFill){
          el.removeAttribute('fill-opacity');
        } else {
          el.setAttribute('fill-opacity', String(getFillOpacity(p)));
        }
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
          project: { name: state.projectName.trim(), date: state.projectDate || todayISO(), notes: state.notes || '' },
          layoutName: cur().name,
          canvas: { w: state.cw, h: state.ch },
          grid: state.grid, scale: state.scale, showGrid: state.showGrid,
          pieces: state.pieces,
          dims: cur().dims || []  
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
        renderList(); updateInspector(); sinksUI?.refresh?.(); draw();
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
        return {
          project: {
            name: state.projectName || '',
            date: state.projectDate || todayISO(),
            notes: state.notes || ''
          },
          layouts: state.layouts,  // includes per-layout overlays[]
          ui: {
            showGrid:   !!state.showGrid,
            showDims:   !!state.showDims,
            showManualDims: !!state.showManualDims,
            showEdgeProfiles: !!state.showEdgeProfiles,
            showLabels: !!state.showLabels
          },
          active: state.active ?? 0
        };
      }



      let saveTimer = null;

function scheduleSave(){
  detachShareIdFromUrl();    // Detach on any save
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
        if ('showManualDims' in data.ui) state.showManualDims = !!data.ui.showManualDims;
        if ('showEdgeProfiles' in data.ui) state.showEdgeProfiles = !!data.ui.showEdgeProfiles;
        if ('showLabels' in data.ui) state.showLabels = !!data.ui.showLabels;
      }

      // per-layout overlays are already inside layouts; nothing to migrate here

      syncToolbarFromLayout();
      renderLayouts();
      renderList();
      updateInspector();
      sinksUI?.refresh?.();
      draw();
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


      function clampToCanvas(p){ const rs=realSize(p); p.x=clamp(p.x,0,state.cw-rs.w); p.y=clamp(p.y,0,state.ch-rs.h); }

      function roundedRectPathCorners(x, y, w, h, r){
        const rtl=r.tl||0, rtr=r.tr||0, rbr=r.br||0, rbl=r.bl||0;
        return `M${x+rtl},${y} H${x+w-rtr} Q${x+w},${y} ${x+w},${y+rtr} V${y+h-rbr} Q${x+w},${y+h} ${x+w-rbr},${y+h} H${x+rbl} Q${x},${y+h} ${x},${y+h-rbl} V${y+rtl} Q${x},${y} ${x+rtl},${y} Z`;
      }

      // Ensure any piece has a sinks array
      function migratePieceForSinks(piece){
        if (!piece.sinks) piece.sinks = [];
        return piece;
      }

      function applyModelToSink(sink, model){
        if (!model) return;
        sink.modelId = model.id;
        sink.shape   = model.shape;
        sink.w       = model.w;
        sink.h       = model.h;
        sink.cornerR = clamp(model.cornerR ?? 0, 0, 4);
      }

      // Compute the sink center & angle in piece space
      function sinkPoseOnPiece(piece, sink){
        const side    = sink.side || 'front';
        const setback = (sink.setback ?? SINK_STANDARD_SETBACK);
        let cx, cy, angle = (piece.rotation||0) + (sink.rotation||0);

        if (side === 'front'){ cx = sink.centerline;                        cy = setback + sink.h/2; }
        else if (side === 'back'){ cx = sink.centerline;                    cy = piece.h - (setback + sink.h/2); }
        else if (side === 'left'){ cx = setback + sink.h/2;                 cy = sink.centerline; angle += 90; }
        else /* right */        { cx = piece.w - (setback + sink.h/2);      cy = sink.centerline; angle += 90; }
      
        const sinkRect = { x: cx - sink.w/2, y: cy - sink.h/2, w: sink.w, h: sink.h };
        return { cx, cy, angle, sinkRect };
      }

      function holeOffsetFromSinkEdge(_sink){ return HOLE_BACKSET_FROM_SINK_EDGE; }

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
          const rIn = i2p(1);
          const r   = { tl: p.rTL? rIn:0, tr: p.rTR? rIn:0, br: p.rBR? rIn:0, bl: p.rBL? rIn:0 };

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

              const localAngle = (sink.side === 'left' || sink.side === 'right')
                ? (sink.rotation || 0) + 90
                : (sink.rotation || 0);

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
                const startIndex = -4;
                sink.faucets.forEach(idx => {
                  const x = (startIndex + idx) * i2p(HOLE_SPACING);
                  const y = - (i2p(sink.h/2) + i2p(holeOffsetIn));
                  const c = document.createElementNS(svgNS,'circle');
                  c.setAttribute('cx', String(x));
                  c.setAttribute('cy', String(y));
                  c.setAttribute('r',  String(i2p(HOLE_RADIUS)));
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
          const rIn = i2p(1);
          const r = { tl: p.rTL? rIn:0, tr: p.rTR? rIn:0, br: p.rBR? rIn:0, bl: p.rBL? rIn:0 };
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
        if (!arr.length) {
          g.removeAttribute('mask');
          g.removeAttribute('clip-path');
          return;
        }

        // Clip to pieces minus cutouts (when enabled)
        if (L.overlayClip){
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

        // overlays above background, below grid/pieces
        drawOverlays();

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
          const rs = realSize(p);
          const x = i2p(p.x), y=i2p(p.y), W=i2p(rs.w), H=i2p(rs.h);
          const fg = pickTextColor(p.color || '#ffffff');

          const rIn = i2p(1);
          const corners = { tl: p.rTL? rIn:0, tr: p.rTR? rIn:0, br: p.rBR? rIn:0, bl: p.rBL? rIn:0 };

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

            p.sinks.forEach((sink) => {
              const { cx: sxIn, cy: syIn } = sinkPoseOnPiece(p, sink);
              const sx = leftPx + i2p(sxIn);
              const sy = topPx  + i2p(syIn);
              const localAngle = (sink.side === 'left' || sink.side === 'right')
                ? (sink.rotation || 0) + 90
                : (sink.rotation || 0);

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
                const startIndex = -4;
                sink.faucets.forEach(idx => {
                  const x = (startIndex + idx) * i2p(HOLE_SPACING);
                  const y = - (i2p(sink.h/2) + i2p(holeOffsetIn));
                  gSink.appendChild(svgEl('circle', {
                    cx: x, cy: y, r: i2p(HOLE_RADIUS),
                    fill: 'none', stroke: '#333', 'stroke-width': 1
                  }));
                });
              }

              if (state.showDims){
                const dimStroke = '#000';
                const tick = 6, off = 12;

                const xL = leftPx, xR = leftPx + W0;
                const yT = topPx,  yB = topPx + H0;

                if (sink.side === 'front' || sink.side === 'back') {
                  const yTop2 = yT - off - 12;
                  const xCL   = xL + i2p(sxIn);

                  const line = svgEl('line', { x1:xL, y1:yTop2, x2:xCL, y2:yTop2, stroke:dimStroke, 'vector-effect':'non-scaling-stroke' });
                  const t1   = svgEl('line', { x1:xL, y1:yTop2 - tick, x2:xL,  y2:yTop2 + tick, stroke:dimStroke, 'vector-effect':'non-scaling-stroke' });
                  const t2   = svgEl('line', { x1:xCL, y1:yTop2 - tick, x2:xCL, y2:yTop2 + tick, stroke:dimStroke, 'vector-effect':'non-scaling-stroke' });

                  const clLabel = svgEl('text', {
                    x: (xL + xCL) / 2,
                    y: yTop2 - 4,
                    'text-anchor': 'middle',
                    'font-size': '12',
                    fill: '#111'
                  });
                  clLabel.textContent = `${fmt3(sxIn)}" CL`;

                  gg.append(line, t1, t2, clLabel);
                } else {
                  const xLeft2 = xL - off - 12;
                  const yCL    = yT + i2p(syIn);

                  const line = svgEl('line', { x1:xLeft2, y1:yT, x2:xLeft2, y2:yCL, stroke:dimStroke, 'vector-effect':'non-scaling-stroke' });
                  const t1   = svgEl('line', { x1:xLeft2 - tick, y1:yT,  x2:xLeft2 + tick, y2:yT,  stroke:dimStroke, 'vector-effect':'non-scaling-stroke' });
                  const t2   = svgEl('line', { x1:xLeft2 - tick, y1:yCL, x2:xLeft2 + tick, y2:yCL, stroke:dimStroke, 'vector-effect':'non-scaling-stroke' });

                  const clLabel = svgEl('text', {
                    x: xLeft2 - 4,
                    y: (yT + yCL) / 2,
                    'text-anchor': 'end',
                    'dominant-baseline': 'middle',
                    'font-size': '12',
                    fill: '#111'
                  });
                  clLabel.textContent = `${fmt3(syIn)}" CL`;

                  gg.append(line, t1, t2, clLabel);
                }
              }

              sinksG.appendChild(gSink);
            });

            gg.appendChild(sinksG);
          }

         // append rotated geometry group to a piece container g (for pointerdown)
          const gPiece = document.createElementNS('http://www.w3.org/2000/svg','g');
          gPiece.setAttribute('data-id', p.id);
          gPiece.style.cursor='move';
          gPiece.appendChild(gg);

          // labels
          if (state.showLabels) {
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', x + W/2);
            text.setAttribute('y', y + H/2 - 6);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '12');
            text.setAttribute('fill', fg);

            const t1 = document.createElementNS(svgNS, 'tspan');
            t1.setAttribute('x', x + W/2);
            t1.setAttribute('dy', 0);
            t1.textContent = p.name || 'Piece';

            const t2 = document.createElementNS(svgNS, 'tspan');
            t2.setAttribute('x', x + W/2);
            t2.setAttribute('dy', 14);
            t2.textContent = `${p.w}" × ${p.h}"${(p.rotation ? ` · ${p.rotation}°` : ``)}`;

            text.append(t1, t2);
            gPiece.appendChild(text);
          }

          if (state.showDims) {
            const dimStroke = '#000';
            const off = 12;
            const tick = 6;

            const dims = document.createElementNS('http://www.w3.org/2000/svg','g');
            dims.setAttribute('class','dims');

            // WIDTH (top of unrotated rect)
            const yTop = (cy - H0/2) - off;
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
            wT.textContent = (typeof fmt3 === 'function' ? `${fmt3(p.w)}` : `${p.w}`) + '"';

            // HEIGHT (left of unrotated rect)
            const xLeft = (cx - W0/2) - off;
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
            hT.textContent = (typeof fmt3 === 'function' ? `${fmt3(p.h)}` : `${p.h}`) + '"';

            // append to rotated group so ticks/labels rotate with the piece
            dims.append(wLine, wt1, wt2, wT, hLine, ht1, ht2, hT);
            gg.appendChild(dims);
          }

          // --- Edge profile labels on each side ---
          if (state.showEdgeProfiles && p.edgeProfiles) {
            const edges = p.edgeProfiles;

            const labelsG = document.createElementNS(svgNS, 'g');
            labelsG.setAttribute('class', 'edge-profiles');
            labelsG.setAttribute('pointer-events', 'none');

            function addEdgeLabel(text, x, y, anchor, baseline) {
              if (!text || text === 'flat') return;
              const t = document.createElementNS(svgNS, 'text');
              t.setAttribute('x', x);
              t.setAttribute('y', y);
              t.setAttribute('text-anchor', anchor || 'middle');
              if (baseline) t.setAttribute('dominant-baseline', baseline);
              t.setAttribute('font-size', '11');
              t.setAttribute('fill', '#111');
              t.textContent = text;
              labelsG.appendChild(t);
            }

            const MARGIN = 16; // px away from piece edge

            // Top edge label
            addEdgeLabel(
              edges.top,
              cx,
              (cy - H0/2) - MARGIN,
              'middle',
              'baseline'
            );

            // Bottom edge label
            addEdgeLabel(
              edges.bottom,
              cx,
              (cy + H0/2) + MARGIN,
              'middle',
              'hanging'
            );

            // Left edge label
            addEdgeLabel(
              edges.left,
              (cx - W0/2) - MARGIN,
              cy,
              'end',
              'middle'
            );

            // Right edge label
            addEdgeLabel(
              edges.right,
              (cx + W0/2) + MARGIN,
              cy,
              'start',
              'middle'
            );

            gg.appendChild(labelsG);
          }


          // selection / drag
          gPiece.addEventListener('pointerdown', (e)=>{
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
              const label = distIn.toFixed(2) + '"';

              const g = document.createElementNS(svgNS, 'g');
              g.setAttribute('class', 'dim-line');
              g.setAttribute('data-dimid', d.id);
              if (state.selectedDimId === d.id) g.classList.add('selected');

              // --- selection + drag to move offset ---
              g.addEventListener('pointerdown', (ev) => {
                ev.stopPropagation();
                state.selectedDimId = d.id;
                state.selectedId = null;     // ✅ clear piece selection
                renderDimList();
                updateInspector();           // ✅ update inspector
                draw(); // to update selected styling

                // Start drag for this dimension
                const pt = svgPoint(ev);
                const vx = pt.x - x1px;
                const vy = pt.y - y1px;
                // Signed distance from base line along the normal
                const signedOff = vx * nx + vy * ny;

                dimDrag = {
                  dimId: d.id,
                  x1px,
                  y1px,
                  nx,
                  ny,
                  pointerId: ev.pointerId
                };

                if (svg.setPointerCapture) {
                  svg.setPointerCapture(ev.pointerId);
                }
              });

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
              const LABEL_MULT = 1.8; // how far off the dim line to place the text
              const lx = midx + ox * LABEL_MULT;
              const ly = midy + oy * LABEL_MULT;

              const t = document.createElementNS(svgNS, 'text');
              t.setAttribute('x', lx);
              t.setAttribute('y', ly);
              t.setAttribute('dominant-baseline', 'middle');
              t.setAttribute('text-anchor', 'middle');
              t.setAttribute('font-size', '14');
              t.setAttribute('pointer-events', 'none'); // clicks go to the line
              t.textContent = label;

              // angle in inches space (for upright text)
              let angleDeg = Math.atan2(d.y2 - d.y1, d.x2 - d.x1) * 180 / Math.PI;
              if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;
              t.setAttribute('transform', `rotate(${angleDeg}, ${lx}, ${ly})`);

              g.append(ext1, ext2, dl, t);
              gAll.appendChild(g);
            });


          svg.appendChild(gAll);
        }


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
        renderList(); updateInspector(); sinksUI?.refresh(); draw();
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
          renderList(); 
          updateInspector(); 
          sinksUI?.refresh(); 
          draw(); 
          scheduleSave(); 
          pushHistory();
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
            sinksUI?.refresh();
            draw(); 
            scheduleSave();
            pushHistory();
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
let listReorderWired = false;

function installPieceReorder(){
  if(!list || listReorderWired) return;
  listReorderWired = true;
  
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

    renderList(); updateInspector(); sinksUI?.refresh(); draw(); scheduleSave(); pushHistory();
  });

  list.addEventListener('pointercancel', ()=>{
    if(!listDrag) return;
    if(listDrag.marker) listDrag.marker.remove();
    list.classList.remove('reordering');
    listDrag = null;
  });
}


function renderDimList(){
  if (!dimList) return;
  const L = cur();
  dimList.innerHTML = '';
  if (!L || !Array.isArray(L.dims) || !L.dims.length) return;

  L.dims.forEach((d, idx) => {
    const row = document.createElement('div');
    row.className = 'lc-item nav' + (state.selectedDimId === d.id ? ' selected' : '');

    // Main line: label text
    const line = document.createElement('span');
    line.className = 'lc-line';

    const dx = d.x2 - d.x1;
    const dy = d.y2 - d.y1;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const angDeg = (Math.atan2(d.y2 - d.y1, d.x2 - d.x1) * 180 / Math.PI + 360) % 180;
    const orientation = (angDeg < 45 || angDeg > 135) ? 'Horiz' : 'Vert';

    line.innerHTML = `<strong>Dim ${idx+1}</strong> · ${dist.toFixed(2)}" (${orientation})`;
    row.appendChild(line);

    // Actions: tiny trash icon like Pieces
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '6px';

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'lc-btn red lc-iconbtn';
    btnDel.title = 'Delete';
    btnDel.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    btnDel.addEventListener('click', (e) => {
      e.stopPropagation(); // don’t also select the row

      const Lcur = cur();
      if (!Lcur || !Array.isArray(Lcur.dims)) return;

      const i = Lcur.dims.findIndex(dd => dd.id === d.id);
      if (i === -1) return;

      Lcur.dims.splice(i, 1);
      if (state.selectedDimId === d.id) {
        state.selectedDimId = null;
      }

      renderDimList();
      draw();
      scheduleSave();
      pushHistory();
    });

    actions.appendChild(btnDel);
    row.appendChild(actions);

    // Clicking the row (not the button) selects the dim
    row.addEventListener('click', () => {
      state.selectedDimId = d.id;
      state.selectedId = null;
      renderDimList();
      updateInspector();
      draw();
    });

    dimList.appendChild(row);
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
      syncToolbarFromLayout(); renderList(); updateInspector(); sinksUI?.refresh(); draw();
      renderOverlayList?.();   
      syncOverlayUI?.();       
      renderLayouts(); scheduleSave();
      renderDimList();
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
      pushHistory();
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
      renderLayouts(); renderList(); updateInspector(); sinksUI?.refresh(); draw(); scheduleSave();
      renderOverlayList?.();   // <-- add
      syncOverlayUI?.();       // <-- add
      pushHistory();
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
    renderLayouts(); renderList(); updateInspector(); sinksUI?.refresh(); draw(); syncToolbarFromLayout(); scheduleSave();
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

      function updateInspector(){
        const p = state.pieces.find(x=>x.id===state.selectedId);
        if(!p){ inspector.className='lc-small'; inspector.textContent='Select a piece from the canvas or list.'; return; }
        inspector.className=''; inspector.innerHTML='';
        const wrap = document.createElement('div'); wrap.className='lc-item selected';

        const row1 = document.createElement('div'); row1.className='lc-row';
        const nameL = document.createElement('label'); nameL.className='lc-label'; nameL.textContent='Name';
        const nameI = document.createElement('input'); nameI.className='lc-input'; nameI.value=p.name||'';
        nameI.oninput = ()=>{ p.name=nameI.value; renderList(); draw(); };
        nameI.onblur  = ()=>{ scheduleSave(); pushHistory(); }; // record on commit
        nameL.appendChild(nameI);

        // ==== Fill controls: No Fill + Opacity ====
        const rowFill = document.createElement('div');
        rowFill.className = 'lc-row';
        rowFill.style.marginTop = '8px';

        // Left: Fill Opacity slider with % label
        const fillL = document.createElement('label');
        fillL.className = 'lc-label';
        fillL.innerHTML = `
          Fill opacity
          <input id="insp-fill" type="range" min="0" max="100" step="5"
                class="lc-input" value="${Math.round((p.fillOpacity ?? 1) * 100)}">
          <span id="insp-fill-pct" class="lc-small">${Math.round((p.fillOpacity ?? 1) * 100)}%</span>
        `;

        // Right: No Fill toggle button
        const noFillWrap = document.createElement('div');
        const btnNoFill = document.createElement('button');
        btnNoFill.type = 'button';
        btnNoFill.className = 'lc-btn ghost sm';
        btnNoFill.textContent = (p.noFill ? 'No Fill: On' : 'No Fill: Off');
        if (p.noFill){ btnNoFill.classList.remove('ghost'); btnNoFill.classList.add('alt'); }
        noFillWrap.appendChild(btnNoFill);

        rowFill.appendChild(fillL);
        rowFill.appendChild(noFillWrap);
        wrap.appendChild(rowFill);

        // Wire up slider + button
        const inFill = fillL.querySelector('#insp-fill');
        const lblPct = fillL.querySelector('#insp-fill-pct');

        function syncFillControls(){
          const pct = Math.round(getFillOpacity(p) * 100);
          inFill.value = String(pct);
          lblPct.textContent = pct + '%';
          // disable slider if No Fill
          inFill.disabled = !!p.noFill;
          btnNoFill.textContent = (p.noFill ? 'No Fill: On' : 'No Fill: Off');
          btnNoFill.classList.toggle('alt', !!p.noFill);
          btnNoFill.classList.toggle('ghost', !p.noFill);
        }

        inFill.oninput = (e)=>{
          p.fillOpacity = Math.max(0, Math.min(1, (Number(e.target.value)||0) / 100));
          lblPct.textContent = Math.round(p.fillOpacity*100) + '%';
          draw(); // live preview
        };
        inFill.onchange = ()=>{
          scheduleSave(); pushHistory();
        };

        btnNoFill.onclick = ()=>{
          p.noFill = !p.noFill;
          syncFillControls();
          draw(); scheduleSave(); pushHistory();
        };

        syncFillControls();


        const colorL = document.createElement('label'); colorL.className='lc-label'; colorL.textContent='Color';
        const cs = colorStack(p.color, (val)=>{
          p.color=val; renderList(); draw(); scheduleSave(); pushHistory();
        });
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
          sendBackward(p);
          renderList(); updateInspector(); sinksUI?.refresh(); draw(); scheduleSave(); pushHistory();
        });
        const bFwd  = mkBtn('Forward','ghost sm', ()=> {
          bringForward(p);
          renderList(); updateInspector(); sinksUI?.refresh(); draw(); scheduleSave(); pushHistory();
        });

        row3.append(bBack, bFwd);
        wrap.appendChild(row3);

        // ==== Rotation + Corner Radius row (2-up) ====
        const row4 = document.createElement('div');
        row4.className = 'lc-row2';
        row4.style.marginTop = '8px';

        // Left column: Rotation number input (0–360)
        const rotCol = document.createElement('label');
        rotCol.className = 'lc-label';
        rotCol.innerHTML = `
          Rotation (°)
          <input id="insp-rot" type="number" min="0" max="360" step="1" class="lc-input" value="${p.rotation||0}">
        `;
        row4.appendChild(rotCol);

        // Right column: Corner radius buttons
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
          return ()=>{ p[key]=!p[key]; btn.classList.toggle('active', p[key]); draw(); scheduleSave(); pushHistory(); };
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

        // --- Edge Profiles (4 sides) ---
        if (!p.edgeProfiles) {
          p.edgeProfiles = { top: 'flat', right: 'flat', bottom: 'flat', left: 'flat' };
        }

        const edgeRow = document.createElement('div');
        edgeRow.className = 'lc-row';
        edgeRow.style.marginTop = '8px';

        const edgesLabel = document.createElement('div');
        edgesLabel.className = 'lc-label';
        edgesLabel.textContent = 'Edge profiles';

        const edgeOptions = [
          { v: '',      t: 'None' },
          { v: 'seam',      t: 'Seam' },
          { v: 'flat',      t: 'Flat' },
          { v: 'quarter',   t: 'Quarter' },
          { v: 'bevel',     t: 'Bevel' },
          { v: 'HB',        t: 'Half Bull' },
          { v: 'FB',        t: 'Full Bull' },
          { v: 'OG',        t: 'Ogee' },
          { v: 'miter',     t: 'Miter' }
        ];

        function makeEdgeSelect(sideKey, labelText) {
          const wrap = document.createElement('label');
          wrap.className = 'lc-label lc-edge-field';

          const cap = document.createElement('div');
          cap.className = 'lc-small';
          cap.textContent = labelText;
          wrap.appendChild(cap);

          const sel = document.createElement('select');
          sel.className = 'lc-input';
          edgeOptions.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.v;
            o.textContent = opt.t;
            sel.appendChild(o);
          });
          sel.value = p.edgeProfiles[sideKey] || 'flat';

          sel.addEventListener('change', () => {
            p.edgeProfiles[sideKey] = sel.value;
            draw();
            scheduleSave();
            pushHistory();
          });

          wrap.appendChild(sel);
          return wrap;
        }

        const edgesGrid = document.createElement('div');
        edgesGrid.style.display = 'grid';
        edgesGrid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        edgesGrid.style.gap = '6px';

        edgesGrid.appendChild(makeEdgeSelect('top', 'Top'));
        edgesGrid.appendChild(makeEdgeSelect('bottom', 'Bottom'));
        edgesGrid.appendChild(makeEdgeSelect('left', 'Left'));
        edgesGrid.appendChild(makeEdgeSelect('right', 'Right'));

        edgeRow.appendChild(edgesLabel);
        edgeRow.appendChild(edgesGrid);
        wrap.appendChild(edgeRow);

        // Bind rotation input
        const rotInput = wrap.querySelector('#insp-rot');
        rotInput.oninput = (e)=>{
          p.rotation = clamp(Math.round(Number(e.target.value)||0), 0, 360);
          clampToCanvas(p);
          draw();
        };
        rotInput.onchange = ()=>{ scheduleSave(); pushHistory(); };

        const inW = wrap.querySelector('#insp-w');
        const inH = wrap.querySelector('#insp-h');
        inW.onchange = e => { p.w = Math.max(0.25, Number(e.target.value||0)); clampToCanvas(p); renderList(); draw(); scheduleSave(); pushHistory(); };
        inH.onchange = e => { p.h = Math.max(0.25, Number(e.target.value||0)); clampToCanvas(p); renderList(); draw(); scheduleSave(); pushHistory(); };

        // ===== Actions row (icon buttons): Undo, Redo, Layer badge, Duplicate, Delete =====
        const actions = document.createElement('div');
        actions.style.display='flex';
        actions.style.gap='6px';
        actions.style.alignItems='center';

        // Undo
        const btnUndoI = document.createElement('button');
        btnUndoI.className = 'lc-btn ghost lc-iconbtn';
        btnUndoI.title = 'Undo (Ctrl+Z)';
        btnUndoI.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24"><path d="M9 14H6a4 4 0 1 1 0-8h11a4 4 0 1 1 0 8h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 14l-3-3l3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btnUndoI.disabled = !canUndo();
        btnUndoI.onclick = (e)=>{ e.preventDefault(); undo(); };

        // Redo
        const btnRedoI = document.createElement('button');
        btnRedoI.className = 'lc-btn ghost lc-iconbtn';
        btnRedoI.title = 'Redo (Ctrl+Y or Ctrl+Shift+Z)';
        btnRedoI.innerHTML = '<svg class="lc-icon" viewBox="0 0 24 24"><path d="M15 14h3a4 4 0 1 0 0-8H7a4 4 0 1 0 0 8h1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 14l3-3l-3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btnRedoI.disabled = !canRedo();
        btnRedoI.onclick = (e)=>{ e.preventDefault(); redo(); };

        // Layer badge (tiny circle)
        const layerBadge = document.createElement('button');
        layerBadge.type = 'button';
        layerBadge.title = `Layer ${p.layer ?? 0} (0 = back)`;
        layerBadge.textContent = (p.layer ?? 0);
        layerBadge.disabled = true;
        Object.assign(layerBadge.style, {
          width: '28px', height: '28px', borderRadius: '9999px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: '600', lineHeight: '1',
          border: '1px solid var(--border, #ddd)',
          background: 'var(--muted, #f3f4f6)', color: 'var(--text, #111)',
          userSelect: 'none', pointerEvents: 'none',
        });

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
          renderList(); updateInspector(); sinksUI?.refresh(); draw(); scheduleSave(); pushHistory();
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
            renderList(); updateInspector(); sinksUI?.refresh(); draw(); scheduleSave(); pushHistory();
          }
        };

        // Order: [Undo] [Redo] [Layer badge] [Duplicate] [Delete]
        actions.append(btnUndoI, btnRedoI, layerBadge, btnDupI, btnDelI);
        wrap.appendChild(actions);

        inspector.appendChild(wrap);

        // lock the inspector height based on the populated content (only when there is a selection)
        requestAnimationFrame(()=>{ lockInspectorHeight(inspector.scrollHeight); });
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

    svg.addEventListener('pointermove', (e) => {
      // If Dim Tool is off, or we’re dragging a dim line, hide the marker
      if (!state.dimTool || dimDrag) {
        if (dimSnapMarker) dimSnapMarker.style.display = 'none';
        return;
      }
      if (!dimSnapMarker) return;

      const pt = svgPoint(e);
      if (!pt) return;

      // Convert to inches
      const raw = { x: p2i(pt.x), y: p2i(pt.y) };
      const snap = snapDimPoint(raw) || raw; // grid/corner snap or raw point

      // Back to px
      const cx = i2p(snap.x);
      const cy = i2p(snap.y);

      dimSnapMarker.setAttribute('cx', cx);
      dimSnapMarker.setAttribute('cy', cy);
      dimSnapMarker.style.display = 'block';
    });
    
    svg.addEventListener('pointerleave', () => {
      if (dimSnapMarker) dimSnapMarker.style.display = 'none';
    });



      // --- Deselect all when clicking blank canvas (no drag) ---
      // Place this AFTER the pointermove handler and AFTER your endDrag wiring.
      let blankDown = null;
      const CLICK_THRESH = 4; // px of wiggle allowed and still treat as a click

      // ---- Dim Tool button (toggle + styling) ----
      function syncDimToolUI(){
        if (!btnDimTool) return;
        const on = !!state.dimTool;

        btnDimTool.textContent = on ? 'Dim Tool: On' : 'Dim Tool: Off';
        btnDimTool.classList.toggle('alt',   on);
        btnDimTool.classList.toggle('ghost', !on);

        if (svg) {
          svg.style.cursor = on ? 'crosshair' : '';
        }
        if (dimSnapMarker) {
          dimSnapMarker.style.display = on ? dimSnapMarker.style.display : 'none';
        }
      }

      // Initialize once on load
      syncDimToolUI();

      btnDimTool && (btnDimTool.onclick = () => {
        state.dimTool = !state.dimTool;

        // If we’re turning the tool OFF, cancel a half-finished dim
        if (!state.dimTool) {
          dimTempStart = null;
        }

        syncDimToolUI();
      });

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


      // --- Manual dimensions tool ---
      let dimTempStart = null;  // { x, y } in inches for first click
      let dimSnapMarker = null; // floating snap indicator circle


      svg.addEventListener('click', (e) => {
        // Only when Dim Tool is active
        if (!state.dimTool) return;

        const L = cur();
        if (!L) return;
        if (!Array.isArray(L.dims)) L.dims = [];

        // If click landed on an existing dimension, don't create a new one;
        // that click will be used to select the dim instead.
        if (e.target.closest && e.target.closest('g[data-dimid]')) return;

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
          const d = {
            id: uid(),
            x1: dimTempStart.x,
            y1: dimTempStart.y,
            x2: snapped.x,
            y2: snapped.y
          };
          L.dims.push(d);
          state.selectedDimId = d.id;
          dimTempStart = null;

          draw();
          renderDimList();
          scheduleSave();
          pushHistory();
        }

        e.stopPropagation();
      });





      svg.addEventListener('pointerdown', (e)=>{
      // When Dim Tool is active, we don't track blank clicks – they’re for dimension points
      if (state.dimTool) { blankDown = null; return; }

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
        renderList(); updateInspector(); sinksUI?.refresh(); draw();
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

      inCW.onchange = e => { state.cw = Math.max(12, Number(e.target.value||0)); state.pieces.forEach(clampToCanvas); draw(); scheduleSave(); pushHistory(); };
      inCH.onchange = e => { state.ch = Math.max(12, Number(e.target.value||0)); state.pieces.forEach(clampToCanvas); draw(); scheduleSave(); pushHistory(); };
      inGrid.onchange = e => { state.grid = Math.max(0.25, Number(e.target.value||0)); draw(); scheduleSave(); pushHistory(); };
      btnSnapAll.onclick = () => {
        state.pieces = state.pieces.map(p=>{
          const rs = realSize(p);
          return { ...p,
            x: clamp(snap(p.x,state.grid),0,state.cw-rs.w),
            y: clamp(snap(p.y,state.grid),0,state.ch-rs.h)
          };
        });
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      };

      btnClearSel && (btnClearSel.onclick = ()=>{
        clearSelection();
        renderList(); updateInspector(); sinksUI?.refresh(); draw();
      });

      // Undo / Redo
      btnUndoTop && (btnUndoTop.onclick = (e)=>{ e.preventDefault(); undo();  syncTopBar(); });
      btnRedoTop && (btnRedoTop.onclick = (e)=>{ e.preventDefault(); redo();  syncTopBar(); });

      // Show/Hide toggles
      togGrid && (togGrid.onclick = ()=>{
        state.showGrid = !state.showGrid;
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });
      togDims && (togDims.onclick = ()=>{
        // per-piece dims
        state.showDims = !state.showDims;
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });

      togManualDims && (togManualDims.onclick = ()=> {
        state.showManualDims = !state.showManualDims;
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });

      togLabels && (togLabels.onclick = ()=>{
        state.showLabels = !state.showLabels;
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });

      togEdges && (togEdges.onclick = () => {
        state.showEdgeProfiles = !state.showEdgeProfiles;
        syncTopBar();
        draw();
        scheduleSave();
        pushHistory();
      });

      if (btnDimTool) {
        const updateDimToolLabel = () => {
          btnDimTool.textContent = state.dimTool ? 'Dim Tool: ON' : 'Dim Tool: Off';
          svg.style.cursor = state.dimTool ? 'crosshair' : 'default';
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
        const idx = state.pieces.length; const top = Math.max(0,...state.pieces.map(x=>x.layer||0))+1;
        const p = { 
          id: uid(), 
          name: `Piece ${idx+1}`, 
          w:24, 
          h:12, 
          x:0, 
          y:0, 
          rotation:0, 
          color:'#ffffff', 
          layer: top, 
          rTL:false, 
          rTR:false, 
          rBL:false, 
          rBR:false, 
          edgeProfiles: {
            top: 'flat',
            right: 'flat',
            bottom: 'flat',
            left: 'flat',
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
        const d={...p, id: uid(), name: p.name+' Copy', x:clamp(p.x+state.grid,0,state.cw-rs.w), y:clamp(p.y+state.grid,0,state.ch-rs.h), layer:top};
        state.pieces.push(d); 
        state.selectedId=d.id; 
        renderList(); updateInspector(); sinksUI?.refresh(); draw();
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
        if (Array.isArray(parsed.pieces)) {
          state.pieces = parsed.pieces.map(q => {
            const p = {
              id: uid(),
              name: q.name || 'Piece',
              w: Number(q.w) || 1, h: Number(q.h) || 1,
              x: Number(q.x) || 0, y: Number(q.y) || 0,
              rotation: (q.rotation === 90 ? 90 : Number(q.rotation) || 0),
              color: q.color || '#ffffff',
              layer: Number(q.layer) || 0,
              rTL: !!q.rTL, rTR: !!q.rTR, rBL: !!q.rBL, rBR: !!q.rBR,
              // NEW: bring sinks back in
              sinks: Array.isArray(q.sinks) ? q.sinks.map(s => ({
                id: s.id || ('sink_' + Math.random().toString(36).slice(2,9)),
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
                faucets: Array.isArray(s.faucets) ? s.faucets.filter(n => Number.isFinite(n)).slice(0, 9) : []
              })) : []
            };

            // Optional: if it’s a model sink, re-apply model dims to be safe
            (p.sinks || []).forEach(sink => {
              if (sink.type === 'model' && sink.modelId) {
                const model = SINK_MODELS.find(m => m.id === sink.modelId);
                if (model) applyModelToSink(sink, model);
              }
            });

            return p;
          });
        }

        state.selectedId = null;
        renderList(); updateInspector(); sinksUI?.refresh(); draw(); syncTopBar();
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
              state.active  = Number.isInteger(parsed.active) ? parsed.active : 0;
              state.projectName = parsed.project?.name  || '';
              state.projectDate = parsed.project?.date  || todayISO();
              state.notes       = parsed.project?.notes || '';

              if (inProject) inProject.value = state.projectName;
              if (inDate)    inDate.value    = state.projectDate;
              if (inNotes)   inNotes.value   = state.notes;

              syncToolbarFromLayout();
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
