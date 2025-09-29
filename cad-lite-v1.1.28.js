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
        showDims: false,
        showLabels: true,
      };

      // ---- Slab Overlay (photo underlay scaled to real inches) ----
      state.overlay = state.overlay || {
        visible: false,
        name: '',
        dataURL: '',          // the image to draw
        natW: 0, natH: 0,     // natural pixel size (from Image)
        slabW: 126,           // inches; user-entered slab width
        slabH: 63,            // inches; user-entered slab height
        x: 0, y: 0,           // top-left, inches (position on canvas)
        opacity: 0.75
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
      const togGrid     = document.getElementById('lc-toggle-grid');

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


      // --- Overlay controls ---
      const inOVW   = document.getElementById('ovw');
      const inOVH   = document.getElementById('ovh');
      const inOVX   = document.getElementById('ovx');
      const inOVY   = document.getElementById('ovy');
      const inOVF   = document.getElementById('ovfile');
      const inOVOP  = document.getElementById('ovop');
      const btnOvT  = document.getElementById('ov-toggle');
      const btnOvClr= document.getElementById('ov-clear');
      const btnOvW  = document.getElementById('ov-white');
      const btnOvG  = document.getElementById('ov-gray');
      const btnOvB  = document.getElementById('ov-black');

      function syncOverlayUI(){
        const o = state.overlay;
        if (inOVW) inOVW.value = o.slabW ?? 126;
        if (inOVH) inOVH.value = o.slabH ?? 63;
        if (inOVX) inOVX.value = o.x ?? 0;
        if (inOVY) inOVY.value = o.y ?? 0;
        if (inOVOP) inOVOP.value = o.opacity ?? 0.75;
        if (btnOvT){
          const on = !!o.visible;
          btnOvT.textContent = on ? 'Hide Overlay' : 'Show Overlay';
          btnOvT.classList.toggle('alt', on);
          btnOvT.classList.toggle('ghost', !on);
        }
      }

      inOVW && (inOVW.onchange = e => { state.overlay.slabW = Math.max(1, Number(e.target.value||0)); draw(); scheduleSave(); pushHistory(); });
      inOVH && (inOVH.onchange = e => { state.overlay.slabH = Math.max(1, Number(e.target.value||0)); draw(); scheduleSave(); pushHistory(); });
      inOVX && (inOVX.onchange = e => { state.overlay.x     = Number(e.target.value||0); draw(); scheduleSave(); pushHistory(); });
      inOVY && (inOVY.onchange = e => { state.overlay.y     = Number(e.target.value||0); draw(); scheduleSave(); pushHistory(); });
      inOVF && (inOVF.onchange = e => { const f = e.target.files?.[0]; if(f) loadOverlayFromFile(f); e.target.value=''; });

      inOVOP && (inOVOP.oninput = e => { state.overlay.opacity = Math.max(0.1, Number(e.target.value||0.75)); draw(); });
      inOVOP && (inOVOP.onchange = ()=>{ scheduleSave(); pushHistory(); });

      btnOvT && (btnOvT.onclick = ()=>{ state.overlay.visible = !state.overlay.visible; draw(); scheduleSave(); pushHistory(); syncOverlayUI(); });
      btnOvClr && (btnOvClr.onclick = ()=>{
        state.overlay = { visible:false, name:'', dataURL:'', natW:0, natH:0, slabW:126, slabH:63, x:0, y:0, opacity:0.75 };
        draw(); scheduleSave(); pushHistory(); syncOverlayUI();
      });
      btnOvW && (btnOvW.onclick = ()=> overlayPreset('white'));
      btnOvG && (btnOvG.onclick = ()=> overlayPreset('gray'));
      btnOvB && (btnOvB.onclick = ()=> overlayPreset('black'));

        // ---- Undo/Redo History ----
        const HISTORY_MAX = 50;
        const history = { stack: [], index: -1, quiet: false };

        function snapshotState(){
          try{
            return JSON.stringify({
              active: state.active,
              cw: state.cw, ch: state.ch, scale: state.scale, grid: state.grid,
              showGrid: !!state.showGrid, showDims: !!state.showDims, showLabels: !!state.showLabels,
              overlay: state.overlay ? { ...state.overlay } : null,
              selectedId: state.selectedId ?? null,
              pieces: state.pieces.map(p=>({...p})),
              project: state.project ?? null,
              settings: state.settings ?? null,
              layouts: state.layouts ?? null
            });
          }catch(e){ console.warn('history snapshot failed:', e); return null; }
        }

        function pushHistory(){
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
            state.showLabels = 'showLabels' in data ? !!data.showLabels : state.showLabels;
            state.overlay    = data.overlay ? { ...data.overlay } : state.overlay;
            state.selectedId = data.selectedId ?? null;
            if ('project'  in data) state.project  = data.project;
            if ('settings' in data) state.settings = data.settings;
          } finally { history.quiet = false; }

          renderList(); updateInspector(); sinksUI?.refresh?.(); draw();
          renderLayouts?.();
          syncToolbarFromLayout?.();
          syncTopBar?.();
          syncOverlayUI?.();
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
        setToggle(togGrid,   !!state.showGrid,   'Grid');
        setToggle(togDims,   !!state.showDims,   'Dimensions');
        setToggle(togLabels, !!state.showLabels, 'Labels');
        if (lblScale) lblScale.textContent = String(state.scale);
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
        draw(); scheduleSave(); pushHistory(); 
      }
      svg.addEventListener('pointerup', endDrag);
      svg.addEventListener('pointerleave', endDrag);


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

          

          // Row 2: 2×2 grid → Centerline, Setback, Rotation (0–180), Corner Radius
          const row2 = el('div','row'); // this grid is 2 cols; 4 fields flow 2×2
          const cl = numInput(sink.centerline ?? 20, 0.125, 0);
          cl.oninput = ()=>{ sink.centerline = round3(cl.value); draw(); scheduleSave?.(); };

          const setback = numInput(sink.setback ?? SINK_STANDARD_SETBACK, 0.125, 0);
          setback.oninput = ()=>{ sink.setback = clamp(round3(setback.value),0,999); draw(); scheduleSave?.(); };

          const rot = numInput(sink.rotation||0, 1, 0, 180);
          rot.oninput = ()=>{ sink.rotation = clamp(Math.round(rot.value||0),0,180); draw(); scheduleSave?.(); };

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

      function ensureOverlayGroup(){
        let g = svg.querySelector('#lc-overlay');
        if (!g){
          g = document.createElementNS('http://www.w3.org/2000/svg','g');
          g.id = 'lc-overlay';
          g.setAttribute('pointer-events','none'); // always behind & non-interactive
          svg.appendChild(g);                   // sits above the white rect
        }
        return g;
      }

      function drawOverlay(){
        const o = state.overlay;
        const g = ensureOverlayGroup();
        g.innerHTML = ''; // reset

        if (!o.visible || !o.dataURL) return;

        // compute pixel size from inches using current px/in scale
        const pxPerIn = state.scale;
        let dispWpx = Math.max(1, Math.round((o.slabW || 1) * pxPerIn));
        let dispHpx = Math.max(1, Math.round((o.slabH || (o.slabW && o.natW ? (o.slabW * (o.natH/o.natW)) : 1)) * pxPerIn));

        // position in px
        const xpx = Math.round((o.x||0) * pxPerIn);
        const ypx = Math.round((o.y||0) * pxPerIn);

        // rect backdrop (optional, subtle)
        const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
        r.setAttribute('x', xpx); r.setAttribute('y', ypx);
        r.setAttribute('width', dispWpx); r.setAttribute('height', dispHpx);
        r.setAttribute('fill', '#000'); r.setAttribute('opacity', 0.04);
        g.appendChild(r);

        // image
        const im = document.createElementNS('http://www.w3.org/2000/svg','image');
        im.setAttributeNS('http://www.w3.org/1999/xlink','href', o.dataURL);
        im.setAttribute('x', xpx); im.setAttribute('y', ypx);
        im.setAttribute('width', dispWpx); im.setAttribute('height', dispHpx);
        im.setAttribute('preserveAspectRatio','none'); // honor slabW/H exactly
        im.setAttribute('opacity', o.opacity == null ? 0.75 : o.opacity);
        g.appendChild(im);
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
          pieces: state.pieces
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

      // copy/share
      function copyShareLink(){
        const payload = makeSharePayloadAll();             // FULL app (all layouts)
        const hash = 'v2=' + LZString.compressToEncodedURIComponent(payload);
        const url = location.origin + location.pathname + '#' + hash;
        try { navigator.clipboard?.writeText(url); } catch(_){}
        window.history.replaceState(null, '', '#'+hash);
        alert('Share link saved to URL and copied to clipboard.');
      }

      // load from URL
      function tryLoadFromHash(){
        if (!location.hash) return false;
        const h = location.hash.slice(1);
      // v2: full snapshot (all layouts)
        let m = h.match(/^v2=(.+)$/);
        if (m){
          const json = LZString.decompressFromEncodedURIComponent(m[1]);
          if (json){ applySnapshot(json); return true; }
        }
      // v1: legacy single-layout
        m = h.match(/^v1=(.+)$/);
        if (m){
          const json = LZString.decompressFromEncodedURIComponent(m[1]);
          if (json){ applySharePayload(json); return true; }
        }
        return false;
      }
      window.addEventListener('hashchange', ()=>{ tryLoadFromHash(); });


      const SAVE_KEY = 'litecad:v2';
      function exportApp(){
        return {
          project: { name: state.projectName || '', date: state.projectDate || todayISO(), notes: state.notes || '' },
          layouts: state.layouts,
          overlay: state.overlay || null,
          ui: {
            showGrid: !!state.showGrid,
            showDims: !!state.showDims,
            showLabels: !!state.showLabels
          }        
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
    if (!raw) return false;
    const data = JSON.parse(raw);

    if (data.layouts && Array.isArray(data.layouts)){
      // layouts
      state.layouts = data.layouts.map(L => ({ ...L, id: L.id || uid() }));
      state.active = 0; // keep first layout active for autosave payloads

      // project meta (don’t overwrite if already set elsewhere during init)
      state.projectName = (data.project?.name ?? state.projectName ?? '');
      state.projectDate = (data.project?.date ?? state.projectDate ?? todayISO());
      state.notes       = (data.project?.notes ?? state.notes ?? '');

      if (inProject) inProject.value = state.projectName;
      if (inDate)    inDate.value    = state.projectDate;
      if (inNotes)   inNotes.value   = state.notes;

      // UI toggles (persisted in autosave)
      if (data.ui){
        if ('showGrid'   in data.ui) state.showGrid   = !!data.ui.showGrid;
        if ('showDims'   in data.ui) state.showDims   = !!data.ui.showDims;
        if ('showLabels' in data.ui) state.showLabels = !!data.ui.showLabels;
      }

      // Overlay (persisted in autosave)
      if (data.overlay){
        state.overlay = { ...(state.overlay || {}), ...data.overlay };
      }

      // refresh UI
      syncToolbarFromLayout();
      renderLayouts();
      renderList();
      updateInspector();
      sinksUI?.refresh?.();
      draw();
      syncTopBar?.();
      syncOverlayUI?.();

      return true;
    } else {
      // fallback: legacy single-layout payloads
      loadLayout(data);
      renderLayouts();
      renderList();
      updateInspector();
      sinksUI?.refresh?.();
      draw();
      syncTopBar?.();
      syncOverlayUI?.();
      return true;
    }
  } catch (_){
    return false;
  }
}

      syncTopBar();


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

        drawOverlay();

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
          // --- rotation-aware drawing (safe order) ---
          const W0 = i2p(p.w), H0 = i2p(p.h);     // unrotated piece size in px
          const BW = W, BH = H;                   // rotated bbox size in px (from realSize)
          const cx = x + BW/2, cy = y + BH/2;     // center of the rotated bbox

          const gg = document.createElementNS(svgNS, 'g');
          let rotRaw = Number(p.rotation||0);
          if (!Number.isFinite(rotRaw)) rotRaw = 0;
          let rot = ((rotRaw % 360) + 360) % 360; // 0..359
          rot = rot % 180;                         // 0..179 shown
          if (rot) gg.setAttribute('transform', `rotate(${rot}, ${cx}, ${cy})`);


          // draw the rectangle unrotated, centered at (cx,cy), then rotate gg
          const path = document.createElementNS('http://www.w3.org/2000/svg','path');
          path.setAttribute('d', roundedRectPathCorners(cx - W0/2, cy - H0/2, W0, H0, r));
          path.setAttribute('fill', p.color || '#ffffff');
          path.setAttribute('stroke', '#94a3b8');
          path.setAttribute('stroke-width', '1');
          gg.appendChild(path);

          // selected outline (keep corners, do not scale stroke)
          if (isSelected(p.id)) {
            const outline = document.createElementNS(svgNS, 'path');
            outline.setAttribute('d', roundedRectPathCorners(cx - W0/2, cy - H0/2, W0, H0, r));
            outline.setAttribute('fill', 'none');
            outline.setAttribute('stroke', '#0ea5e9');
            outline.setAttribute('stroke-width', '2');
            outline.setAttribute('vector-effect', 'non-scaling-stroke');
            outline.setAttribute('pointer-events', 'none');
            gg.appendChild(outline);
          }

        // --- Sinks (draw inside the rotated group so they follow the piece rotation) ---
        if (Array.isArray(p.sinks) && p.sinks.length){
          // left/top of the unrotated rect in pixels
          const leftPx = cx - W0/2;
          const topPx  = cy - H0/2;

          const sinksG = document.createElementNS('http://www.w3.org/2000/svg','g');
          sinksG.setAttribute('id', `sinks-for-${p.id}`);

          p.sinks.forEach((sink) => {
            // center in piece-local inches (no rotation here)
            const { cx: sxIn, cy: syIn } = sinkPoseOnPiece(p, sink);

            // convert to px within the same coordinate space as `gg`
            const sx = leftPx + i2p(sxIn);
            const sy = topPx  + i2p(syIn);

            // additional local rotation for left/right sides
            const localAngle = (sink.side === 'left' || sink.side === 'right')
              ? (sink.rotation || 0) + 90
              : (sink.rotation || 0);

            const gSink = document.createElementNS('http://www.w3.org/2000/svg','g');
            gSink.setAttribute('transform', `translate(${sx}, ${sy}) rotate(${localAngle})`);

            // sink shape
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

            // faucet holes: 9 slots, 2" spacing, 2.5" back from sink edge (centerline)
            if (Array.isArray(sink.faucets) && sink.faucets.length){
              const holeOffsetIn = holeOffsetFromSinkEdge(sink); // inches
              const startIndex = -4;
              sink.faucets.forEach(idx => {
                const x = (startIndex + idx) * i2p(HOLE_SPACING);
                const y = - (i2p(sink.h/2) + i2p(holeOffsetIn)); // behind the sink (negative y)
                gSink.appendChild(svgEl('circle', {
                  cx: x, cy: y, r: i2p(HOLE_RADIUS),
                  fill: 'none', stroke: '#333', 'stroke-width': 1
                }));
              });
            }

            // Centerline dimension when global dimensions are on
            if (state.showDims){
              const dimStroke = '#94a3b8';
              const tick = 6, off = 12;

              // unrotated rect edges in px (we're inside gg, already rotated as a group)
              const xL = leftPx, xR = leftPx + W0;
              const yT = topPx,  yB = topPx + H0;

              if (sink.side === 'front' || sink.side === 'back') {
                const yTop2 = yT - off - 12; // place slightly above the piece width dim
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

          // add sinks inside the rotated group
          gg.appendChild(sinksG);
        }

          // (keep this line after the sinks block)
          g.appendChild(gg); // append rotated geometry to the piece group



          // piece label (only when Show labels is ON)
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

            text.appendChild(t1);
            text.appendChild(t2);
            g.appendChild(text);
          }

          if (state.showDims) {
            const dimStroke = '#94a3b8';
            const off = 12;  // px away from the edge
            const tick = 6;  // px tick half-length

            const dims = document.createElementNS('http://www.w3.org/2000/svg','g');
            dims.setAttribute('class','dims');

            // WIDTH dimension (across the top of the unrotated rect)
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
            // If you have fmt3(), use it; else fallback to p.w
            wT.textContent = (typeof fmt3 === 'function' ? `${fmt3(p.w)}` : `${p.w}`) + '"';

            // HEIGHT dimension (down the left of the unrotated rect)
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

            dims.append(wLine, wt1, wt2, wT, hLine, ht1, ht2, hT);

            // ⬅️ key change: append to the ROTATED child group
            gg.appendChild(dims);
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
            renderList(); 
            updateInspector();
            sinksUI?.refresh();


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

        // Left column: Rotation number input (0–180)
        const rotCol = document.createElement('label');
        rotCol.className = 'lc-label';
        rotCol.innerHTML = `
          Rotation (°)
          <input id="insp-rot" type="number" min="0" max="180" step="1" class="lc-input" value="${p.rotation||0}">
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

        // Bind rotation input
        const rotInput = wrap.querySelector('#insp-rot');
        rotInput.oninput = (e)=>{
          p.rotation = clamp(Math.round(Number(e.target.value)||0), 0, 180);
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
        state.showDims = !state.showDims;
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });
      togLabels && (togLabels.onclick = ()=>{
        state.showLabels = !state.showLabels;
        draw(); scheduleSave(); pushHistory(); syncTopBar();
      });


      // ------- Project fields -------
      if (!state.projectDate) {
        inDate.value = todayISO();
        state.projectDate = inDate.value;
      } else {
        inDate.value = state.projectDate;
      }
      inProject.oninput = ()=> state.projectName = inProject.value;
      inDate.onchange = ()=> state.projectDate = inDate.value || todayISO();
      inNotes && (inNotes.oninput = ()=> { state.notes = inNotes.value; scheduleSave(); });
      if(inNotes) inNotes.value = state.notes || '';  

      // ------- Pieces -------
      btnAdd.onclick = () => {
        const idx = state.pieces.length; const top = Math.max(0,...state.pieces.map(x=>x.layer||0))+1;
        const p = { id: uid(), name: `Piece ${idx+1}`, w:24, h:12, x:0, y:0, rotation:0, color:'#ffffff', layer: top, rTL:false, rTR:false, rBL:false, rBR:false };
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
                rotation: clamp(Number(s.rotation) || 0, 0, 180),
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

        // show the chosen file name under the buttons
        if (importName) importName.textContent = file.name;

        const reader = new FileReader();
        reader.onload = () => {
          try{
            const parsed = JSON.parse(String(reader.result||''));
            loadLayout(parsed);                // your existing loader
            scheduleSave();                    // keep autosave state fresh
            pushHistory(); 
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
        renderLayouts(); 
        renderList(); 
        updateInspector(); 
        sinksUI?.refresh(); 
        draw(); 

        try{ localStorage.removeItem(SAVE_KEY); }catch(_){}
        scheduleSave();
        pushHistory(); 
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
      inProject.value = state.projectName;
      inDate.value = state.projectDate || todayISO();
      syncToolbarFromLayout();
      renderLayouts();

      // Try URL share first. If none, fall back to restore().
      let loadedFromHash = tryLoadFromHash();
      if (!loadedFromHash && !restore()) {
        // first-time load
        draw();
        renderList();
        updateInspector();
        sinksUI?.refresh();
      }
      pushHistory();
      syncTopBar?.();
      syncOverlayUI?.();

      // Create/attach a Share button next to your export buttons (if not already in HTML)
      if (!document.getElementById('lc-share-link')){
        const btnShare = document.createElement('button');
        btnShare.id='lc-share-link'; btnShare.type='button';
        btnShare.className='lc-btn alt'; btnShare.textContent='Copy Share Link';
        btnShare.onclick = (e)=>{ e.preventDefault(); copyShareLink(); };
        // Try to append beside JSON/SVG/PNG buttons:
        (btnExportJSON?.parentElement || document.querySelector('.lc-toolbar') || document.body).appendChild(btnShare);
      }

      // --- expose a minimal API for external modules (like the Sinks card) ---
      // (Always do this, regardless of restore())
      window.CADLITE = { state, svg, draw, scheduleSave, updateInspector };

      // fire a custom event so modules can safely hook in even if scripts load out of order
      document.dispatchEvent(new CustomEvent('cad:ready', { detail: window.CADLITE }));

    } // <-- end of init()
    document.addEventListener('DOMContentLoaded', init);
    })();
