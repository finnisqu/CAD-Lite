import { describe, expect, it } from 'vitest';
import {
  AppStore, CommandDispatcher, HistoryManager, AutosaveManager,
  applicationStateFromLegacyPayload, cadLiteFileFromApplicationState,
  addPiece, deletePieces, duplicatePieces, renamePiece, updatePieceProperties,
  setActiveLayout, setActiveArea, setSelection, setWorkspace, setProjectMeta,
  assignPiecesToArea, createEmptyLayout, createPiece, pieceGeometry,
  pieceLifecycleFamilyIds, getPieceDeletionPlan, preparePieceDuplication,
  validatePieceRelationships, deserializeCadLiteFile, serializeCadLiteFile,
  normalizeCanvasNotes, normalizeDimensions, normalizeDrawingLines,
} from '../src/main';
import { normalizePieces } from '../src/persistence/pieces';
import { v159ProjectFixture } from './fixtures/v159-project';

function graph() {
  const layout = createEmptyLayout({ id: 'l', firstAreaId: 'a', name: 'Kitchen' });
  layout.areas.push({ id: 'b', name: 'Island' });
  layout.pieces = normalizePieces([
    { id: 'p', name: 'Counter', w: 81.997, h: 25.5, x: 6, y: 6, areaId: 'a',
      pieceGroupId: 'g', pieceGroupName: 'Counter',
      sinks: [{ id: 'sink', fabricationSplitSinkId: 'split-sink', w: 22 }],
      cutouts: [{ id: 'cutout', fabricationSplitCutoutId: 'split-cutout' }],
      pieceSeams: [{ id: 'source-seam', offset: 12.12345 }],
      assemblyLinks: [{ id: 'join', kind: 'seam', matePieceId: 'q', sourceSeamId: 'source-seam', side: 'right' }],
    },
    { id: 'q', name: 'Counter B', w: 30, h: 25.5, areaId: 'a', pieceGroupId: 'g',
      sinks: [{ id: 'sink-b', fabricationSplitSinkId: 'split-sink' }],
      cutouts: [{ id: 'cutout-b', fabricationSplitCutoutId: 'split-cutout' }],
      assemblyLinks: [{ id: 'join', kind: 'seam', matePieceId: 'p', sourceSeamId: 'source-seam', side: 'left' }],
    },
    { id: 's', name: 'Splash', areaId: 'a', pieceType: 'backsplash',
      attachment: { kind: 'backsplash', parentPieceId: 'p', sourceEdge: 'top', snapped: false },
    },
    { id: 'other', name: 'Other', areaId: 'b' },
  ], ['a','b'], 'fixture');
  layout.notes = normalizeCanvasNotes([
    { id: 'radius', annotationType: 'radius', radiusRef: { pieceId: 'p', kind: 'sink', sinkId: 'sink' } },
    { id: 'independent', text: 'Keep' },
  ]);
  layout.lines = normalizeDrawingLines([
    { id: 'leader', attachedNoteId: 'radius' },
    { id: 'line', x1: 0 },
  ]);
  layout.dims = normalizeDimensions([
    { id: 'dim', x1: 0, x2: 81.997 },
  ]);
  return layout;
}
function setup(workspace: 'design' | 'slab' = 'design') {
  const state = applicationStateFromLegacyPayload(v159ProjectFixture);
  state.project.layouts = [graph()];
  state.session.activeLayoutId = 'l';
  state.session.workspace = workspace;
  const store = new AppStore(state);
  return { store, commands: new CommandDispatcher(store) };
}
function ids() {
  let i = 0;
  return (kind: string) => kind + '-new-' + (++i);
}
function current(store: AppStore) {
  const layout = store.getState().project.layouts[0];
  if (!layout) throw new Error('Missing test layout');
  return layout;
}

