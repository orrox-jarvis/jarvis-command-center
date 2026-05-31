'use client';

import { useState, useEffect, useCallback } from 'react';

const BRIDGE = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://cmd.dataintellagents.com';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Gpu0Service {
  label: string;
  port: number;
  description: string;
  systemd: 'active' | 'inactive' | 'failed' | string;
  responding: boolean;
  model_loaded: string | null;
}

type Gpu0Status = Record<string, Gpu0Service>;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('gateway_token') ?? '';
  const res = await fetch(`${BRIDGE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(err || res.statusText);
  }
  return res.json();
}

// ── Service metadata ──────────────────────────────────────────────────────────

const SERVICE_META: Record<string, {
  color: string;
  icon: string;
  role: string;
  params?: Record<string, string>;
  alwaysOn?: boolean;
}> = {
  'phone-fast-llm.service': {
    color: 'emerald',
    icon: '⚡',
    role: 'Fast LLM',
    params: { model: 'Qwen2.5-3B Q4_K_M', ctx: '32,768 tokens', vram: '~4 GB GPU0', temp: '0.7' },
    alwaysOn: true,
  },
  'qwen3-tts-router.service': {
    color: 'sky',
    icon: '🔀',
    role: 'TTS Router',
    params: { primary: ':9101 (CustomVoice)', fallback: ':9100 (Base)', timeout: '120 s' },
    alwaysOn: true,
  },
  'qwen3-tts-0.6b-base.service': {
    color: 'violet',
    icon: '🎙️',
    role: 'TTS Base',
    params: { model: 'Qwen3-TTS-0.6B', vram: '~2 GB GPU0', mode: 'Voice clone fallback' },
  },
  'qwen3-tts-1.7b-customvoice.service': {
    color: 'fuchsia',
    icon: '🎤',
    role: 'TTS Primary',
    params: { model: 'Qwen3-TTS-1.7B', speaker: 'Ryan', vram: '~4 GB GPU0', mode: 'Primary voice' },
    alwaysOn: true,
  },
  'jarvis-voice-studio.service': {
    color: 'amber',
    icon: '🎨',
    role: 'Voice Studio',
    params: { model: 'Qwen3-TTS-1.7B VoiceDesign', vram: '~4 GB GPU0', endpoint: 'studio.dataintellagents.com' },
  },
};

const SERVICE_ORDER = [
  'phone-fast-llm.service',
  'qwen3-tts-router.service',
  'qwen3-tts-1.7b-customvoice.service',
  'qwen3-tts-0.6b-base.service',
  'jarvis-voice-studio.service',
];

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ systemd, responding }: { systemd: string; responding: boolean }) {
  const ok = systemd === 'active' && responding;
  const partial = systemd === 'active' && !responding;
  const failed = systemd === 'failed';

  const cls = ok
    ? 'bg-green-900/50 text-green-300 border-green-700'
    : partial
    ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700'
    : failed
    ? 'bg-red-900/50 text-red-300 border-red-700'
    : 'bg-zinc-800 text-zinc-400 border-zinc-700';

  const dot = ok ? 'bg-green-400' : partial ? 'bg-yellow-400' : failed ? 'bg-red-400' : 'bg-zinc-500';
  const label = ok ? 'Online' : partial ? 'Starting…' : failed ? 'Failed' : systemd;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${ok || partial ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

// ── Service card ──────────────────────────────────────────────────────────────

function ServiceCard({
  svcKey,
  data,
  meta,
  onRestart,
  onStop,
  onViewLogs,
  busy,
}: {
  svcKey: string;
  data: Gpu0Service;
  meta: (typeof SERVICE_META)[string];
  onRestart: (svc: string) => void;
  onStop: (svc: string) => void;
  onViewLogs: (svc: string) => void;
  busy: string | null;
}) {
  const isBusy = busy === svcKey;
  const accentMap: Record<string, string> = {
    emerald: 'border-emerald-500',
    sky: 'border-sky-500',
    violet: 'border-violet-500',
    fuchsia: 'border-fuchsia-500',
    amber: 'border-amber-500',
  };
  const btnMap: Record<string, string> = {
    emerald: 'bg-emerald-700/30 hover:bg-emerald-700/50 text-emerald-300 border-emerald-700',
    sky: 'bg-sky-700/30 hover:bg-sky-700/50 text-sky-300 border-sky-700',
    violet: 'bg-violet-700/30 hover:bg-violet-700/50 text-violet-300 border-violet-700',
    fuchsia: 'bg-fuchsia-700/30 hover:bg-fuchsia-700/50 text-fuchsia-300 border-fuchsia-700',
    amber: 'bg-amber-700/30 hover:bg-amber-700/50 text-amber-300 border-amber-700',
  };
  const accentBorder = data.systemd === 'active' ? accentMap[meta.color] : 'border-zinc-700';

  return (
    <div className={`rounded-xl border-2 ${accentBorder} bg-zinc-900 p-5 flex flex-col gap-4 transition-all duration-200`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">{data.label}</h3>
              {meta.alwaysOn && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">always-on</span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">{data.description}</p>
          </div>
        </div>
        <StatusBadge systemd={data.systemd} responding={data.responding} />
      </div>

      {/* Params */}
      {meta.params && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Object.entries(meta.params).map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">{k}</span>
              <span className="text-xs text-zinc-300 font-mono">{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Port + model */}
      <div className="flex items-center gap-3 text-xs text-zinc-500 border-t border-zinc-800 pt-3">
        <span>Port <span className="text-zinc-300 font-mono">{data.port}</span></span>
        {data.model_loaded && (
          <span className="truncate max-w-[200px] text-zinc-400" title={data.model_loaded}>
            Model: <span className="text-zinc-300">{data.model_loaded}</span>
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onRestart(svcKey)}
          disabled={isBusy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
            ${btnMap[meta.color]} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isBusy ? '⏳' : '🔄'} Restart
        </button>
        <button
          onClick={() => onStop(svcKey)}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border
            bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-400 border-zinc-700
            disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          ⏹ Stop
        </button>
        <button
          onClick={() => onViewLogs(svcKey)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border
            bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-400 border-zinc-700 transition-all"
        >
          📋 Logs
        </button>
      </div>
    </div>
  );
}

// ── Log drawer ────────────────────────────────────────────────────────────────

function LogDrawer({ svcKey, onClose }: { svcKey: string; onClose: () => void }) {
  const [logs, setLogs] = useState<string>('Loading…');

  useEffect(() => {
    apiFetch(`/status/gpu0_logs?service=${encodeURIComponent(svcKey)}&lines=60`)
      .then((d) => setLogs(d.logs || '(no logs)'))
      .catch((e) => setLogs(`Error: ${e.message}`));
  }, [svcKey]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl bg-zinc-950 rounded-xl border border-zinc-700 flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-sm font-medium text-zinc-200">
            📋 Logs — {SERVICE_META[svcKey]?.role ?? svcKey}
          </span>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded bg-zinc-800">
            ✕ Close
          </button>
        </div>
        <pre className="overflow-auto p-4 text-[11px] font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {logs}
        </pre>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Gpu0Page() {
  const [status, setStatus] = useState<Gpu0Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [logSvc, setLogSvc] = useState<string | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const refresh = useCallback(async (quiet = false) => {
    try {
      const data = await apiFetch('/status/gpu0');
      setStatus(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => refresh(true), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleRestart = async (svc: string) => {
    setBusy(svc);
    try {
      await apiFetch('/control/gpu0_restart', {
        method: 'POST',
        body: JSON.stringify({ service: svc }),
      });
      showToast(`Restarting ${status?.[svc]?.label ?? svc}…`);
      setTimeout(() => refresh(true), 3000);
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setBusy(null);
    }
  };

  const handleStop = async (svc: string) => {
    if (!confirm(`Stop ${status?.[svc]?.label ?? svc}? (no auto-restart)`)) return;
    setBusy(svc);
    try {
      await apiFetch('/control/gpu0_stop', {
        method: 'POST',
        body: JSON.stringify({ service: svc }),
      });
      showToast(`Stopped ${status?.[svc]?.label ?? svc}.`);
      setTimeout(() => refresh(true), 2000);
    } catch (e: any) {
      showToast(e.message, false);
    } finally {
      setBusy(null);
    }
  };

  // Summary counts
  const onlineCount = status
    ? Object.values(status).filter((s) => s.systemd === 'active' && s.responding).length
    : 0;
  const totalCount = SERVICE_ORDER.length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-sm font-medium border shadow-lg
            ${toast.ok
              ? 'bg-green-900/80 text-green-200 border-green-700'
              : 'bg-red-900/80 text-red-200 border-red-700'
            }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Log drawer */}
      {logSvc && <LogDrawer svcKey={logSvc} onClose={() => setLogSvc(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🎛️ GPU0 Services
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Fast LLM · TTS Router · Voice models — all on GPU0 (RTX 3090)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <span className={`text-sm font-medium px-3 py-1 rounded-full border
              ${onlineCount === totalCount
                ? 'bg-green-900/40 text-green-300 border-green-700'
                : onlineCount === 0
                ? 'bg-red-900/40 text-red-300 border-red-700'
                : 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
              }`}>
              {onlineCount}/{totalCount} online
            </span>
          )}
          <button
            onClick={() => refresh()}
            className="px-4 py-1.5 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300"
          >
            ↻ Refresh
          </button>
          <a
            href="/"
            className="px-4 py-1.5 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400"
          >
            ← Dashboard
          </a>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-zinc-500 text-sm animate-pulse">Fetching GPU0 status…</div>
      )}

      {/* Cards grid */}
      {status && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {SERVICE_ORDER.map((svcKey) => {
            const data = status[svcKey];
            const meta = SERVICE_META[svcKey];
            if (!data || !meta) return null;
            return (
              <ServiceCard
                key={svcKey}
                svcKey={svcKey}
                data={data}
                meta={meta}
                onRestart={handleRestart}
                onStop={handleStop}
                onViewLogs={setLogSvc}
                busy={busy}
              />
            );
          })}
        </div>
      )}

      {/* Info footer */}
      <div className="mt-10 p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
        <p className="mb-1 font-medium text-zinc-400">GPU0 Pipeline</p>
        <p>Twilio call → TTS Router (:9110) → CustomVoice (:9101, primary) or Base (:9100, fallback)</p>
        <p className="mt-1">Fast LLM (:8082) handles all first-line Twilio phone turns. GPU1 (:8081) handles complex escalations.</p>
        <p className="mt-1">Voice Studio (:9102) is for design/cloning only — not in the live call path.</p>
      </div>
    </div>
  );
}
