import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './styles.css';

// ── SpearCode theme (matches the slate/red app icon) ──────────────────────
const term = new Terminal({
  fontFamily: '"JetBrains Mono", "Fira Code", "DejaVu Sans Mono", "Cascadia Mono", monospace',
  fontSize: 14,
  lineHeight: 1.15,
  cursorBlink: true,
  cursorStyle: 'bar',
  allowProposedApi: true,
  macOptionIsMeta: true,
  scrollback: 5000,
  theme: {
    background: '#0f1623',
    foreground: '#e5e7eb',
    cursor: '#dc2626',
    cursorAccent: '#0f1623',
    selectionBackground: 'rgba(220,38,38,0.35)',
    black: '#1f2937',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    blue: '#3b82f6',
    magenta: '#a855f7',
    cyan: '#06b6d4',
    white: '#e5e7eb',
    brightBlack: '#4b5563',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: '#60a5fa',
    brightMagenta: '#c084fc',
    brightCyan: '#22d3ee',
    brightWhite: '#f9fafb',
  },
});

const fit = new FitAddon();
term.loadAddon(fit);
term.loadAddon(new WebLinksAddon());

const el = document.getElementById('term')!;
const overlay = document.getElementById('overlay')!;
const overlayMsg = document.getElementById('overlay-msg')!;
term.open(el);
fit.fit();

let exited = false;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// PTY → terminal
await listen<string>('pty-output', (e) => term.write(b64ToBytes(e.payload)));

await listen<number | null>('pty-exit', (e) => {
  exited = true;
  const code = e.payload;
  overlayMsg.textContent =
    code && code !== 0
      ? `SpearCode s'est arrêté (code ${code}).`
      : 'Session SpearCode terminée.';
  overlay.hidden = false;
  const close = () => getCurrentWindow().close();
  window.addEventListener('keydown', close, { once: true });
  overlay.addEventListener('click', close, { once: true });
});

// terminal → PTY
term.onData((d) => {
  if (!exited) invoke('pty_write', { data: d });
});

// Clipboard: Ctrl/Cmd+Shift+C copy, Ctrl/Cmd+Shift+V paste
term.attachCustomKeyEventHandler((ev) => {
  const mod = ev.ctrlKey || ev.metaKey;
  if (ev.type === 'keydown' && mod && ev.shiftKey && ev.code === 'KeyC') {
    const sel = term.getSelection();
    if (sel) navigator.clipboard.writeText(sel);
    return false;
  }
  if (ev.type === 'keydown' && mod && ev.shiftKey && ev.code === 'KeyV') {
    navigator.clipboard.readText().then((t) => {
      if (t && !exited) invoke('pty_write', { data: t });
    });
    return false;
  }
  return true;
});

// Keep PTY size in sync with the window
let resizeTimer: number | undefined;
const syncSize = () => {
  fit.fit();
  if (!exited) invoke('pty_resize', { cols: term.cols, rows: term.rows });
};
const ro = new ResizeObserver(() => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(syncSize, 60);
});
ro.observe(el);

// Boot the SpearCode process in its PTY
try {
  await invoke('pty_start', { cols: term.cols, rows: term.rows });
} catch (err) {
  term.write(`\r\n\x1b[31mImpossible de démarrer SpearCode : ${String(err)}\x1b[0m\r\n`);
}

term.focus();