describe('typed Piece foundation', () => {
  it('creates baseline defaults with splash clearance and fresh owned objects', () => {
    const layout = graph();
    const a = createPiece(layout, 'new'), b = createPiece(layout, 'new-b');
    expect(a).toMatchObject({ w: 40, h: 25.5, x: 6, y: 6, rotation: 0, areaId: 'a', color: '#ffffff' });
    expect(a.overhangs.front).toBe(1.5);
    expect(a.edgeProfiles.top).toBe('none');
    expect(a.sinks).toEqual([]);
    a.cornerRadii.tl = 1;
    expect(b.cornerRadii.tl).toBe(0);
  });
  it('exposes rectangle geometry without rounding precise stored measurements', () => {
    const p = graph().pieces[0];
    if (!p) throw new Error('Missing fixture');
    expect(pieceGeometry(p)).toMatchObject({ kind: 'rectangle', width: 81.997 });
  });
  it('adds through an explicit deterministic command and rejects duplicate IDs', () => {
    const { store, commands } = setup();
    const command = addPiece('l', 'new');
    const before = store.getState();
    expect(command.reduce(before)).toEqual(command.reduce(before));
    expect(before.project.layouts[0]?.pieces).toHaveLength(4);
    expect(commands.execute(command)).toMatchObject({ history: 'record', persistence: 'save' });
    expect(store.getState().session.selection).toEqual({ kind: 'pieces', ids: ['new'] });
    expect(commands.execute(command)).toBeNull();
  });
  it('rejects nonexistent Areas and blank IDs without history effects', () => {
    const { commands } = setup();
    expect(commands.execute(addPiece('l', '', {}))).toBeNull();
    expect(commands.execute(addPiece('l', 'new', { areaId: 'missing' }))).toBeNull();
  });
  it('renames and updates only safe presentation fields', () => {
    const { store, commands } = setup();
    commands.execute(renamePiece('l','p',' New Name '));
    commands.execute(updatePieceProperties('l','p',{ color:'#abcdef', noFill:true, fillOpacity:.37 }));
    expect(current(store).pieces[0]).toMatchObject({ name:'New Name', color:'#abcdef', noFill:true, fillOpacity:.37, w:81.997 });
    expect(commands.execute(renamePiece('l','p',' '))).toBeNull();
  });
  it('uses the existing Area service for group and linked-child assignment', () => {
    const { store, commands } = setup();
    commands.execute(assignPiecesToArea('l',['s'],'b'));
    expect(current(store).pieces.every(piece => piece.areaId === 'b')).toBe(true);
  });
});

describe('explicit Piece deletion', () => {
  it('expands fabrication assemblies in DESIGN including unsnapped splashes', () => {
    expect(pieceLifecycleFamilyIds(graph().pieces,['p'],'design')).toEqual(['p','q','s']);
    expect(getPieceDeletionPlan(graph(),['p'],'design')).toEqual({
      pieceIds:['p','q','s'], noteIds:['radius'], lineIds:['leader'],
    });
  });
  it('deletes owned fabrication data, radius notes and leaders in one change', () => {
    const { store, commands } = setup();
    commands.execute(setSelection({ kind:'pieces',ids:['p','other'] }));
    commands.execute(deletePieces('l',['p']));
    const layout = current(store);
    expect(layout.pieces.map(piece => piece.id)).toEqual(['other']);
    expect(layout.notes.map(note => note.id)).toEqual(['independent']);
    expect(layout.lines.map(line => line.id)).toEqual(['line']);
    expect(layout.dims).toHaveLength(1);
    expect(store.getState().session.selection).toEqual({ kind:'pieces', ids:['other'] });
    expect(layout.activeAreaId).toBe('a');
  });
  it('deleting a splash leaves its parent and fabrication Assembly intact', () => {
    const { store, commands } = setup();
    commands.execute(deletePieces('l',['s']));
    expect(current(store).pieces.map(piece => piece.id)).toEqual(['p','q','other']);
  });
  it('does not expand an ordinary group when deleting one member', () => {
    const { store, commands } = setup();
    current(store).pieces.forEach(piece => { piece.assemblyLinks = []; });
    commands.execute(deletePieces('l',['p']));
    expect(current(store).pieces.map(piece => piece.id)).toEqual(['q','other']);
    expect(current(store).pieces[0]?.pieceGroupId).toBeNull();
  });
  it('SLAB deletion removes only requested Piece families and repairs surviving seam references', () => {
    const { store, commands } = setup('slab');
    commands.execute(deletePieces('l',['p']));
    expect(current(store).pieces.map(piece => piece.id)).toEqual(['q','other']);
    expect(current(store).pieces[0]?.assemblyLinks).toEqual([]);
    expect(current(store).pieces[0]?.pieceGroupId).toBeNull();
  });
  it('cleans selection for removed annotations and groups', () => {
    for (const selection of [{kind:'note',id:'radius'}, {kind:'line',id:'leader'}, {kind:'pieceGroup',id:'g'}] as const) {
      const { store, commands } = setup();
      commands.execute(setSelection(selection));
      commands.execute(deletePieces('l',['p']));
      expect(store.getState().session.selection).toEqual({kind:'none'});
    }
  });
  it('is a no-op for unknown IDs', () => {
    const { commands } = setup();
    expect(commands.execute(deletePieces('l',['missing']))).toBeNull();
  });
});

