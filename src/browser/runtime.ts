import {
  AnnotationInteractionController,
  AppStore,
  ApplicationEffects,
  CanvasSelectionActions,
  CommandDispatcher,
  PieceInteractionController,
  ProjectLifecycle,
  RoomFeatureInteractionController,
  RoomFeatureNudgeController,
  SelectionController,
  StartupRecovery,
  ToolController,
  deleteCanvasSelection,
  registerAnnotationToolHandlers,
  registerRadiusToolHandler,
  registerRoomFeatureToolHandlers,
  registerSplashToolHandler,
  applicationStateFromLegacyPayload,
  type AutosaveManagerOptions,
  type AutosaveStorage,
} from '../app';
import {
  ProjectLayoutSurface,
  type BrowserConfirm,
  type BrowserEntityIdFactory,
} from './project-layout-surface';
import { CanvasKeyboardSurface } from './canvas-keyboard-surface';
import { ProjectFileSurface } from './project-file-surface';
import { StartupRecoverySurface } from './startup-recovery-surface';
import { FloorPlanCanvasSurface } from './floor-plan-canvas-surface';
import { FloorPlanNavigatorSurface } from './floor-plan-navigator-surface';
import { FloorPlanPreparationSurface } from './floor-plan-preparation-surface';
import { MaterialSurface } from './material-surface';
import { PieceCanvasSurface } from './piece-canvas-surface';
import { ProductionInspectorSurface } from './production-inspector-surface';
import { ProductionPiecePropertiesSurface } from './production-piece-properties-surface';
import { ProductionRadiusSurface } from './production-radius-surface';
import { ProductionSplashSurface } from './production-splash-surface';
import { ProductionShellSurface } from './production-shell-surface';
import { ProductionViewportSurface } from './production-viewport-surface';
import { RoomFeatureCanvasInteractions } from './room-feature-canvas-interactions';
import { ScratchpadSurface } from './scratchpad-surface';
import { SlabNavigatorSurface } from './slab-navigator-surface';
import { ViewPreferencesSurface } from './view-preferences-surface';

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
  selectionActions: CanvasSelectionActions;
  tools: ToolController;
  effects: ApplicationEffects;
  lifecycle: ProjectLifecycle;
  startupRecovery: StartupRecovery;
  startupRecoverySurface: StartupRecoverySurface;
  projectFileSurface: ProjectFileSurface;
  surface: ProjectLayoutSurface;
  materialSurface: MaterialSurface;
  scratchpadSurface: ScratchpadSurface;
  viewPreferencesSurface: ViewPreferencesSurface;
  productionPiecePropertiesSurface: ProductionPiecePropertiesSurface;
  productionSplashSurface: ProductionSplashSurface;
  productionRadiusSurface: ProductionRadiusSurface;
  productionInspectorSurface: ProductionInspectorSurface;
  productionShellSurface: ProductionShellSurface;
  productionViewportSurface: ProductionViewportSurface;
  slabNavigatorSurface: SlabNavigatorSurface;
  pieceCanvas: PieceCanvasSurface;
  canvasKeyboard: CanvasKeyboardSurface;
  floorPlanCanvas: FloorPlanCanvasSurface;
  floorPlanPreparation: FloorPlanPreparationSurface;
  floorPlanNavigator: FloorPlanNavigatorSurface;
  pieceInteractions: PieceInteractionController;
  annotationInteractions: AnnotationInteractionController;
  roomFeatureInteractions: RoomFeatureInteractionController;
  roomFeatureNudge: RoomFeatureNudgeController;
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
  const selectionActions = new CanvasSelectionActions(
    store,
    commands,
    createId,
  );
  const unregisterAnnotationTools = registerAnnotationToolHandlers(
    (toolId, handler) => tools.register(toolId, handler),
    createId,
  );
  const unregisterRoomFeatureTools = registerRoomFeatureToolHandlers(
    (toolId, handler) => tools.register(toolId, handler),
    createId,
  );
  const unregisterSplashTool = registerSplashToolHandler(
    (toolId, handler) => tools.register(toolId, handler),
    createId,
  );
  const unregisterRadiusTool = registerRadiusToolHandler(
    (toolId, handler) => tools.register(toolId, handler),
    createId,
  );
  const pieceInteractions = new PieceInteractionController(store, commands);
  const annotationInteractions = new AnnotationInteractionController(store, commands);
  const roomFeatureInteractions = new RoomFeatureInteractionController(
    store,
    commands,
  );
  const roomFeatureNudge = new RoomFeatureNudgeController(store, commands);
  const effects = new ApplicationEffects(store, {
    autosaveStorage: options.storage ?? browserStorage(),
    autosave: options.autosave ?? {},
  });
  const lifecycle = new ProjectLifecycle(store, effects, {
    beforeReplace: () => {
      pieceInteractions.cancel();
      annotationInteractions.cancel();
      roomFeatureInteractions.cancel();
      roomFeatureNudge.cancel();
      tools.cancel();
    },
  });
  const startupRecovery = new StartupRecovery(lifecycle, effects);
  const startupRecoverySurface = new StartupRecoverySurface({
    root,
    recovery: startupRecovery,
  });
  const projectFileSurface = new ProjectFileSurface({
    root,
    lifecycle,
    ...(options.confirm ? { confirm: options.confirm } : {}),
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
  const scratchpadSurface = new ScratchpadSurface({
    root,
    store,
    commands,
    effects,
  });
  const viewPreferencesSurface = new ViewPreferencesSurface({
    root,
    store,
    commands,
  });
  const productionPiecePropertiesSurface =
    new ProductionPiecePropertiesSurface({ root, store, commands });
  const productionSplashSurface = new ProductionSplashSurface({
    root,
    store,
    tools,
  });
  const productionRadiusSurface = new ProductionRadiusSurface({
    root,
    store,
    tools,
  });
  const productionInspectorSurface = new ProductionInspectorSurface({ root });
  const productionShellSurface = new ProductionShellSurface({
    root,
    actions: selectionActions,
    selection,
    deleteSelection: () => deleteCanvasSelection(store, commands),
  });
  const productionViewportSurface = new ProductionViewportSurface({
    root,
    store,
    commands,
  });
  const slabNavigatorSurface = new SlabNavigatorSurface({
    root,
    store,
    commands,
    effects,
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
  const canvasKeyboard = new CanvasKeyboardSurface({
    root,
    store,
    commands,
    actions: selectionActions,
    history: effects.history,
    roomFeatureNudge,
    tools,
    createPieceId: () => createId('piece'),
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

  projectFileSurface.mount();
  surface.mount();
  materialSurface.mount();
  scratchpadSurface.mount();
  viewPreferencesSurface.mount();
  pieceCanvas.mount();
  canvasKeyboard.mount();
  floorPlanCanvas.mount();
  floorPlanPreparation.mount();
  floorPlanNavigator.mount();
  roomFeatureCanvasInteractions.mount();
  slabNavigatorSurface.mount();
  productionPiecePropertiesSurface.mount();
  productionSplashSurface.mount();
  productionRadiusSurface.mount();
  productionInspectorSurface.mount();
  productionShellSurface.mount();
  productionViewportSurface.mount();
  startupRecoverySurface.mount();
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
    selectionActions,
    tools,
    effects,
    lifecycle,
    startupRecovery,
    startupRecoverySurface,
    projectFileSurface,
    surface,
    materialSurface,
    scratchpadSurface,
    viewPreferencesSurface,
    productionPiecePropertiesSurface,
    productionSplashSurface,
    productionRadiusSurface,
    productionInspectorSurface,
    productionShellSurface,
    productionViewportSurface,
    slabNavigatorSurface,
    pieceCanvas,
    canvasKeyboard,
    floorPlanCanvas,
    floorPlanPreparation,
    floorPlanNavigator,
    pieceInteractions,
    annotationInteractions,
    roomFeatureInteractions,
    roomFeatureNudge,
    roomFeatureCanvasInteractions,
    destroy() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', beforeUnload);
      }
      pieceInteractions.cancel();
      annotationInteractions.cancel();
      roomFeatureInteractions.cancel();
      roomFeatureNudge.cancel();
      unregisterAnnotationTools.forEach((unregister) => unregister());
      unregisterRoomFeatureTools.forEach((unregister) => unregister());
      unregisterRadiusTool();
      unregisterSplashTool();
      startupRecoverySurface.unmount();
      productionViewportSurface.unmount();
      productionShellSurface.unmount();
      productionInspectorSurface.unmount();
      productionRadiusSurface.unmount();
      productionSplashSurface.unmount();
      productionPiecePropertiesSurface.unmount();
      slabNavigatorSurface.unmount();
      roomFeatureCanvasInteractions.unmount();
      floorPlanNavigator.unmount();
      floorPlanPreparation.unmount();
      floorPlanCanvas.unmount();
      canvasKeyboard.unmount();
      pieceCanvas.unmount();
      viewPreferencesSurface.unmount();
      scratchpadSurface.unmount();
      materialSurface.unmount();
      surface.unmount();
      projectFileSurface.unmount();
      effects.stop(false);
    },
  };
}
