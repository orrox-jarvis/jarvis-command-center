'use client';
import { useState, useEffect, useCallback } from 'react';
import { Activity, Cpu, Radio, ShieldCheck, RefreshCw, Mic, Zap, Brain, Settings, RotateCcw, LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

function GpuBar({ used, total, name }: { used: number; total: number; name: string }) {
  const pct = Math.round((used / total) * 100);
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-blue-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span className="truncate max-w-[160px]">{name}</span>
        <span>{used}/{total}MB ({pct}%)</span>
      </div>
      <div className="w-full bg-zinc-800 h-1.5 rounded-full">
        <div className={`${color} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
  );
}

const SERVICE_LABELS: Record<string, string> = {
  'hermes-twilio-voice-gateway.service': 'Voice Gateway',
  'phone-fast-llm.service': 'Fast LLM (Qwen)',
  'qwen3-tts-router.service': 'TTS Router',
  'hindsight-embed.service': 'Memory (Hindsight)',
};

export default function Dashboard() {
  const [hw, setHw] = useState<any>(null);
  const [svcs, setSvcs] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ttsMode, setTtsMode] = useState<'base' | 'custom'>('custom');
  const [llmTier, setLlmTier] = useState<'fast' | 'smart'>('fast');
  const [restarting, setRestarting] = useState<string | null>(null);
  const [envKey, setEnvKey] = useState('');
  const [envVal, setEnvVal] = useState('');
  const [envMsg, setEnvMsg] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const refresh = useCallback(async () => {
    try {
      const [hwData, svcData] = await Promise.all([api.hardware(), api.services()]);
      setHw(hwData);
      setSvcs(svcData);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleTts = async (mode: 'base' | 'custom') => {
    try { await api.ttsMode(mode); setTtsMode(mode); } catch {}
  };
  const handleLlm = async (tier: 'fast' | 'smart') => {
    try { await api.llmTier(tier); setLlmTier(tier); } catch {}
  };
  const handleRestart = async (svc: string) => {
    setRestarting(svc);
    try { await api.restartSvc(svc); setTimeout(refresh, 3000); } finally { setRestarting(null); }
  };
  const handleEnvUpdate = async () => {
    if (!envKey) return;
    try {
      await api.envUpdate(envKey, envVal);
      setEnvMsg(`Set ${envKey} ✓`);
      setTimeout(() => setEnvMsg(''), 3000);
    } catch (e: any) { setEnvMsg(`Error: ${e.message}`); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-black text-zinc-400">
      <Radio className="animate-pulse mr-3 text-red-500" size={24} /> Connecting to Jarvis...
    </div>
  );

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
          <Radio className="text-red-500 animate-pulse" size={28} />
          <div>
            <h1 className="text-2xl font-bold tracking-tighter">JARVIS COMMAND CENTER</h1>
            <p className="text-xs text-zinc-500 mt-0.5">dataintellagents.com</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSignOut} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <button onClick={refresh} className="p-2 rounded-full hover:bg-zinc-900 transition-colors text-zinc-400 hover:text-white">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-xl text-red-400 text-sm">
          Bridge unreachable: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

        {/* Hardware */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 col-span-1 xl:col-span-2">
          <div className="flex items-center gap-2 mb-5 text-zinc-400">
            <Cpu size={16} />
            <span className="text-xs font-semibold uppercase tracking-widest">Hardware</span>
          </div>
          {hw ? (
            <div className="space-y-4">
              {hw.gpus?.map((g: any, i: number) => (
                <GpuBar key={i} name={`GPU${i}: ${g.name}`} used={g.used_mb} total={g.total_mb} />
              ))}
              <div className="pt-3 border-t border-zinc-800 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-zinc-500">CPU</p>
                  <p className="text-lg font-bold">{hw.cpu_usage_percent}%</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">RAM Used</p>
                  <p className="text-lg font-bold">{hw.ram?.used_gb}GB</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">RAM Free</p>
                  <p className="text-lg font-bold">{hw.ram?.free_gb}GB</p>
                </div>
              </div>
            </div>
          ) : <p className="text-zinc-600 text-sm">No hardware data</p>}
        </div>

        {/* Services */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5 text-zinc-400">
            <ShieldCheck size={16} />
            <span className="text-xs font-semibold uppercase tracking-widest">Services</span>
          </div>
          <div className="space-y-3">
            {svcs?.services?.map((s: any) => (
              <div key={s.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot active={s.active} />
                  <span className="text-sm">{SERVICE_LABELS[s.name] ?? s.name.replace('.service','')}</span>
                </div>
                <button
                  onClick={() => handleRestart(s.name)}
                  disabled={restarting === s.name}
                  className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                  title="Restart"
                >
                  <RotateCcw size={13} className={restarting === s.name ? 'animate-spin' : ''} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Intelligence Tier */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5 text-zinc-400">
            <Brain size={16} />
            <span className="text-xs font-semibold uppercase tracking-widest">Intelligence Tier</span>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => handleLlm('fast')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${llmTier === 'fast' ? 'border-green-700 bg-green-900/20 text-green-400' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'}`}
            >
              <div className="flex items-center gap-2"><Zap size={14}/> Fast (Qwen2.5-3B)</div>
              {llmTier === 'fast' && <StatusDot active />}
            </button>
            <button
              onClick={() => handleLlm('smart')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${llmTier === 'smart' ? 'border-blue-700 bg-blue-900/20 text-blue-400' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'}`}
            >
              <div className="flex items-center gap-2"><Brain size={14}/> Smart (Gemma 4 26B)</div>
              {llmTier === 'smart' && <StatusDot active />}
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-3">Voice calls auto-escalate based on complexity.</p>
        </div>

        {/* Voice Studio / TTS */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5 text-zinc-400">
            <Mic size={16} />
            <span className="text-xs font-semibold uppercase tracking-widest">Voice Studio</span>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => handleTts('base')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${ttsMode === 'base' ? 'border-purple-700 bg-purple-900/20 text-purple-400' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'}`}
            >
              <span>Base Voice (0.6B — Fast)</span>
              {ttsMode === 'base' && <StatusDot active />}
            </button>
            <button
              onClick={() => handleTts('custom')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${ttsMode === 'custom' ? 'border-purple-700 bg-purple-900/20 text-purple-400' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'}`}
            >
              <span>Custom Voice (1.7B — Ryan)</span>
              {ttsMode === 'custom' && <StatusDot active />}
            </button>
          </div>
          <div className="mt-4 text-xs text-zinc-500 space-y-1">
            <p>Base: port 9100 · Custom: port 9101 · Router: 9110</p>
          </div>
        </div>

        {/* Config Editor */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-5 text-zinc-400">
            <Settings size={16} />
            <span className="text-xs font-semibold uppercase tracking-widest">Live Config</span>
          </div>
          <div className="space-y-3">
            <input
              value={envKey}
              onChange={e => setEnvKey(e.target.value)}
              placeholder="ENV_KEY (e.g. VOICE_SMART_LLM_MAX_TOKENS)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <input
              value={envVal}
              onChange={e => setEnvVal(e.target.value)}
              placeholder="value"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={handleEnvUpdate}
              className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-semibold transition-colors"
            >
              Apply
            </button>
            {envMsg && <p className="text-xs text-green-400">{envMsg}</p>}
          </div>
          <p className="text-xs text-zinc-600 mt-3">Changes write to .hermes/.env and restart gateway.</p>
        </div>

      </div>

      {/* Voice Studio Link */}
      <div className="mt-6">
        <a
          href="/studio"
          className="flex items-center gap-3 p-5 bg-zinc-900 border border-purple-900/50 hover:border-purple-700 rounded-2xl transition-all group"
        >
          <div className="p-2 bg-purple-900/30 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-purple-300">Voice Studio</p>
            <p className="text-xs text-zinc-500 mt-0.5">Design, clone &amp; apply custom voices to Jarvis — phone &amp; voice calls</p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-zinc-600 group-hover:text-zinc-400 transition-colors"><path d="m9 18 6-6-6-6"/></svg>
        </a>
      </div>

      <p className="text-center text-xs text-zinc-700 mt-8">
        Jarvis Command Center · {new Date().toLocaleString()}
      </p>
    </main>
  );
}