describe('graph duplication', () => {
  it('remaps Piece, group, seam, sink, cutout and split identities consistently', () => {
    const layout = graph();
    const original = JSON.stringify(layout);
    const plan = preparePieceDuplication(layout,['p'],'design',ids());
    const [p,q,s] = plan.copies;
    expect(p && q && s).toBeTruthy();
    expect(p?.assemblyLinks[0]?.matePieceId).toBe(q?.id);
    expect(q?.assemblyLinks[0]?.matePieceId).toBe(p?.id);
    expect(p?.assemblyLinks[0]?.id).toBe(q?.assemblyLinks[0]?.id);
    expect(p?.assemblyLinks[0]?.sourceSeamId).toBe(p?.pieceSeams[0]?.id);
    expect(s?.attachment?.parentPieceId).toBe(p?.id);
    expect(p?.pieceGroupId).toBe(q?.pieceGroupId);
    expect(p?.pieceGroupId).not.toBe('g');
    expect(p?.sinks[0]?.id).not.toBe('sink');
    expect(p?.sinks[0]?.fabricationSplitSinkId).toBe(q?.sinks[0]?.fabricationSplitSinkId);
    expect(p?.cutouts[0]?.fabricationSplitCutoutId).toBe(q?.cutouts[0]?.fabricationSplitCutoutId);
    expect(p?.pieceSeams[0]?.offset).toBe(12.12345);
    expect(validatePieceRelationships(plan.copies,['a','b'])).toEqual([]);
    expect(JSON.stringify(layout)).toBe(original);
  });
  it('detaches a splash duplicated on its own', () => {
    const plan = preparePieceDuplication(graph(),['s'],'design',ids());
    expect(plan.copies).toHaveLength(1);
    expect(plan.copies[0]?.attachment).toBeNull();
    expect(plan.copies[0]?.pieceType).toBe('backsplash');
  });
  it('strips partial group and outside seam relationships for SLAB duplication', () => {
    const plan = preparePieceDuplication(graph(),['q'],'slab',ids());
    expect(plan.copies).toHaveLength(1);
    expect(plan.copies[0]?.pieceGroupId).toBeNull();
    expect(plan.copies[0]?.assemblyLinks).toEqual([]);
  });
  it('preserves full ordinary groups but detaches partial ordinary groups', () => {
    const layout = graph();
    layout.pieces.forEach(piece => { piece.assemblyLinks = []; });
    expect(preparePieceDuplication(layout,['q'],'design',ids()).copies[0]?.pieceGroupId).toBeNull();
    const copies = preparePieceDuplication(layout,['p','q'],'design',ids()).copies;
    expect(copies[0]?.pieceGroupId).toBe(copies[1]?.pieceGroupId);
    expect(copies[0]?.pieceGroupId).not.toBeNull();
  });
  it('rejects stale plans and generated ID collisions', () => {
    const { store, commands } = setup();
    const plan = preparePieceDuplication(current(store),['p'],'design',ids());
    commands.execute(renamePiece('l','p','Changed'));
    expect(commands.execute(duplicatePieces('l',plan))).toBeNull();
    expect(() => preparePieceDuplication(graph(),['p'],'design',()=>'p')).toThrow();
  });
  it('duplicates deterministically and selects the copied family without changing Area', () => {
    const { store, commands } = setup();
    const plan = preparePieceDuplication(current(store),['p'],'design',ids());
    const command = duplicatePieces('l',plan);
    expect(command.reduce(store.getState())).toEqual(command.reduce(store.getState()));
    commands.execute(command);
    expect(current(store).pieces).toHaveLength(7);
    expect(current(store).activeAreaId).toBe('a');
    expect(store.getState().session.selection).toEqual({kind:'pieces',ids:plan.copies.map(piece=>piece.id)});
  });
  it('keeps copied measurements exact and does not share child objects', () => {
    const layout = graph();
    const plan = preparePieceDuplication(layout,['p'],'design',ids());
    expect(plan.copies[0]?.w).toBe(81.997);
    const child = plan.copies[0]?.sinks[0];
    if (child) child.w = 99;
    expect(layout.pieces[0]?.sinks[0]?.w).toBe(22);
  });
});

