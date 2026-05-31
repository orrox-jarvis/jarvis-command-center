'use client';

import { useState, useEffect, useCallback } from 'react';

const BRIDGE = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://cmd.dataintellagents.com';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Gpu1Status {
  active_model: 'gemma' | 'qwen';
  service_status: string;
  model_loaded: string | null;
  responding: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BRIDGE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json();
}

// ── Model info ────────────────────────────────────────────────────────────────

const MODEL_INFO = {
  gemma: {
    name: 'Gemma 4 26B',
    subtitle: 'A4B Instruction — "The Librarian"',
    ctx: '262,144 tokens (256k)',
    vram: '~22 GB on GPU1',
    best_for: ['Long-context tasks', 'Document analysis', 'Complex reasoning', 'Extended conversation'],
    temp: '1.0',
    quant: 'UD-Q4_K_M',
    color: 'blue',
    alias: 'gemma-4-26b-smart',
  },
  qwen: {
    name: 'Qwen 3.6 27B MTP',
    subtitle: 'Multi-Token Prediction — "The Builder"',
    ctx: '98,304 tokens (96k)',
    vram: '~17 GB on GPU1',
    best_for: ['Coding & tool use', 'Structured output', 'Fast inference (MTP)', 'Agent tasks'],
    temp: '0.6',
    quant: 'Q4_K_S',
    color: 'purple',
    alias: 'qwen3.6-27b-smart',
  },
};

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium
      ${ok ? 'bg-green-900/50 text-green-300 border border-green-700' : 'bg-red-900/50 text-red-300 border border-red-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
      {label}
    </span>
  );
}

// ── Model card ────────────────────────────────────────────────────────────────

function ModelCard({
  id,
  info,
  isActive,
  isLoaded,
  onSwap,
  swapping,
}: {
  id: 'gemma' | 'qwen';
  info: typeof MODEL_INFO['gemma'];
  isActive: boolean;
  isLoaded: boolean;
  onSwap: (m: 'gemma' | 'qwen') => void;
  swapping: boolean;
}) {
  const accent = id === 'gemma' ? 'blue' : 'purple';
  const border = isActive
    ? `border-${accent}-500`
    : 'border-gray-700 hover:border-gray-500';

  return (
    <div className={`relative rounded-xl border-2 ${border} bg-gray-900 p-6 transition-all duration-200`}>
      {isActive && (
        <div className={`absolute top-3 right-3`}>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
            bg-${accent}-900/60 text-${accent}-300 border border-${accent}-700`}>
            SELECTED
          </span>
        </div>
      )}

      <h3 className="text-lg font-bold text-white mb-0.5">{info.name}</h3>
      <p className="text-gray-400 text-sm mb-4">{info.subtitle}</p>

      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-0.5">Context Window</div>
          <div className="text-white font-medium">{info.ctx}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-0.5">VRAM Usage</div>
          <div className="text-white font-medium">{info.vram}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-0.5">Temperature</div>
          <div className="text-white font-medium">{info.temp}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-gray-400 text-xs mb-0.5">Quantization</div>
          <div className="text-white font-medium">{info.quant}</div>
        </div>
      </div>

      <div className="mb-5">
        <div className="text-gray-400 text-xs uppercase tracking-wide mb-2">Best for</div>
        <div className="flex flex-wrap gap-1.5">
          {info.best_for.map(tag => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {isActive && isLoaded && (
        <div className="mb-4 flex items-center gap-2 text-sm text-green-400">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Loaded and responding on port 8081
        </div>
      )}

      {isActive && !isLoaded && (
        <div className="mb-4 flex items-center gap-2 text-sm text-yellow-400">
          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          Selected — loading or not yet responding
        </div>
      )}

      {!isActive && (
        <button
          onClick={() => onSwap(id)}
          disabled={swapping}
          className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all
            ${swapping
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : `bg-${accent}-600 hover:bg-${accent}-500 text-white cursor-pointer`
            }`}
        >
          {swapping ? 'Swapping…' : `Switch to ${info.name}`}
        </button>
      )}
    </div>
  );
}

// ── Log viewer ────────────────────────────────────────────────────────────────

