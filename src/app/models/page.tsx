'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const BRIDGE = '/api/bridge';

// ── Types ─────────────────────────────────────────────────────────────────────

type ModelId = 'qwen-dense' | 'qwen-moe' | 'gemma-dense' | 'gemma-moe';

interface Gpu1Status {
  active_model: ModelId;
  service_status: string;
  model_loaded: string | null;
  responding: boolean;
  switch_status?: { phase: string; message: string; desired: ModelId } | null;
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

const MODEL_INFO: Record<ModelId, {
  name: string; subtitle: string; ctx: string; vram: string; best_for: string[];
  temp: string; quant: string; alias: string; accent: 'purple' | 'cyan' | 'blue' | 'emerald';
}> = {
  'qwen-dense': {
    name: 'Qwen 3.6 27B Dense',
    subtitle: 'Dense — coding and agent work',
    ctx: '98,304 tokens (96k)',
    vram: '~22–23 GB on GPU1',
    best_for: ['Coding & tool use', 'Structured output', 'Agent tasks', 'General work'],
    temp: '0.6', quant: 'Q4_K_M', alias: 'qwen3.6-27b-dense', accent: 'purple',
  },
  'qwen-moe': {
    name: 'Qwen 3.6 35B-A3B MoE',
    subtitle: 'Mixture of Experts — fast active path',
    ctx: '32,768 tokens (32k)',
    vram: '~23 GB on GPU1',
    best_for: ['Fast reasoning', 'Agent work', 'Coding', 'High throughput'],
    temp: '0.6', quant: 'UD-Q4_K_S', alias: 'qwen3.6-35b-a3b-moe', accent: 'cyan',
  },
  'gemma-dense': {
    name: 'Gemma 4 31B Dense',
    subtitle: 'Dense — review and document analysis',
    ctx: '32,768 tokens (32k)',
    vram: '~22–23 GB on GPU1',
    best_for: ['Dense-model review', 'Documents', 'General reasoning', 'Comparison runs'],
    temp: '1.0', quant: 'Q4_K_M', alias: 'gemma-4-31b-dense', accent: 'blue',
  },
  'gemma-moe': {
    name: 'Gemma 4 26B-A4B MoE',
    subtitle: 'Mixture of Experts — long-context Librarian',
    ctx: '262,144 tokens (256k)',
    vram: '~22 GB on GPU1',
    best_for: ['Long-context tasks', 'Document analysis', 'Complex reasoning', 'Extended conversation'],
    temp: '1.0', quant: 'UD-Q4_K_M', alias: 'gemma-4-26b-a4b-moe', accent: 'emerald',
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
  id: ModelId;
  info: typeof MODEL_INFO[ModelId];
  isActive: boolean;
  isLoaded: boolean;
  onSwap: (m: ModelId) => void;
  swapping: boolean;
}) {
  const styles = {
    purple: { border: 'border-purple-500', badge: 'bg-purple-900/60 text-purple-300 border-purple-700', button: 'bg-purple-600 hover:bg-purple-500' },
    cyan: { border: 'border-cyan-500', badge: 'bg-cyan-900/60 text-cyan-300 border-cyan-700', button: 'bg-cyan-600 hover:bg-cyan-500' },
    blue: { border: 'border-blue-500', badge: 'bg-blue-900/60 text-blue-300 border-blue-700', button: 'bg-blue-600 hover:bg-blue-500' },
    emerald: { border: 'border-emerald-500', badge: 'bg-emerald-900/60 text-emerald-300 border-emerald-700', button: 'bg-emerald-600 hover:bg-emerald-500' },
  }[info.accent];
  const border = isActive ? styles.border : 'border-gray-700 hover:border-gray-500';

  return (
    <div className={`relative rounded-xl border-2 ${border} bg-gray-900 p-6 transition-all duration-200`}>
      {isActive && (
        <div className={`absolute top-3 right-3`}>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${styles.badge}`}>
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
              : `${styles.button} text-white cursor-pointer`
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

  useEffect(() => {
    const initial = setTimeout(() => { void fetchLogs(); }, 0);
    return () => clearTimeout(initial);
  }, [fetchLogs]);

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
  const [stopping, setStopping] = useState(false);
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
    const initial = setTimeout(() => { void fetchStatus(); }, 0);
    const t = setInterval(fetchStatus, 8000);
    return () => { clearTimeout(initial); clearInterval(t); };
  }, [fetchStatus]);

  const handleSwap = async (model: ModelId) => {
    setSwapping(true);
    try {
      const res = await apiFetch('/control/gpu1_model', {
        method: 'POST',
        body: JSON.stringify({ model }),
      });
      if (res.status === 'no_change') {
        showToast('Model is already active', true);
      } else {
        showToast(`Transactional switch to ${MODEL_INFO[model].name} started`, true);
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

  const handleStop = async () => {
    setStopping(true);
    try {
      await apiFetch('/control/gpu1_stop', { method: 'POST' });
      showToast('Service stopped cleanly — no auto-restart (use Simulate Crash to test that)', true);
      setTimeout(fetchStatus, 3000);
    } catch (e: unknown) {
      showToast(`Stop failed: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setStopping(false);
    }
  };


  const activeModel: ModelId = status?.active_model ?? 'gemma-moe';
  const transitionActive = ['draining', 'unloading', 'switching', 'loading', 'rollback']
    .includes(status?.switch_status?.phase ?? '');

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
            <h1 className="text-2xl font-bold text-white">Four-Model GPU1 Fleet</h1>
            <p className="text-gray-400 text-sm mt-0.5">Qwen Dense · Qwen MoE · Gemma Dense · Gemma MoE · Port 8081</p>
          </div>
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
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
          {status?.switch_status && (
            <span className="text-cyan-300 text-xs">
              {status.switch_status.phase}: {status.switch_status.message}
            </span>
          )}
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
          GPU1 runs exactly one qualified general LLM at a time on port 8081. The active profile is stored in{' '}
          <code className="bg-black/30 px-1 rounded">~/.hermes/gpu1_model</code>.
          A switch locks the lane, drains active requests, unloads the current model, verifies VRAM release,
          loads the selected immutable GGUF, checks its alias, and runs a real inference smoke test.
          If any stage fails, the previous profile is restored automatically. GPU0 voice services remain resident.
        </div>

        {/* Model cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {(Object.keys(MODEL_INFO) as ModelId[]).map(id => (
            <ModelCard
              key={id}
              id={id}
              info={MODEL_INFO[id]}
              isActive={activeModel === id}
              isLoaded={status?.responding ?? false}
              onSwap={handleSwap}
              swapping={swapping || transitionActive}
            />
          ))}
        </div>

        {/* Crash recovery */}
        <div className="mb-8 p-5 bg-gray-900 border border-gray-700 rounded-xl">
          <h3 className="text-white font-semibold mb-1">Managed Service Control</h3>
          <p className="text-gray-400 text-sm mb-4">
            <strong className="text-gray-300">Stop</strong> does a clean systemd stop (no auto-restart).{' '}
            <strong className="text-gray-300">Restart</strong> restarts only the systemd-managed process.
            Neither action kills unrelated processes bound to protected ports.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleStop}
              disabled={stopping || restarting || transitionActive}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all
                ${stopping
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-700 hover:bg-gray-600 text-white cursor-pointer'
                }`}
            >
              {stopping ? 'Stopping…' : '⏹ Stop'}
            </button>
            <button
              onClick={handleRestart}
              disabled={restarting || stopping || transitionActive}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all
                ${restarting
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-orange-700 hover:bg-orange-600 text-white cursor-pointer'
                }`}
            >
              {restarting ? 'Restarting…' : '↻ Restart'}
            </button>
            <div className="text-xs text-gray-500">
              Model after restart:{' '}
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