describe('Piece compatibility and application effects', () => {
  it('normalizes malformed attachments and IDs deterministically', () => {
    const input = [
      {id:'x', attachment:{kind:'backsplash',parentPieceId:'y'}},
      {id:'y', attachment:{kind:'backsplash',parentPieceId:'x'}},
      {id:'x', attachment:{kind:'backsplash',parentPieceId:'missing'}},
      {id:'migrated-3'},
    ];
    const pieces = normalizePieces(input,['a'],'migrated');
    expect(new Set(pieces.map(piece=>piece.id)).size).toBe(4);
    expect(pieces.every(piece=>piece.attachment===null)).toBe(true);
    expect(normalizePieces(pieces,['a'],'migrated')).toEqual(pieces);
  });
  it('preserves unknown legacy fields behind the compatibility boundary', () => {
    const pieces = normalizePieces([{id:'p',customFuture:{value:3},w:81.997}],['a'],'test');
    expect(pieces[0]?.legacy).toEqual({customFuture:{value:3}});
    expect(normalizePieces(pieces,['a'],'test')).toEqual(pieces);
  });
  it('reports one-sided seams while safely expanding them from either endpoint', () => {
    const layout = graph();
    const q = layout.pieces[1];
    if (q) q.assemblyLinks = [];
    expect(validatePieceRelationships(layout.pieces,['a','b']).some(issue=>issue.kind==='unpaired-seam')).toBe(true);
    expect(pieceLifecycleFamilyIds(layout.pieces,['q'],'design')).toEqual(['p','q','s']);
  });
  it('undoes deletion and duplication as one step each and preserves metadata and Area navigation', () => {
    const { store, commands } = setup();
    const history = new HistoryManager(store); history.start();
    commands.execute(deletePieces('l',['p']));
    expect(history.getStatus().size).toBe(2);
    commands.execute(setActiveArea('l','b'));
    commands.execute(setProjectMeta({ name:'Keep metadata' }));
    history.undo();
    expect(current(store).pieces).toHaveLength(4);
    expect(current(store).activeAreaId).toBe('b');
    expect(store.getState().project.meta.name).toBe('Keep metadata');
    const plan = preparePieceDuplication(current(store),['p'],'design',ids());
    commands.execute(duplicatePieces('l',plan));
    expect(current(store).pieces).toHaveLength(7);
    history.undo();
    expect(current(store).pieces).toHaveLength(4);
    history.redo();
    expect(current(store).pieces).toHaveLength(7);
    history.stop();
  });
  it('round-trips typed graphs and precise geometry through persistence and autosave', () => {
    const { store, commands } = setup();
    let saved = '';
    const autosave = new AutosaveManager(store, {
      getItem:()=>saved || null, setItem:(_key,value)=>{saved=value;}, removeItem:()=>{saved='';},
    });
    autosave.start();
    commands.execute(duplicatePieces('l',preparePieceDuplication(current(store),['p'],'design',ids())));
    autosave.flush();
    expect(saved).not.toContain('"selection"');
    const file = cadLiteFileFromApplicationState(store.getState());
    expect(deserializeCadLiteFile(serializeCadLiteFile(file))).toEqual(file);
    expect(deserializeCadLiteFile(saved).project.layouts[0]?.pieces[0]?.w).toBe(81.997);
    autosave.stop();
  });
  it('preserves another Layout and its selection while editing an inactive Layout', () => {
    const { store, commands } = setup();
    store.getState().project.layouts.push(createEmptyLayout({id:'other-layout',firstAreaId:'c',name:'Other'}));
    commands.execute(setWorkspace('slab'));
    commands.execute(setActiveLayout('other-layout'));
    expect(store.getState().session.selection).toEqual({kind:'layout',id:'other-layout'});
    commands.execute(addPiece('l','new'));
    expect(store.getState().session.activeLayoutId).toBe('other-layout');
    expect(store.getState().session.selection).toEqual({kind:'layout',id:'other-layout'});
  });
});