function LogViewer() {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/status/gpu1_logs?lines=60');
      setLogs(data.logs || '(no logs)');
    } catch (e: unknown) {
      setLogs(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold">Service Logs</h3>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-white px-3 py-1 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>
      <pre className="text-xs text-gray-300 font-mono bg-black/40 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
        {logs || 'Loading…'}
      </pre>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const [status, setStatus] = useState<Gpu1Status | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiFetch('/status/gpu1_model');
      setStatus(data);
    } catch (e: unknown) {
      console.error('Status fetch failed', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 8000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const handleSwap = async (model: 'gemma' | 'qwen') => {
    setSwapping(true);
    try {
      const res = await apiFetch('/control/gpu1_model', {
        method: 'POST',
        body: JSON.stringify({ model }),
      });
      if (res.status === 'no_change') {
        showToast('Model is already active', true);
      } else {
        showToast(`Switching to ${MODEL_INFO[model].name} — takes ~30s to load`, true);
      }
      await fetchStatus();
    } catch (e: unknown) {
      showToast(`Swap failed: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setSwapping(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await apiFetch('/control/gpu1_restart', { method: 'POST' });
      showToast('Service restarted — model loading now', true);
      setTimeout(fetchStatus, 5000);
    } catch (e: unknown) {
      showToast(`Restart failed: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setRestarting(false);
    }
  };

  const activeModel = status?.active_model ?? 'gemma';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.ok ? 'bg-green-900 border border-green-600 text-green-200' : 'bg-red-900 border border-red-600 text-red-200'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-white">GPU1 Smart Model</h1>
            <p className="text-gray-400 text-sm mt-0.5">Hot-swap between Gemma and Qwen on GPU1 · Port 8081</p>
          </div>
          <a href="/" className="text-gray-400 hover:text-white text-sm">← Dashboard</a>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-3 mb-8 mt-4 p-3 bg-gray-900 rounded-xl border border-gray-800 flex-wrap">
          <StatusBadge
            ok={status?.service_status === 'active'}
            label={`Service: ${status?.service_status ?? '…'}`}
          />
          <StatusBadge
            ok={status?.responding ?? false}
            label={status?.responding ? `Responding (${status?.model_loaded ?? '…'})` : 'Not responding'}
          />
          <span className="text-gray-500 text-xs">Auto-refreshes every 8s</span>
          <button
            onClick={fetchStatus}
            className="ml-auto text-xs text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
          >
            ↻
          </button>
        </div>

        {/* How it works */}
        <div className="mb-8 p-4 bg-blue-950/30 border border-blue-800/40 rounded-xl text-sm text-blue-200">
          <div className="font-semibold text-blue-300 mb-1">How this works</div>
          GPU1 runs one smart model at a time on port 8081. The active model is stored in{' '}
          <code className="bg-black/30 px-1 rounded">~/.hermes/gpu1_model</code>.
          Switching writes the new selection and kills the current process — systemd
          restarts it automatically with the new model (~30s load time).
          If the model crashes due to an OOM or other error, systemd will restart it automatically.
          Use the <span className="font-medium">Force Restart</span> button below to manually recover after a crash.
        </div>

        {/* Model cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {(['gemma', 'qwen'] as const).map(id => (
            <ModelCard
              key={id}
              id={id}
              info={MODEL_INFO[id]}
              isActive={activeModel === id}
              isLoaded={status?.responding ?? false}
              onSwap={handleSwap}
              swapping={swapping}
            />
          ))}
        </div>

        {/* Crash recovery */}
        <div className="mb-8 p-5 bg-gray-900 border border-gray-700 rounded-xl">
          <h3 className="text-white font-semibold mb-1">Crash Recovery</h3>
          <p className="text-gray-400 text-sm mb-4">
            If the model crashes and systemd has stopped retrying (5 crashes in 3 minutes),
            or if a zombie process is holding port 8081, use this to force a clean restart.
            This kills any process on port 8081, clears the lock, and starts fresh.
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleRestart}
              disabled={restarting}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all
                ${restarting
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-orange-700 hover:bg-orange-600 text-white cursor-pointer'
                }`}
            >
              {restarting ? 'Restarting…' : '⚡ Force Restart GPU1 Model'}
            </button>
            <div className="text-xs text-gray-500">
              Current model after restart:{' '}
              <span className="text-gray-300 font-medium">
                {MODEL_INFO[activeModel]?.name ?? activeModel}
              </span>
            </div>
          </div>
        </div>

        {/* Context window guidance */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-blue-950/20 border border-blue-900/40 rounded-xl">
            <div className="font-semibold text-blue-300 mb-2">When to use Gemma</div>
            <ul className="text-blue-200/80 space-y-1 text-xs">
              <li>• You&apos;re working with a very long document or codebase</li>
              <li>• The conversation has been going on for a while (256k ctx)</li>
              <li>• You need general reasoning or chat</li>
              <li>• Twilio smart-tier phone calls (default)</li>
            </ul>
          </div>
          <div className="p-4 bg-purple-950/20 border border-purple-900/40 rounded-xl">
            <div className="font-semibold text-purple-300 mb-2">When to use Qwen</div>
            <ul className="text-purple-200/80 space-y-1 text-xs">
              <li>• Coding tasks, OpenCode sessions</li>
              <li>• Structured / JSON output required</li>
              <li>• You want faster token generation (MTP)</li>
              <li>• Agent / tool-call intensive tasks</li>
            </ul>
          </div>
        </div>

        {/* Logs */}
        <div>
          <button
            onClick={() => setShowLogs(v => !v)}
            className="text-sm text-gray-400 hover:text-white mb-3 flex items-center gap-2"
          >
            <span>{showLogs ? '▾' : '▸'}</span> Service Logs
          </button>
          {showLogs && <LogViewer />}
        </div>
      </div>
    </div>
  );
}
