import React, { useEffect, useState, useRef } from 'react';
import { useFetcher } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Flame, Music, Flower, Send, Monitor, Smartphone, MessageSquare, 
  Settings2, Loader2, Sliders, Save, Upload,
  ChevronDown, ChevronUp, ChevronRight, Trash2, History, X, GripVertical, FolderPlus, Folder, RotateCcw,
  Play, Square
} from 'lucide-react';
import { getIcon } from '../utils/iconSet';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useAppState } from '../hooks/useAppState';
import { getVisualization } from '../plugins/visualizations';
import { getTextStyle } from '../plugins/textStyles';
import { SettingsRenderer, CommonSettings } from './settings/SettingsRenderer';
import { VisualizationPresetsManager } from './settings/VisualizationPresetsManager';
import { TextStylePresetsManager } from './settings/TextStylePresetsManager';
import { MessageConfig, AppConfiguration, VisualizationPreset, TextStylePreset, MessageTreeNode, getDefaultsFromSchema } from '../plugins/types';
import { useStore } from '../store';
import { adjustPathForRemoval } from './messageTreeDnd';
import { applyStyleOverrideChange } from './messageStyleOverrides';

// API base for Tauri windows - they need to hit the Axum server directly
const API_BASE = 'http://localhost:8080';

// Icon map for visualizations
const iconMap: Record<string, React.ReactNode> = {
  'Flame': <Flame size={32} />,
  'Music': <Music size={32} />,
  'Flower': <Flower size={32} />,
};

