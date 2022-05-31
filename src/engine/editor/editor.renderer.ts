import { exportSceneAsGLTF } from "../gltf/GLTFExporter";
import { defineModule, getModule, registerMessageHandler, Thread } from "../module/module.common";
import { RenderThreadState } from "../renderer/renderer.render";
import { ExportGLTFMessage, SelectionChangedMessage, WorkerMessageType } from "../WorkerMessage";
import { editorModuleName } from "./editor.common";

export interface EditorRendererState {
  editorLoaded: boolean;
  selectedEntities: number[];
  prevSelectedEntities: number[];
}

export const EditorModule = defineModule<RenderThreadState, EditorRendererState>({
  name: editorModuleName,
  create(ctx, { sendMessage }) {
    return {
      editorLoaded: false,
      selectedEntities: [],
      prevSelectedEntities: [],
    };
  },
  init(ctx) {
    const disposables = [
      registerMessageHandler(ctx, WorkerMessageType.LoadEditor, onLoadEditor),
      registerMessageHandler(ctx, WorkerMessageType.DisposeEditor, onDisposeEditor),
      registerMessageHandler(ctx, WorkerMessageType.SelectionChanged, onSelectionChanged),
      registerMessageHandler(ctx, WorkerMessageType.ExportGLTF, onExportGLTF),
    ];

    return () => {
      for (const dispose of disposables) {
        dispose();
      }
    };
  },
});

function onLoadEditor(state: RenderThreadState) {
  const editor = getModule(state, EditorModule);
  editor.editorLoaded = true;
}

function onDisposeEditor(state: RenderThreadState) {
  const editor = getModule(state, EditorModule);
  editor.editorLoaded = false;
  editor.selectedEntities.length = 0;
}

function onSelectionChanged(state: RenderThreadState, message: SelectionChangedMessage) {
  const editor = getModule(state, EditorModule);
  editor.selectedEntities = message.selectedEntities;
}

async function onExportGLTF(state: RenderThreadState, message: ExportGLTFMessage) {
  const buffer = await exportSceneAsGLTF(state, message);

  state.sendMessage(Thread.Main, {
    type: WorkerMessageType.SaveGLTF,
    buffer,
  });
}