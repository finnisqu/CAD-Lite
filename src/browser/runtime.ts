import {
  AppStore,
  ApplicationEffects,
  CommandDispatcher,
  SelectionController,
  ToolController,
  applicationStateFromLegacyPayload,
  type AutosaveManagerOptions,
  type AutosaveStorage,
} from '../app';
import {
  ProjectLayoutSurface,
  type BrowserConfirm,
  type BrowserEntityIdFactory,
} from './project-layout-surface';

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
    ...(options.createId ? { createId: options.createId } : {}),
    ...(options.confirm ? { confirm: options.confirm } : {}),
  });

  surface.mount();
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
    destroy() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', beforeUnload);
      }
      surface.unmount();
      effects.stop(false);
    },
  };
}
