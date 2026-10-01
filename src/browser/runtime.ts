import {
  AnnotationInteractionController,
  AppStore,
  ApplicationEffects,
  CommandDispatcher,
  PieceInteractionController,
  RoomFeatureInteractionController,
  SelectionController,
  ToolController,
  registerAnnotationToolHandlers,
  registerRoomFeatureToolHandlers,
  applicationStateFromLegacyPayload,
  type AutosaveManagerOptions,
  type AutosaveStorage,
} from '../app';
import {
  ProjectLayoutSurface,
  type BrowserConfirm,
  type BrowserEntityIdFactory,
} from './project-layout-surface';
import { FloorPlanCanvasSurface } from './floor-plan-canvas-surface';
import { FloorPlanNavigatorSurface } from './floor-plan-navigator-surface';
import { FloorPlanPreparationSurface } from './floor-plan-preparation-surface';
import { MaterialSurface } from './material-surface';
import { PieceCanvasSurface } from './piece-canvas-surface';
import { RoomFeatureCanvasInteractions } from './room-feature-canvas-interactions';

export interface CadLiteBrowserRuntimeOptions {
  root?: ParentNode;
  initialPayload: unknown;
  storage?: AutosaveStorage;
  autosave?: AutosaveManagerOptions;
  today?: () => string;
  createId?: BrowserEntityIdFactory;
  confirm?: BrowserConfirm;
}

export interface CadLiteBrowserRuntime {
  store: AppStore;
  commands: CommandDispatcher;
  selection: SelectionController;
  tools: ToolController;
  effects: ApplicationEffects;
  surface: ProjectLayoutSurface;
  materialSurface: MaterialSurface;
  pieceCanvas: PieceCanvasSurface;
  floorPlanCanvas: FloorPlanCanvasSurface;
  floorPlanPreparation: FloorPlanPreparationSurface;
  floorPlanNavigator: FloorPlanNavigatorSurface;
  pieceInteractions: PieceInteractionController;
  annotationInteractions: AnnotationInteractionController;
  roomFeatureInteractions: RoomFeatureInteractionController;
  roomFeatureCanvasInteractions: RoomFeatureCanvasInteractions;
  destroy(): void;
}

function browserStorage(): AutosaveStorage {
  if (typeof window === 'undefined') {
    throw new Error(
      'CAD Lite browser runtime requires an AutosaveStorage outside the browser.',
    );
  }
  return window.localStorage;
}

export function mountCadLiteBrowserRuntime(
  options: CadLiteBrowserRuntimeOptions,
): CadLiteBrowserRuntime {
  const root =
    options.root ??
    (typeof document !== 'undefined' ? document : null);

  if (!root) {
    throw new Error('CAD Lite browser runtime requires a DOM root.');
  }

  const store = new AppStore(
    applicationStateFromLegacyPayload(options.initialPayload),
  );
  const commands = new CommandDispatcher(store);
  const selection = new SelectionController(store, commands);
  const tools = new ToolController(store, commands);
  let runtimeIdCounter = 0;
  const createId: BrowserEntityIdFactory =
    options.createId ??
    ((prefix) => {
      runtimeIdCounter += 1;
      const uuid = globalThis.crypto?.randomUUID?.();
      return uuid
        ? prefix + '-' + uuid
        : prefix + '-' + Date.now().toString(36) + '-' + runtimeIdCounter.toString(36);
    });
  const unregisterAnnotationTools = registerAnnotationToolHandlers(
    (toolId, handler) => tools.register(toolId, handler),
    createId,
  );
  const unregisterRoomFeatureTools = registerRoomFeatureToolHandlers(
    (toolId, handler) => tools.register(toolId, handler),
    createId,
  );
  const pieceInteractions = new PieceInteractionController(store, commands);
  const annotationInteractions = new AnnotationInteractionController(store, commands);
  const roomFeatureInteractions = new RoomFeatureInteractionController(
    store,
    commands,
  );
  const effects = new ApplicationEffects(store, {
    autosaveStorage: options.storage ?? browserStorage(),
    autosave: options.autosave ?? {},
  });
  const surface = new ProjectLayoutSurface({
    root,
    store,
    commands,
    effects,
    ...(options.today ? { today: options.today } : {}),
    createId,
    ...(options.confirm ? { confirm: options.confirm } : {}),
  });
  const materialSurface = new MaterialSurface({
    root,
    store,
    commands,
    effects,
    createId,
    ...(options.confirm ? { confirm: options.confirm } : {}),
  });

  const pieceCanvas = new PieceCanvasSurface({
    root,
    store,
    commands,
    effects,
    interaction: pieceInteractions,
    annotationInteraction: annotationInteractions,
    tools,
  });
  const floorPlanCanvas = new FloorPlanCanvasSurface({
    root,
    store,
    effects,
  });
  const floorPlanPreparation = new FloorPlanPreparationSurface({
    root,
    store,
    commands,
    effects,
    createId,
    ...(options.confirm ? { confirm: options.confirm } : {}),
  });
  const floorPlanNavigator = new FloorPlanNavigatorSurface({
    root,
    store,
    commands,
    effects,
    ...(options.confirm ? { confirm: options.confirm } : {}),
    onImport: () => floorPlanPreparation.openFilePicker(),
    onPrepare: () => floorPlanPreparation.prepareCurrentPlan(),
    onDistanceCalibration: () =>
      floorPlanPreparation.startDistanceCalibration(),
    onSquareCalibration: () => floorPlanPreparation.startSquareCalibration(),
  });
  const roomFeatureCanvasInteractions = new RoomFeatureCanvasInteractions({
    root,
    store,
    effects,
    tools,
    interaction: roomFeatureInteractions,
  });

  surface.mount();
  materialSurface.mount();
  pieceCanvas.mount();
  floorPlanCanvas.mount();
  floorPlanPreparation.mount();
  floorPlanNavigator.mount();
  roomFeatureCanvasInteractions.mount();
  effects.start();

  const beforeUnload = (): void => {
    effects.autosave.flush();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', beforeUnload);
  }

  return {
    store,
    commands,
    selection,
    tools,
    effects,
    surface,
    materialSurface,
    pieceCanvas,
    floorPlanCanvas,
    floorPlanPreparation,
    floorPlanNavigator,
    pieceInteractions,
    annotationInteractions,
    roomFeatureInteractions,
    roomFeatureCanvasInteractions,
    destroy() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', beforeUnload);
      }
      pieceInteractions.cancel();
      annotationInteractions.cancel();
      roomFeatureInteractions.cancel();
      unregisterAnnotationTools.forEach((unregister) => unregister());
      unregisterRoomFeatureTools.forEach((unregister) => unregister());
      roomFeatureCanvasInteractions.unmount();
      floorPlanNavigator.unmount();
      floorPlanPreparation.unmount();
      floorPlanCanvas.unmount();
      pieceCanvas.unmount();
      materialSurface.unmount();
      surface.unmount();
      effects.stop(false);
    },
  };
}