export const ControlPlane: React.FC = () => {
  console.log('[ControlPlane] Component rendering');
  
  // SSE-based state - single source of truth
  const { state, isConnected } = useAppState({ apiBase: API_BASE });
  console.log('[ControlPlane] useAppState returned - state:', state, 'isConnected:', isConnected);
  
  // Loading state while SSE connects - but don't wait forever
  // CRITICAL: This must be declared BEFORE any conditional returns to maintain hook order
  const [showLoading, setShowLoading] = useState(true);
  
  // Use a simple boolean to track if state exists (always defined, never undefined)
  const hasState = state !== null;
  
  // Store for preset management (local state for now, will sync via commands)
  const visualizationPresets = useStore((s) => s.visualizationPresets);
  const activeVisualizationPreset = useStore((s) => s.activeVisualizationPreset);
  const addVisualizationPreset = useStore((s) => s.addVisualizationPreset);
  const updateVisualizationPreset = useStore((s) => s.updateVisualizationPreset);
  const deleteVisualizationPreset = useStore((s) => s.deleteVisualizationPreset);
  const setActiveVisualizationPreset = useStore((s) => s.setActiveVisualizationPreset);
  // Get message stats from SSE state (source of truth)
  // CRITICAL: Never call hooks conditionally.
  // This must ALWAYS call useStore, otherwise hook order changes between renders when SSE state arrives.
  const storeMessageStats = useStore((s) => s.messageStats);
  const messageStats = state?.messageStats ?? storeMessageStats;
  const activeMessages = useStore((s) => s.activeMessages);
  const clearActiveMessage = useStore((s) => s.clearActiveMessage);
  const resetMessageStats = useStore((s) => s.resetMessageStats);
  const folderPlaybackQueue = useStore((s) => s.folderPlaybackQueue);
  const playFolder = useStore((s) => s.playFolder);
  const cancelFolderPlayback = useStore((s) => s.cancelFolderPlayback);
  
  // Sync messageStats from SSE to store
  // CRITICAL: Use a ref to track the last synced value and only sync when state changes
  // Use a stable boolean dependency instead of computing a string key during render
  const messageStatsSyncedRef = useRef<string>('');
  const hasMessageStats = state?.messageStats != null;
  
  // Sync messageStats in useEffect with stable boolean dependency
  // CRITICAL: Only depend on hasMessageStats (always a boolean, never undefined)
  // Access state?.messageStats inside the effect via closure, not in dependency array
  useEffect(() => {
    if (!state?.messageStats) {
      if (messageStatsSyncedRef.current !== '') {
        messageStatsSyncedRef.current = '';
      }
      return;
    }
    
    try {
      const messageStatsKey = JSON.stringify(state.messageStats);
      if (messageStatsSyncedRef.current !== messageStatsKey) {
        console.log('[ControlPlane] Syncing messageStats to store');
        messageStatsSyncedRef.current = messageStatsKey;
        useStore.setState({ messageStats: state.messageStats });
      }
    } catch (e) {
      console.error('[ControlPlane] Error serializing messageStats:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMessageStats]); // ONLY hasMessageStats - state is accessed via closure

  // Sync the full SSE state into the store so saves include the live data
  const stateSyncRef = useRef<string>('');
  useEffect(() => {
    if (!state) return;

    // Build a stable snapshot key to avoid unnecessary loads
    const snapshot = {
      activeVisualization: state.activeVisualization,
      activeVisualizationPreset: state.activeVisualizationPreset ?? null,
      enabledVisualizations: state.enabledVisualizations,
      commonSettings: state.commonSettings,
      visualizationSettings: state.visualizationSettings ?? {},
      visualizationPresets: state.visualizationPresets ?? [],
      messages: state.messages ?? [],
      messageTree: state.messageTree ?? [],
      defaultTextStyle: state.defaultTextStyle,
      textStyleSettings: state.textStyleSettings ?? {},
      textStylePresets: state.textStylePresets ?? [],
      messageStats: state.messageStats ?? {},
    };

    const snapshotKey = JSON.stringify(snapshot);
    if (stateSyncRef.current === snapshotKey) return;
    stateSyncRef.current = snapshotKey;

    // Normalize message tree if SSE didn't send one
    const normalizedMessageTree: MessageTreeNode[] = (state.messageTree as MessageTreeNode[] | undefined)
      ?? (state.messages ?? []).map(msg => ({
        type: 'message' as const,
        id: msg.id,
        message: msg,
      }));

    // Load into the store without re-broadcasting to the backend
    useStore.getState().loadConfiguration({
      version: 1,
      activeVisualization: state.activeVisualization,
      activeVisualizationPreset: state.activeVisualizationPreset ?? undefined,
      enabledVisualizations: state.enabledVisualizations,
      commonSettings: state.commonSettings,
      visualizationSettings: state.visualizationSettings ?? {},
      visualizationPresets: state.visualizationPresets ?? [],
      messages: state.messages ?? [],
      messageTree: normalizedMessageTree,
      defaultTextStyle: state.defaultTextStyle,
      textStyleSettings: state.textStyleSettings ?? {},
      textStylePresets: state.textStylePresets ?? [],
      messageStats: state.messageStats ?? {},
    }, false);
  }, [state]);

  // Listen for state-changed events from VisualizerWindow (e.g., when messages complete)
  useEffect(() => {
    const unlistenState = listen<{ type: string; payload: unknown }>('state-changed', (event) => {
      const { type, payload } = event.payload;
      
      switch (type) {
        case 'CLEAR_MESSAGE': {
          // Message completed in VisualizerWindow - update local store
          // IMPORTANT: Use sync=true so queue advancement triggers next message to VisualizerWindow
          useStore.getState().clearMessage(payload as number, true);
          break;
        }
        case 'CLEAR_ACTIVE_MESSAGE': {
          // Message explicitly cleared - update local store
          if (payload && typeof payload === 'object' && 'messageId' in payload && 'timestamp' in payload) {
            const { messageId, timestamp } = payload as { messageId: string; timestamp: number };
            useStore.getState().clearActiveMessage(messageId, timestamp, false);
          }
          break;
        }
      }
    });

    return () => {
      unlistenState.then((u) => u());
    };
  }, []);
  
  // Store for text style presets
  const textStylePresets = useStore((s) => s.textStylePresets);
  const addTextStylePreset = useStore((s) => s.addTextStylePreset);
  const updateTextStylePreset = useStore((s) => s.updateTextStylePreset);
  const deleteTextStylePreset = useStore((s) => s.deleteTextStylePreset);
  
  // Local UI state
  const [newMessage, setNewMessage] = useState('');
  const [serverInfo, setServerInfo] = useState<{ ip: string; port: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Message tree DnD (pointer-based; HTML5 DnD is flaky in some WebViews)
  const [draggingNodePath, setDraggingNodePath] = useState<string | null>(null);
  const [dropVisibleIndex, setDropVisibleIndex] = useState<number | null>(null); // insertion marker in visible list
  const [dropIntoFolderPath, setDropIntoFolderPath] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageItemRefs = useRef<Map<string, HTMLDivElement>>(new Map()); // key: node path
  const [showTextStylePresetsManager, setShowTextStylePresetsManager] = useState(false);
  const [newMessageTextStylePresetId, setNewMessageTextStylePresetId] = useState<string>('');
  const [editingFolderPath, setEditingFolderPath] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState<string>('');

  // Debug flag for message reordering
  const dndDebugRef = useRef<boolean>(false);
  useEffect(() => {
    try {
      dndDebugRef.current = window.localStorage.getItem('vibecast:dndDebug') === '1';
    } catch {
      dndDebugRef.current = false;
    }
  }, []);

  // Fetcher for form submissions - no navigation, just mutation
  const fetcher = useFetcher();
  
  // Get active preset
  const activePreset = activeVisualizationPreset 
    ? visualizationPresets.find(p => p.id === activeVisualizationPreset)
    : null;

  // Fetch server info from Tauri on mount
  useEffect(() => {
    invoke<{ ip: string; port: number }>('get_server_info').then((info) => {
      setServerInfo(info);
    }).catch((err) => {
      console.error('Failed to get server info:', err);
    });
  }, []);

  // Loading timeout effect - must be after all other hooks
  useEffect(() => {
    console.log('[ControlPlane] useEffect showLoading - state:', state, 'hasState:', hasState);
    // Give SSE 2 seconds to connect, then show UI anyway
    const timer = setTimeout(() => {
      console.log('[ControlPlane] Loading timeout expired, showing UI');
      setShowLoading(false);
    }, 2000);
    
    if (state) {
      console.log('[ControlPlane] State received, clearing loading timeout');
      setShowLoading(false);
      clearTimeout(timer);
    }
    
    return () => {
      console.log('[ControlPlane] Cleaning up loading timeout');
      clearTimeout(timer);
    };
  }, [hasState]); // Use boolean instead of state object

  // Default "current" text preset for newly created messages
  useEffect(() => {
    if (!newMessageTextStylePresetId && textStylePresets.length > 0) {
      setNewMessageTextStylePresetId(textStylePresets[0].id);
    }
  }, [newMessageTextStylePresetId, textStylePresets]);

  // CRITICAL: NO early returns - always render the same structure
  // Use defaults if state is not available yet - always have values to render
  const activeVisualization = state?.activeVisualization ?? 'fireplace';
  const commonSettings = state?.commonSettings ?? { intensity: 1.0, dim: 1.0 };
  // Message tree (folders). SSE may or may not provide it; if missing we derive a flat tree from `messages`.
  const buildFlatTree = (msgs: MessageConfig[]): MessageTreeNode[] =>
    msgs.map((m) => ({ type: 'message', id: m.id, message: m }));
  const flattenTree = (tree: MessageTreeNode[]): MessageConfig[] => {
    const out: MessageConfig[] = [];
    const walk = (nodes: MessageTreeNode[]) => {
      nodes.forEach((n) => {
        if (n.type === 'message') out.push(n.message);
        else walk(n.children ?? []);
      });
    };
    walk(tree);
    return out;
  };

  const sseMessageTree = state?.messageTree as MessageTreeNode[] | undefined;
  const sseMessages = state?.messages;
  const [messageTreeLocal, setMessageTreeLocal] = useState<MessageTreeNode[]>([]);
  useEffect(() => {
    if (sseMessageTree && Array.isArray(sseMessageTree)) {
      setMessageTreeLocal(sseMessageTree);
    } else {
      setMessageTreeLocal(buildFlatTree(sseMessages ?? []));
    }
  }, [sseMessageTree, sseMessages]);

  const messages = flattenTree(messageTreeLocal);

  const cloneTree = (tree: MessageTreeNode[]) =>
    JSON.parse(JSON.stringify(tree)) as MessageTreeNode[];

  const updateMessageInTree = (tree: MessageTreeNode[], messageId: string, updater: (m: MessageConfig) => MessageConfig) => {
    const next = cloneTree(tree);
    const walk = (nodes: MessageTreeNode[]) => {
      nodes.forEach((n) => {
        if (n.type === 'message') {
          if (n.message.id === messageId) {
            n.message = updater(n.message);
            n.id = n.message.id;
          }
        } else {
          walk(n.children ?? []);
        }
      });
    };
    walk(next);
    return next;
  };

  const removeMessageFromTree = (tree: MessageTreeNode[], messageId: string) => {
    const next = cloneTree(tree);
    const filterWalk = (nodes: MessageTreeNode[]): MessageTreeNode[] =>
      nodes
        .filter((n) => !(n.type === 'message' && n.message.id === messageId))
        .map((n) => (n.type === 'folder' ? { ...n, children: filterWalk(n.children ?? []) } : n));
    return filterWalk(next);
  };

  const commitMessageTree = (nextTree: MessageTreeNode[]) => {
    setMessageTreeLocal(nextTree);
    sendCommand('set-message-tree', nextTree);
  };

  const updateMessageById = (messageId: string, updater: (m: MessageConfig) => MessageConfig) => {
    const nextTree = updateMessageInTree(messageTreeLocal, messageId, updater);
    commitMessageTree(nextTree);
  };

  type VisibleNode = {
    path: string;
    parentPath: string;
    indexInParent: number;
    depth: number;
    node: MessageTreeNode;
  };

  const getVisibleNodes = (tree: MessageTreeNode[]): VisibleNode[] => {
    const out: VisibleNode[] = [];
    const walk = (nodes: MessageTreeNode[], parentPath: string, depth: number) => {
      nodes.forEach((node, i) => {
        const path = parentPath ? `${parentPath}.${i}` : `${i}`;
        out.push({ path, parentPath, indexInParent: i, depth, node });
        if (node.type === 'folder' && !node.collapsed) {
          walk(node.children ?? [], path, depth + 1);
        }
      });
    };
    walk(tree, '', 0);
    return out;
  };

  const visibleNodes = getVisibleNodes(messageTreeLocal);

  const pathToIndices = (path: string): number[] =>
    path.split('.').filter(Boolean).map((p) => parseInt(p, 10));

  const getNodeAtPath = (tree: MessageTreeNode[], path: string): MessageTreeNode | null => {
    const indices = pathToIndices(path);
    let cur: MessageTreeNode[] = tree;
    let node: MessageTreeNode | null = null;
    for (const idx of indices) {
      node = cur[idx] ?? null;
      if (!node) return null;
      if (node.type === 'folder') cur = node.children ?? [];
      else cur = [];
    }
    return node;
  };

  const updateFolderAtPath = (tree: MessageTreeNode[], folderPath: string, updater: (f: any) => any): MessageTreeNode[] => {
    const indices = pathToIndices(folderPath);
    const next = cloneTree(tree);
    let children = next as any[];
    for (let d = 0; d < indices.length; d++) {
      const idx = indices[d];
      const node = children[idx];
      if (!node) return next;
      if (d === indices.length - 1) {
        children[idx] = updater(node);
        return next;
      }
      if (node.type !== 'folder') return next;
      children = node.children ?? (node.children = []);
    }
    return next;
  };

  const removeNodeAtPath = (tree: MessageTreeNode[], path: string): { tree: MessageTreeNode[]; removed: MessageTreeNode | null } => {
    const indices = pathToIndices(path);
    if (indices.length === 0) return { tree, removed: null };
    const next = cloneTree(tree);
    const parentIndices = indices.slice(0, -1);
    const removeIdx = indices[indices.length - 1];
    let children: any[] = next as any[];
    for (const idx of parentIndices) {
      const node = children[idx];
      if (!node || node.type !== 'folder') return { tree: next, removed: null };
      children = node.children ?? (node.children = []);
    }
    const removed = children.splice(removeIdx, 1)[0] ?? null;
    return { tree: next, removed };
  };

  const insertNode = (tree: MessageTreeNode[], parentPath: string, index: number, node: MessageTreeNode): MessageTreeNode[] => {
    const next = cloneTree(tree);
    if (!parentPath) {
      const arr = next as any[];
      arr.splice(Math.max(0, Math.min(arr.length, index)), 0, node);
      return next;
    }
    const parent = getNodeAtPath(next, parentPath);
    if (!parent || parent.type !== 'folder') return next;
    parent.children = parent.children ?? [];
    parent.children.splice(Math.max(0, Math.min(parent.children.length, index)), 0, node);
    return next;
  };

  const isDescendantPath = (ancestor: string, maybeDesc: string) =>
    maybeDesc === ancestor || maybeDesc.startsWith(`${ancestor}.`);

  const countFolder = (folder: any): { triggered: number; total: number } => {
    let total = 0;
    let triggered = 0;
    const walk = (nodes: MessageTreeNode[]) => {
      nodes.forEach((n) => {
        if (n.type === 'message') {
          total += 1;
          const stats = messageStats[n.message.id];
          if ((stats?.triggerCount ?? 0) > 0) triggered += 1;
        } else {
          walk(n.children ?? []);
        }
      });
    };
    walk(folder.children ?? []);
    return { triggered, total };
  };

  const dndLog = (...args: unknown[]) => {
    if (dndDebugRef.current) console.log('[ControlPlane:DND]', ...args);
  };

  const computeDrop = (clientX: number, clientY: number) => {
    // "Into folder" if hovering folder row and pointer is NOT near right edge marker zone.
    for (const entry of visibleNodes) {
      const el = messageItemRefs.current.get(entry.path);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const inside = clientY >= rect.top && clientY <= rect.bottom;
      if (!inside) continue;
      if (entry.node.type === 'folder') {
        const markerZone = 90; // px from right edge reserved for insert marker
        if (clientX < rect.right - markerZone) {
          return { mode: 'into' as const, folderPath: entry.path };
        }
      }
      break;
    }

    // Otherwise insertion before/after based on midpoints
    for (let i = 0; i < visibleNodes.length; i++) {
      const entry = visibleNodes[i];
      const el = messageItemRefs.current.get(entry.path);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return { mode: 'insert' as const, visibleIndex: i, parentPath: entry.parentPath, index: entry.indexInParent };
      }
    }
    return { mode: 'insert' as const, visibleIndex: visibleNodes.length, parentPath: '', index: messageTreeLocal.length };
  };

  const commitMove = (sourcePath: string, drop: ReturnType<typeof computeDrop>) => {
    // Prevent dropping folder into itself/descendant
    if (drop.mode === 'into' && isDescendantPath(sourcePath, drop.folderPath)) return;

    const removedRes = removeNodeAtPath(messageTreeLocal, sourcePath);
    if (!removedRes.removed) return;
    let nextTree = removedRes.tree;

    if (drop.mode === 'into') {
      // Removing the source can shift indices; adjust folder path accordingly.
      const adjustedFolderPath = adjustPathForRemoval(drop.folderPath, sourcePath);
      const folder = getNodeAtPath(nextTree, adjustedFolderPath);
      if (!folder || folder.type !== 'folder') return;
      folder.children = folder.children ?? [];
      folder.collapsed = false;
      folder.children.push(removedRes.removed);
      dndLog('commit into', { sourcePath, folderPath: drop.folderPath, adjustedFolderPath });
      commitMessageTree(nextTree);
      return;
    }

    // Adjust insertion index if moving within same parent and source was before insertion
    let insertIndex = drop.index;
    const srcParts = pathToIndices(sourcePath);
    const srcParentPath = srcParts.slice(0, -1).join('.');
    const srcIdx = srcParts[srcParts.length - 1];
    if (srcParentPath === drop.parentPath && srcIdx < insertIndex) insertIndex -= 1;

    nextTree = insertNode(nextTree, drop.parentPath, insertIndex, removedRes.removed);
    dndLog('commit insert', { sourcePath, parentPath: drop.parentPath, insertIndex });
    commitMessageTree(nextTree);
  };
  const defaultTextStyle = state?.defaultTextStyle ?? 'scrolling-capitals';
  const textStyleSettings = state?.textStyleSettings ?? {};

  const toggleViz = async () => {
    try {
      const allWindows = await getAllWebviewWindows();
      const vizWindow = allWindows.find(w => w.label === 'viz');
      
      if (!vizWindow) {
        console.error('Viz window not found. Available windows:', allWindows.map(w => w.label));
        return;
      }
      
      const visible = await vizWindow.isVisible();
      console.log('Viz window visible:', visible);
      
      if (visible) {
        await vizWindow.hide();
        console.log('Viz window hidden');
      } else {
        await vizWindow.show();
        await vizWindow.setFocus();
        console.log('Viz window shown and focused');
      }
    } catch (error) {
      console.error('Error toggling viz window:', error);
    }
  };

  const restartViz = async () => {
    try {
      await invoke('restart_viz_window');
    } catch (error) {
      console.error('Error restarting viz window:', error);
    }
  };

  // Helper to send commands via fetcher
  const sendCommand = (command: string, payload: unknown) => {
    fetcher.submit(
      { command, payload: JSON.stringify(payload) },
      { method: 'post', action: '/' }
    );
  };

  const handleAddMessage = () => {
    if (newMessage.trim()) {
      const preset = newMessageTextStylePresetId
        ? textStylePresets.find((p) => p.id === newMessageTextStylePresetId)
        : null;
      const newMsg: MessageConfig = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        text: newMessage.trim(),
        textStyle: preset?.textStyleId ?? defaultTextStyle,
        textStylePreset: preset?.id || undefined,
      };
      const nextTree = [...messageTreeLocal, { type: 'message', id: newMsg.id, message: newMsg } as MessageTreeNode];
      setMessageTreeLocal(nextTree);
      sendCommand('set-message-tree', nextTree);
      setNewMessage('');
    }
  };

  const handleAddFolder = () => {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const nextTree: MessageTreeNode[] = [
      ...messageTreeLocal,
      { type: 'folder', id, name: 'New Folder', collapsed: false, children: [] },
    ];
    commitMessageTree(nextTree);
    const newPath = `${messageTreeLocal.length}`;
    setEditingFolderPath(newPath);
    setEditingFolderName('New Folder');
  };

  const handleResetCounts = () => {
    resetMessageStats(false);
    sendCommand('reset-message-stats', null);
  };

  const handleDeleteMessage = (id: string) => {
    const nextTree = removeMessageFromTree(messageTreeLocal, id);
    setMessageTreeLocal(nextTree);
    sendCommand('set-message-tree', nextTree);
    if (expandedMessage === id) setExpandedMessage(null);
  };

  const startPointerDrag = (e: React.PointerEvent, nodePath: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    setDraggingNodePath(nodePath);
    setDropVisibleIndex(null);
    setDropIntoFolderPath(null);
    dndLog('start', { nodePath, x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMoveTree = (e: React.PointerEvent) => {
    if (!draggingNodePath) return;
    const drop = computeDrop(e.clientX, e.clientY);
    if (drop.mode === 'into') {
      setDropIntoFolderPath(drop.folderPath);
      setDropVisibleIndex(null);
    } else {
      setDropIntoFolderPath(null);
      setDropVisibleIndex(drop.visibleIndex);
    }
    dndLog('move', drop);
  };

  const endPointerDragTree = (e: React.PointerEvent) => {
    if (!draggingNodePath) return;
    const drop = computeDrop(e.clientX, e.clientY);
    dndLog('end', drop);
    commitMove(draggingNodePath, drop);
    setDraggingNodePath(null);
    setDropVisibleIndex(null);
    setDropIntoFolderPath(null);
  };

  const handleTriggerMessage = (msg: MessageConfig) => {
    const activeInstance = activeMessages.find((am) => am.message.id === msg.id);
    if (activeInstance) {
      // If already playing, stop instead of retriggering
      handleClearActiveMessage(msg.id, activeInstance.timestamp);
      return;
    }
    // Optimistically start playing locally, then sync to backend
    useStore.getState().triggerMessage(msg, false);
    sendCommand('trigger-message', msg);
  };

  const handleClearActiveMessage = (messageId: string, timestamp?: number) => {
    // Find all active instances of this message and clear them
    const activeInstances = activeMessages.filter(am => am.message.id === messageId);
    if (timestamp !== undefined) {
      // Clear specific instance
      clearActiveMessage(messageId, timestamp, false);
      sendCommand('clear-active-message', { messageId, timestamp });
    } else {
      // Clear all instances
      activeInstances.forEach(({ timestamp: ts }) => {
        clearActiveMessage(messageId, ts, false);
        sendCommand('clear-active-message', { messageId, timestamp: ts });
      });
    }
  };

  const handleSaveConfig = async () => {
    try {
      // Get complete configuration from store
      const config = useStore.getState().getConfiguration();
      const json = JSON.stringify(config, null, 2);
      
      // Show save dialog
      const filePath = await save({
        defaultPath: `vibecast-config-${new Date().toISOString().slice(0,10)}.json`,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });
      
      // Write file if user didn't cancel
      if (filePath) {
        console.log('Saving to:', filePath);
        await writeTextFile(filePath, json);
        console.log('File saved successfully!');
      } else {
        console.log('Save cancelled by user');
      }
    } catch (err) {
      console.error('Failed to save configuration:', err);
    }
  };

  const handleLoadConfig = async () => {
    try {
      // Show open dialog
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });
      
      // Read and parse file if user didn't cancel
      if (selected && typeof selected === 'string') {
        console.log('Loading from:', selected);
        const text = await readTextFile(selected);
        const config = JSON.parse(text) as AppConfiguration;
        console.log('Loaded configuration:', config);
        
        // Load into local store first
        useStore.getState().loadConfiguration(config, false);
        
        // Then sync to backend and other windows
        sendCommand('load-configuration', config);
        
        console.log('Configuration loaded successfully!');
      } else {
        console.log('Load cancelled by user');
      }
    } catch (err) {
      console.error('Failed to load configuration:', err);
    }
  };

  const remoteUrl = serverInfo ? `http://${serverInfo.ip}:${serverInfo.port}` : '';
  const isPending = fetcher.state !== 'idle';


  const activePlugin = activePreset 
    ? getVisualization(activePreset.visualizationId)
    : getVisualization(activeVisualization);

  // Preset management handlers
  const handleAddPreset = (preset: VisualizationPreset) => {
    addVisualizationPreset(preset);
    sendCommand('set-visualization-presets', [...visualizationPresets, preset]);
  };

  const handleUpdatePreset = (id: string, updates: Partial<VisualizationPreset>) => {
    updateVisualizationPreset(id, updates);
    const updated = visualizationPresets.map(p => p.id === id ? { ...p, ...updates } : p);
    sendCommand('set-visualization-presets', updated);
  };

  const handleDeletePreset = (id: string) => {
    deleteVisualizationPreset(id);
    const filtered = visualizationPresets.filter(p => p.id !== id);
    sendCommand('set-visualization-presets', filtered);
    if (activeVisualizationPreset === id) {
      setActiveVisualizationPreset(null);
      sendCommand('set-active-visualization-preset', null);
    }
  };

  const handleSetActivePreset = (id: string | null) => {
    setActiveVisualizationPreset(id);
    sendCommand('set-active-visualization-preset', id);
  };

  // Text style preset handlers
  const handleAddTextStylePreset = (preset: TextStylePreset) => {
    addTextStylePreset(preset);
    sendCommand('set-text-style-presets', [...textStylePresets, preset]);
  };

  const handleUpdateTextStylePreset = (id: string, updates: Partial<TextStylePreset>) => {
    updateTextStylePreset(id, updates);
    const updated = textStylePresets.map(p => p.id === id ? { ...p, ...updates } : p);
    sendCommand('set-text-style-presets', updated);
  };

  const handleDeleteTextStylePreset = (id: string) => {
    deleteTextStylePreset(id);
    const filtered = textStylePresets.filter(p => p.id !== id);
    sendCommand('set-text-style-presets', filtered);
  };

  // CRITICAL: NO early returns - always render the same structure
  // Conditionally render loading state in JSX to maintain hook order
    return (
    <>
      {showLoading && !state ? (
      <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-orange-500" />
          <span className="text-zinc-500 text-sm">Connecting to server...</span>
        </div>
      </div>
      ) : (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-orange-500/30 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-orange-600/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-600/5 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <header className="flex justify-between items-end mb-12">
          <div>
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 mb-2"
            >
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-orange-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 uppercase">
                {isConnected ? 'System Active' : 'Reconnecting...'}
              </span>
            </motion.div>
            <h1 className="text-5xl font-black tracking-tight bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
              VIBECAST
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Config buttons */}
            <button 
              onClick={handleSaveConfig}
              className="p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl transition-all active:scale-95"
              title="Save Configuration"
            >
              <Save size={18} className="text-zinc-400" />
            </button>
            <button 
              onClick={handleLoadConfig}
              className="p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl transition-all active:scale-95"
              title="Load Configuration"
            >
              <Upload size={18} className="text-zinc-400" />
            </button>
            
            <button 
              onClick={toggleViz}
              className="group relative px-6 py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl transition-all active:scale-95 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-3 font-bold text-sm">
                <Monitor size={18} className="text-orange-500" />
                Toggle Stage
              </div>
            </button>

            <button
              onClick={restartViz}
              className="group relative px-6 py-3 bg-zinc-900 border border-zinc-800 hover:border-red-500/60 rounded-xl transition-all active:scale-95 overflow-hidden"
              title="Restart the visualization window (use if it turns grey/unresponsive)"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-3 font-bold text-sm">
                <X size={18} className="text-red-400" />
                Restart Stage
              </div>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-6">
          {/* Main Controls */}
          <div className="col-span-12 lg:col-span-8 space-y-6 order-1">
            {/* Visualization Selection */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Settings2 size={18} className="text-zinc-500" />
                  <h2 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Visualization</h2>
                </div>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                    showSettings ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Sliders size={14} />
                  Settings
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(!visualizationPresets || visualizationPresets.filter(p => p.enabled !== false).length === 0) ? (
                  <div className="col-span-2 text-center py-8 text-zinc-500 text-sm">
                    {visualizationPresets?.length === 0 
                      ? 'No enabled presets. Enable them in Settings.'
                      : 'Loading presets...'}
                  </div>
                ) : (
                  visualizationPresets
                    .filter(p => p.enabled !== false)
                    .map((preset) => {
                      const viz = getVisualization(preset.visualizationId);
                      // If we don't have an explicit active preset yet, fall back to the active visualization id
                      const isActive =
                        preset.id === activeVisualizationPreset ||
                        (!activeVisualizationPreset && preset.visualizationId === activeVisualization);
                      return (
                  <VisualizationCard 
                          key={preset.id}
                          active={isActive}
                          onClick={() => handleSetActivePreset(isActive ? null : preset.id)}
                          icon={
                            preset.icon 
                              ? getIcon(preset.icon, 32) || <Settings2 size={32} />
                              : (viz ? (iconMap[viz.icon] || <Settings2 size={32} />) : <Settings2 size={32} />)
                          }
                          title={preset.name}
                          description={viz?.description || `${preset.visualizationId} preset`}
                    disabled={isPending}
                  />
                      );
                    })
                )}
              </div>
            </section>

            {/* Settings Panel */}
            <AnimatePresence>
              {showSettings && (
                <motion.section
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-6">
                    {/* Common Settings - Always visible */}
                    <div>
                      <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">
                        Common Settings
                      </h3>
                      <CommonSettings
                        intensity={commonSettings.intensity}
                        dim={commonSettings.dim}
                        onIntensityChange={(v) => sendCommand('set-common-settings', { ...commonSettings, intensity: v })}
                        onDimChange={(v) => sendCommand('set-common-settings', { ...commonSettings, dim: v })}
                      />
                    </div>

                    {/* Visualization Presets Manager */}
                    <div className="space-y-6">
                    <div>
                        <VisualizationPresetsManager
                          presets={visualizationPresets}
                          activePresetId={activeVisualizationPreset}
                          onAddPreset={handleAddPreset}
                          onUpdatePreset={handleUpdatePreset}
                          onDeletePreset={handleDeletePreset}
                          onSetActivePreset={handleSetActivePreset}
                        />
                    </div>

                      {/* Active Preset Settings */}
                      {activePreset && activePlugin && activePlugin.settingsSchema.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">
                            {activePreset.name} Settings
                        </h3>
                        <SettingsRenderer
                          schema={activePlugin.settingsSchema}
                            values={activePreset.settings}
                          onChange={(key, value) => {
                              handleUpdatePreset(activePreset.id, {
                                settings: { ...activePreset.settings, [key]: value },
                              });
                          }}
                        />
                      </div>
                      )}
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

          </div>

          {/* Sidebar - Messages */}
          <aside className="col-span-12 lg:col-span-4 order-2">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
              <MessageSquare size={18} className="text-zinc-500" />
              <h2 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Messages</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddFolder}
                  className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  title="Add folder"
                >
                  <FolderPlus size={14} />
                </button>
                <button
                  onClick={handleResetCounts}
                  className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  title="Reset all message counts"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={`p-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                    showHistory ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                  title="Show message history"
                >
                  <History size={14} />
                </button>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 backdrop-blur-md flex flex-col max-h-[700px]">
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddMessage();
                    }
                  }}
                  placeholder="New message..."
                  className="flex-1 bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-orange-500/50 outline-none transition-all"
                />
                <button
                  onClick={handleAddMessage}
                  disabled={isPending || !newMessage.trim()}
                  className="p-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all active:scale-90 shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                </button>
              </div>

              {/* New message style preset (current preset) */}
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">
                    Text Style Preset (new messages)
                  </label>
                  <button
                    onClick={() => setShowTextStylePresetsManager((v) => !v)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                      showTextStylePresetsManager
                        ? 'bg-orange-500 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                    title="Manage text style presets"
                  >
                    <Sliders size={14} />
                    Presets
                  </button>
                </div>
                <select
                  value={newMessageTextStylePresetId}
                  onChange={(e) => setNewMessageTextStylePresetId(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:border-orange-500/50 outline-none transition-all"
                >
                  <option value="">Default ({defaultTextStyle})</option>
                  {textStylePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Text style presets manager (in Messages sidebar) */}
              <AnimatePresence>
                {showTextStylePresetsManager && (
                    <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 border border-zinc-800 rounded-xl overflow-hidden"
                  >
                    <div className="p-4 bg-zinc-950">
                      <TextStylePresetsManager
                        presets={textStylePresets}
                        onAddPreset={handleAddTextStylePreset}
                        onUpdatePreset={handleUpdateTextStylePreset}
                        onDeletePreset={handleDeleteTextStylePreset}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                ref={messageListRef}
                className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar"
                onPointerMove={onPointerMoveTree}
                onPointerUp={endPointerDragTree}
                onPointerCancel={endPointerDragTree}
              >
                <LayoutGroup>
                <AnimatePresence initial={false}>
                  {visibleNodes.map((entry, idx) => {
                    const indent = 6 + entry.depth * 14;
                    const isDragging = draggingNodePath === entry.path;
                    const isDropInto = dropIntoFolderPath === entry.path && entry.node.type === 'folder';
                    const rowKey =
                      entry.node.type === 'folder'
                        ? `f:${entry.node.id}`
                        : `m:${entry.node.message.id}`;
                    const dropMarker =
                      draggingNodePath && dropVisibleIndex === idx ? (
                        <div className="h-2 flex items-center">
                          <div className="ml-auto w-14 h-[2px] bg-orange-500/70 rounded-full" />
                        </div>
                      ) : null;

                    if (entry.node.type === 'folder') {
                      const folder = entry.node;
                      const counts = countFolder(folder);
                      const isCollapsed = !!folder.collapsed;
                      return (
                        <div
                          key={rowKey}
                          ref={(el) => {
                            if (!el) {
                              messageItemRefs.current.delete(entry.path);
                              return;
                            }
                            messageItemRefs.current.set(entry.path, el);
                          }}
                          className={isDragging ? 'opacity-50' : ''}
                        >
                          {dropMarker}
                    <motion.div
                            layout="position"
                            transition={{ type: 'spring', stiffness: 650, damping: 45, mass: 0.8 }}
                            className={`bg-zinc-950 border rounded-xl overflow-hidden transition-all ${
                              isDropInto ? 'border-orange-500/60 shadow-lg shadow-orange-500/10' : 'border-zinc-800/50'
                            }`}
                    >
                            <div className="flex items-center gap-2 p-3" style={{ paddingLeft: indent }}>
                        <button
                                onClick={() => {
                                  const nextTree = updateFolderAtPath(messageTreeLocal, entry.path, (f) => ({
                                    ...f,
                                    collapsed: !f.collapsed,
                                  }));
                                  commitMessageTree(nextTree);
                                }}
                                className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                                title={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                              >
                                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        </button>
                          <button
                                onPointerDown={(e) => startPointerDrag(e, entry.path)}
                                className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors cursor-grab active:cursor-grabbing"
                                title="Drag folder"
                              >
                                <GripVertical size={16} />
                          </button>
                              <Folder size={16} className="text-zinc-600" />
                              {editingFolderPath === entry.path ? (
                                <input
                                  autoFocus
                                  value={editingFolderName}
                                  onChange={(e) => setEditingFolderName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const name = editingFolderName.trim() || 'Folder';
                                      const nextTree = updateFolderAtPath(messageTreeLocal, entry.path, (f) => ({
                                        ...f,
                                        name,
                                      }));
                                      commitMessageTree(nextTree);
                                      setEditingFolderPath(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingFolderPath(null);
                                    }
                                  }}
                                  onBlur={() => {
                                    const name = editingFolderName.trim() || 'Folder';
                                    const nextTree = updateFolderAtPath(messageTreeLocal, entry.path, (f) => ({
                                      ...f,
                                      name,
                                    }));
                                    commitMessageTree(nextTree);
                                    setEditingFolderPath(null);
                                  }}
                                  className="flex-1 bg-black border border-zinc-800 rounded-lg px-2 py-1 text-sm text-zinc-200 focus:border-orange-500/50 outline-none"
                                />
                              ) : (
                          <button
                                  onDoubleClick={() => {
                                    setEditingFolderPath(entry.path);
                                    setEditingFolderName(folder.name);
                                  }}
                                  className="flex-1 text-left text-sm font-semibold text-zinc-200 hover:text-white transition-colors truncate"
                                  title="Double click to rename"
                                >
                                  {folder.name}
                          </button>
                              )}
                              <div className="ml-auto flex items-center gap-2">
                                {folderPlaybackQueue?.folderId === folder.id && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-orange-400 font-bold">
                                      Playing: {folderPlaybackQueue.currentIndex + 1}/{folderPlaybackQueue.messageIds.length}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // sync=true emits CANCEL_FOLDER_PLAYBACK event to visualizer
                                        cancelFolderPlayback(true);
                                      }}
                                      className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-bold hover:bg-red-500/30 transition-colors"
                                      title="Cancel folder playback"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                )}
                                {(!folderPlaybackQueue || folderPlaybackQueue.folderId !== folder.id) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const confirmed = window.confirm('Play this folder sequentially?');
                                      if (confirmed) {
                                        // sync=true triggers first message with syncState, which visualizer receives
                                        playFolder(folder.id, messageTreeLocal, true);
                                      }
                                    }}
                                    className="px-2 py-1 bg-zinc-800 text-zinc-400 hover:text-orange-500 rounded text-xs font-bold hover:bg-zinc-700 transition-colors"
                                    title="Play folder sequentially"
                                  >
                                    <Play size={12} fill="currentColor" />
                                  </button>
                                )}
                                <div className="text-xs font-bold text-zinc-500 tabular-nums">
                                  {counts.triggered} / {counts.total}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        </div>
                      );
                    }

                    const msg = entry.node.message;
                    const stats = messageStats[msg.id];
                    const triggerCount = stats?.triggerCount ?? 0;
                    const isAnimating = activeMessages.some((am) => am.message.id === msg.id);
                    const isInQueue = folderPlaybackQueue?.messageIds.includes(msg.id) ?? false;
                    const queuePosition = isInQueue ? folderPlaybackQueue!.messageIds.indexOf(msg.id) + 1 : null;
                    const queueTotal = folderPlaybackQueue?.messageIds.length ?? null;

                    return (
                      <div
                        key={rowKey}
                        ref={(el) => {
                          if (!el) {
                            messageItemRefs.current.delete(entry.path);
                            return;
                          }
                          messageItemRefs.current.set(entry.path, el);
                        }}
                        className={isDragging ? 'opacity-50' : ''}
                      >
                        {dropMarker}
                        <motion.div
                          layout="position"
                          transition={{ type: 'spring', stiffness: 650, damping: 45, mass: 0.8 }}
                          className={`bg-zinc-950 border rounded-xl overflow-hidden transition-all ${
                            isAnimating ? 'border-orange-500/50 shadow-lg shadow-orange-500/20' : 'border-zinc-800/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 p-3" style={{ paddingLeft: indent }}>
                            <button
                              onPointerDown={(e) => startPointerDrag(e, entry.path)}
                              className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors cursor-grab active:cursor-grabbing"
                              title="Drag to reorder"
                            >
                              <GripVertical size={16} />
                            </button>
                            <button
                              onClick={() => handleTriggerMessage(msg)}
                              disabled={isPending}
                              className={`flex-1 text-left text-sm font-medium transition-all disabled:opacity-50 truncate ${
                                isAnimating
                                  ? 'text-orange-500 hover:text-orange-400'
                                  : triggerCount > 0
                                    ? 'text-zinc-200 hover:text-white'
                                    : 'text-zinc-300 hover:text-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                    isAnimating
                                      ? 'bg-orange-500 animate-pulse'
                                      : triggerCount > 0
                                        ? 'bg-green-500'
                                        : 'bg-zinc-600'
                                  }`}
                                />
                                <span>{msg.text}</span>
                                <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 border border-zinc-800 bg-zinc-900/40 rounded px-1.5 py-0.5">
                                  {(() => {
                                    const preset = msg.textStylePreset
                                      ? textStylePresets.find((p) => p.id === msg.textStylePreset)
                                      : null;
                                    if (preset) return preset.name;
                                    const style = getTextStyle(msg.textStyle);
                                    return style?.name ?? msg.textStyle;
                                  })()}
                                </span>
                                {isAnimating && (
                                  <span className="text-xs text-orange-500 font-bold animate-pulse">Playing</span>
                                )}
                                {isInQueue && !isAnimating && queuePosition && queueTotal && (
                                  <span className="text-xs text-blue-400 font-bold">
                                    {queuePosition}/{queueTotal}
                                  </span>
                                )}
                              </div>
                            </button>
                            {/* Play/Stop button - unified logic; shows stop while active */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTriggerMessage(msg);
                              }}
                              className={`p-1.5 rounded transition-colors ${
                                isAnimating
                                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                  : 'text-zinc-500 hover:text-orange-500 hover:bg-zinc-800'
                              }`}
                              title={isAnimating ? 'Stop message' : 'Play message'}
                            >
                              {isAnimating ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                            </button>
                            <div
                              className={`px-2 py-0.5 rounded text-xs font-bold ${
                                triggerCount === 0
                                  ? 'bg-zinc-800 text-zinc-500'
                                  : 'bg-orange-500/20 text-orange-400'
                              }`}
                              title={`Triggered ${triggerCount} time${triggerCount !== 1 ? 's' : ''}`}
                            >
                              {triggerCount}
                            </div>
                        <button
                          onClick={() => setExpandedMessage(expandedMessage === msg.id ? null : msg.id)}
                          className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          {expandedMessage === msg.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                          title="Delete message"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <AnimatePresence>
                        {expandedMessage === msg.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="px-3 pb-3 border-t border-zinc-800/50"
                          >
                            <div className="pt-3 space-y-4">
                              {/* Message Text Editor */}
                              <div>
                                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                                  Message Text
                                </label>
                                <textarea
                                  value={msg.text}
                                  onChange={(e) => {
                                    updateMessageById(msg.id, (m) => ({ ...m, text: e.target.value }));
                                  }}
                                  rows={3}
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors resize-y"
                                  placeholder="Enter message text..."
                                />
                              </div>

                              {/* Text Style Selector (single dropdown) */}
                              <div>
                              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                                Text Style
                              </label>
                                {(() => {
                                  const currentPresetId = msg.textStylePreset || '';
                                  const hasOverrides = !!(msg.styleOverrides && Object.keys(msg.styleOverrides).length > 0);
                                  
                                  // If we have overrides but no preset, try to find a preset matching the text style
                                  const styleId = msg.textStyle;
                                  const matchingPreset = !currentPresetId && hasOverrides && styleId
                                    ? textStylePresets.find(p => p.textStyleId === styleId)
                                    : null;
                                  const effectivePresetId = currentPresetId || (matchingPreset?.id || '');
                                  
                                  const selectedValue = effectivePresetId
                                    ? (hasOverrides ? `${effectivePresetId}:modified` : effectivePresetId)
                                    : '';

                                  return (
                              <select
                                      value={selectedValue}
                                      onChange={(e) => {
                                        const raw = e.target.value || '';
                                        const isModified = raw.endsWith(':modified');
                                        const presetId = isModified ? raw.slice(0, -':modified'.length) : raw;
                                        const preset = presetId ? textStylePresets.find((p) => p.id === presetId) : null;
                                        if (!preset) return;

                                        updateMessageById(msg.id, (m) => ({
                                          ...m,
                                          textStylePreset: preset.id,
                                          textStyle: preset.textStyleId,
                                          // Selecting the base option clears overrides. "(modified)" is only shown when overrides actually differ.
                                          styleOverrides: isModified ? m.styleOverrides : undefined,
                                        }));
                                      }}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors"
                              >
                                      {textStylePresets.flatMap((preset) => {
                                        const opts = [
                                          <option key={preset.id} value={preset.id}>
                                            {preset.name}
                                          </option>,
                                        ];
                                        // Show modified option if this preset is selected (or matches the style when no preset is selected) and has overrides
                                        const isSelected = currentPresetId === preset.id || 
                                          (!currentPresetId && hasOverrides && preset.textStyleId === styleId);
                                        if (isSelected && hasOverrides) {
                                          opts.push(
                                            <option key={`${preset.id}:modified`} value={`${preset.id}:modified`}>
                                              {preset.name} (modified)
                                  </option>
                                          );
                                        }
                                        return opts;
                                      })}
                              </select>
                                  );
                                })()}
                              </div>

                              {/* Repeat Count */}
                              <div>
                                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                                  Repeat Count: {msg.repeatCount ?? 1}
                                </label>
                                <input
                                  type="range"
                                  min="1"
                                  max="10"
                                  value={msg.repeatCount ?? 1}
                                  onChange={(e) => {
                                    updateMessageById(msg.id, (m) => ({ ...m, repeatCount: parseInt(e.target.value) }));
                                  }}
                                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                                  <span>1</span>
                                  <span>10</span>
                                </div>
                              </div>

                              {/* Split on */}
                              <div>
                                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                                  Split on separator
                                </label>
                                <div className="flex items-center gap-3">
                                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                                    <input
                                      type="checkbox"
                                      checked={!!msg.splitEnabled}
                                      onChange={(e) => {
                                        const enabled = e.target.checked;
                                        updateMessageById(msg.id, (m) => ({
                                          ...m,
                                          splitEnabled: enabled,
                                        }));
                                      }}
                                      className="accent-orange-500"
                                    />
                                    Enable split
                                  </label>
                                  <input
                                    type="text"
                                    disabled={!msg.splitEnabled}
                                    value={msg.splitSeparator ?? ''}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      updateMessageById(msg.id, (m) => ({
                                        ...m,
                                        splitSeparator: raw.trim(),
                                      }));
                                    }}
                                    placeholder="Separator (e.g. |)"
                                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 disabled:opacity-50 focus:border-orange-500 outline-none transition-colors"
                                  />
                                </div>
                                <p className="text-xs text-zinc-500 mt-1">
                                  Parts are trimmed; when enabled, messages cycle through split parts and repeat loops the set.
                                </p>
                              </div>

                              {/* Speed Multiplier */}
                              <div>
                                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                                  Speed: {(msg.speed ?? 1.0).toFixed(1)}x
                                </label>
                                <input
                                  type="range"
                                  min="0.5"
                                  max="2.0"
                                  step="0.1"
                                  value={msg.speed ?? 1.0}
                                  onChange={(e) => {
                                    updateMessageById(msg.id, (m) => ({ ...m, speed: parseFloat(e.target.value) }));
                                  }}
                                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                                  <span>0.5x</span>
                                  <span>2.0x</span>
                                </div>
                              </div>

                              {/* Per-Message Style Overrides */}
                              {(() => {
                                const preset = msg.textStylePreset 
                                  ? textStylePresets.find(p => p.id === msg.textStylePreset)
                                  : null;
                                const styleId = preset?.textStyleId || msg.textStyle;
                                const textStyle = getTextStyle(styleId);
                                
                                if (!textStyle || textStyle.settingsSchema.length === 0) {
                                  return null;
                                }

                                const presetSettings =
                                  (preset?.settings as Record<string, unknown> | undefined) ??
                                  (textStyleSettings[styleId] as Record<string, unknown> | undefined) ??
                                  (getDefaultsFromSchema(textStyle.settingsSchema) as Record<string, unknown>);
                                const overrides = (msg.styleOverrides as Record<string, unknown> | undefined) ?? undefined;
                                const mergedSettings = { ...presetSettings, ...(overrides ?? {}) };
                                const isModified = !!(overrides && Object.keys(overrides).length > 0);

                                return (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                                        Per-message settings
                                      </label>
                                      {isModified && (
                                        <button
                                          onClick={() => {
                                            updateMessageById(msg.id, (m) => ({ ...m, styleOverrides: undefined }));
                                          }}
                                          className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded text-xs font-bold hover:bg-zinc-700 transition-colors"
                                          title="Reset per-message changes (back to preset)"
                                        >
                                          Reset
                                        </button>
                                      )}
                                    </div>
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                                      <SettingsRenderer
                                        schema={textStyle.settingsSchema}
                                        values={mergedSettings}
                                        onChange={(key, value) => {
                                          const nextOverrides = applyStyleOverrideChange(
                                            presetSettings,
                                            (msg.styleOverrides as Record<string, unknown> | undefined) ?? undefined,
                                            key,
                                            value
                                          );
                                          updateMessageById(msg.id, (m) => {
                                            const updates: Partial<MessageConfig> = { styleOverrides: nextOverrides };
                                            // If no preset is selected but we have overrides, auto-select a matching preset
                                            if (!m.textStylePreset && nextOverrides && Object.keys(nextOverrides).length > 0) {
                                              const matchingPreset = textStylePresets.find(p => p.textStyleId === styleId);
                                              if (matchingPreset) {
                                                updates.textStylePreset = matchingPreset.id;
                                              }
                                            }
                                            return { ...m, ...updates };
                                          });
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                      </div>
                    );
                  })}
                </AnimatePresence>
                </LayoutGroup>
                {/* Drop indicator at end (right aligned) */}
                {draggingNodePath && dropVisibleIndex === visibleNodes.length && (
                  <div className="h-2 flex items-center">
                    <div className="ml-auto w-14 h-[2px] bg-orange-500/70 rounded-full" />
              </div>
                )}
              </div>
              
              {/* History Pane */}
              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 border-t border-zinc-800 pt-4 overflow-hidden"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Message History</h3>
                      <button
                        onClick={() => setShowHistory(false)}
                        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Close history"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                      {messages.length === 0 ? (
                        <div className="text-center py-4 text-zinc-500 text-xs">No messages</div>
                      ) : (
                        messages.map((msg) => {
                          const stats = messageStats[msg.id];
                          const history = stats?.history ?? [];
                          
                          return (
                            <div key={msg.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                              <div className="text-sm font-medium text-zinc-300 mb-2">{msg.text}</div>
                              {history.length === 0 ? (
                                <div className="text-xs text-zinc-500">Never triggered</div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="text-xs text-zinc-500 mb-1">
                                    Triggered {stats?.triggerCount ?? 0} time{stats?.triggerCount !== 1 ? 's' : ''}
                                  </div>
                                  <div className="space-y-0.5">
                                    {history.slice().reverse().map((entry, idx) => (
                                      <div key={idx} className="text-xs text-zinc-600 font-mono">
                                        {new Date(entry.timestamp).toLocaleString()}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </aside>

          {/* Remote Info Section - After messages in non-wide layout */}
          <section className="col-span-12 lg:col-span-8 order-3 lg:order-2 relative group">
            <div className="absolute -inset-px bg-gradient-to-r from-orange-500/20 via-zinc-800 to-blue-500/20 rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="relative bg-zinc-950 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-8">
              <div className="bg-white p-3 rounded-xl shadow-2xl shrink-0">
                {remoteUrl ? (
                  <QRCodeSVG value={remoteUrl} size={120} level="H" />
                ) : (
                  <div className="w-28 h-28 bg-zinc-100 animate-pulse rounded-lg" />
                )}
        </div>
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
                  <Smartphone size={18} className="text-orange-500" />
                  <h3 className="text-lg font-bold">Mobile Remote</h3>
      </div>
                <p className="text-zinc-400 mb-4 leading-relaxed text-sm max-w-md">
                  Control from your phone. Scan the QR code to open the remote.
                </p>
                <div className="inline-flex items-center gap-3 bg-black border border-zinc-800 px-4 py-2 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <code className="text-orange-500 font-mono text-xs">{remoteUrl || 'Detecting...'}</code>
    </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
      )}
    </>
  );
};

interface VisualizationCardProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}

const VisualizationCard: React.FC<VisualizationCardProps> = ({ 
  active, onClick, icon, title, description, disabled 
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative p-6 rounded-2xl text-left transition-all duration-300 active:scale-[0.98] group overflow-hidden disabled:opacity-70 ${
        active 
          ? 'bg-gradient-to-br from-orange-600 to-red-600 text-white shadow-2xl shadow-orange-900/30' 
          : 'bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:bg-zinc-800/50 hover:border-zinc-700'
      }`}
    >
      <div className={`relative z-10 mb-4 p-2 w-fit rounded-xl ${active ? 'bg-white/20' : 'bg-zinc-800 group-hover:scale-110 transition-transform'}`}>
        {icon}
      </div>
      <div className="relative z-10">
        <h3 className={`text-xl font-black uppercase tracking-tight mb-1 ${active ? 'text-white' : 'text-zinc-200'}`}>
          {title}
        </h3>
        <p className={`text-xs ${active ? 'text-white/70' : 'text-zinc-500'}`}>
          {description}
        </p>
      </div>
      {active && (
        <motion.div 
          layoutId="viz-active-glow"
          className="absolute inset-0 bg-white/10 mix-blend-overlay" 
        />
      )}
    </button>
  );
};
