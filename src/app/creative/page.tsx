'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Film, Image as ImageIcon, Mic, RefreshCw, Sparkles } from 'lucide-react';
import Link from 'next/link';

const API = '/api/bridge';

type Transition = { phase?: string; message?: string; desired?: string; updated_at?: string };
type Output = { filename: string; subfolder: string; kind: string; size_bytes?: number };
type Profile = { id: string; display_name: string; role: string; license: string; status: string };
type Status = {
  mode: 'voice' | 'creative';
  transition: Transition;
  comfyui: { active: boolean; responding: boolean; url: string; queue?: { queue_running: unknown[]; queue_pending: unknown[] } };
  voice_ready: boolean;
  profiles: Profile[];
  outputs: Output[];
};
type Job = { status: string; prompt_id: string; outputs?: Output[]; detail?: string };

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({ detail: response.statusText }));
  if (!response.ok) throw new Error(payload.detail || response.statusText);
  return payload;
}

function outputUrl(output: Output) {
  const query = new URLSearchParams({ filename: output.filename, subfolder: output.subfolder || '' });
  return `${API}/creative/view?${query}`;
}

export default function CreativeStudio() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);
  const [kind, setKind] = useState<'image' | 'edit' | 'video'>('image');
  const [prompt, setPrompt] = useState('A cinematic portrait of a friendly silver robot assistant in a warm British study, natural window light, highly detailed');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [frames, setFrames] = useState(49);
  const [steps, setSteps] = useState(20);
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await request('/status/creative');
      setStatus(next);
      setError('');
      if (next.transition?.phase && !['draining', 'unloading', 'loading', 'rollback'].includes(next.transition.phase)) {
        setSwitching(false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => { void refresh(); }, 0);
    const timer = setInterval(refresh, 3000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!job?.prompt_id || ['completed', 'failed'].includes(job.status)) return;
    const timer = setInterval(async () => {
      try {
        const next = await request(`/creative/jobs/${job.prompt_id}`);
        setJob(next);
        if (next.status === 'completed') refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [job?.prompt_id, job?.status, refresh]);

  async function switchMode(mode: 'voice' | 'creative') {
    setSwitching(true);
    setError('');
    try {
      await request('/control/gpu0_mode', { method: 'POST', body: JSON.stringify({ mode }) });
      await refresh();
    } catch (reason) {
      setSwitching(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setJob(null);
    try {
      const path = kind === 'image' ? '/creative/generate/image' : kind === 'edit' ? '/creative/edit/image' : '/creative/generate/video';
      const body = kind === 'image'
        ? { prompt, width, height }
        : kind === 'edit'
          ? { prompt, image_data_url: imageDataUrl, width, height, steps: 40 }
          : { prompt, width, height, frames, steps };
      const next = await request(path, { method: 'POST', body: JSON.stringify(body) });
      setJob(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  }

  const creativeReady = status?.mode === 'creative' && status.comfyui.responding;
  const phase = status?.transition?.phase || 'unknown';
  const generated = job?.outputs || [];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 mb-3"><ArrowLeft size={15} /> Command Center</Link>
            <h1 className="text-3xl font-bold flex items-center gap-3"><Sparkles className="text-fuchsia-400" /> Creative Studio</h1>
            <p className="text-sm text-zinc-400 mt-2">FLUX.2 Klein · Qwen Image Edit 2511 · Wan2.2 video · RTX 3090 GPU0</p>
          </div>
          <button onClick={refresh} className="p-2 rounded-lg border border-zinc-800 hover:bg-zinc-900" aria-label="Refresh"><RefreshCw size={18} /></button>
        </header>

        {error && <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>}

        <section className="grid md:grid-cols-2 gap-4">
          <button
            onClick={() => switchMode('voice')}
            disabled={switching || status?.mode === 'voice'}
            className={`text-left rounded-2xl border p-5 transition ${status?.mode === 'voice' ? 'border-emerald-500 bg-emerald-950/30' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'} disabled:cursor-not-allowed`}
          >
            <div className="flex items-center gap-3"><Mic className="text-emerald-400" /><strong>Voice Ready</strong></div>
            <p className="text-sm text-zinc-400 mt-2">Fast Qwen, both TTS models, Voice Studio and Twilio live.</p>
            <p className="text-xs mt-3 text-zinc-500">{status?.voice_ready ? 'All voice services healthy' : 'Voice services are parked'}</p>
          </button>
          <button
            onClick={() => switchMode('creative')}
            disabled={switching || status?.mode === 'creative'}
            className={`text-left rounded-2xl border p-5 transition ${status?.mode === 'creative' ? 'border-fuchsia-500 bg-fuchsia-950/30' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'} disabled:cursor-not-allowed`}
          >
            <div className="flex items-center gap-3"><Sparkles className="text-fuchsia-400" /><strong>Creative Compute</strong></div>
            <p className="text-sm text-zinc-400 mt-2">Parks voice safely and assigns GPU0 to pinned ComfyUI.</p>
            <p className="text-xs mt-3 text-zinc-500">{status?.comfyui.responding ? 'ComfyUI healthy on localhost:8188' : 'Creative runtime is parked'}</p>
          </button>
        </section>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 flex flex-wrap items-center gap-3 text-sm">
          <span className={`w-2.5 h-2.5 rounded-full ${phase === 'ready' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
          <strong className="capitalize">{phase.replace('_', ' ')}</strong>
          <span className="text-zinc-400">{status?.transition?.message || 'Loading status…'}</span>
          {status?.mode === 'creative' && <a href="http://127.0.0.1:8188" target="_blank" rel="noreferrer" className="ml-auto px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white">Open full ComfyUI</a>}
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap gap-2 mb-5">
            <button onClick={() => { setKind('image'); setWidth(1024); setHeight(1024); setPrompt('A cinematic portrait of a friendly silver robot assistant in a warm British study, natural window light, highly detailed'); }} className={`px-4 py-2 rounded-lg flex gap-2 items-center ${kind === 'image' ? 'bg-fuchsia-600' : 'bg-zinc-800'}`}><ImageIcon size={16} /> Generate image</button>
            <button onClick={() => { setKind('edit'); setWidth(1024); setHeight(1024); setPrompt('Change the subject while preserving composition, identity, pose, and background.'); }} className={`px-4 py-2 rounded-lg flex gap-2 items-center ${kind === 'edit' ? 'bg-fuchsia-600' : 'bg-zinc-800'}`}><Sparkles size={16} /> Edit image</button>
            <button onClick={() => { setKind('video'); setWidth(512); setHeight(288); setFrames(49); setSteps(20); setPrompt('A cinematic scene with smooth natural motion, photorealistic, stable camera.'); }} className={`px-4 py-2 rounded-lg flex gap-2 items-center ${kind === 'video' ? 'bg-fuchsia-600' : 'bg-zinc-800'}`}><Film size={16} /> Generate video</button>
          </div>
          <form onSubmit={generate} className="space-y-4">
            {kind === 'edit' && <label className="block text-sm text-zinc-400">Source image (PNG, JPEG or WebP; maximum 10 MiB)
              <input required type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) { setImageDataUrl(''); return; }
                if (file.size > 10 * 1024 * 1024) { setError('Source image exceeds 10 MiB'); setImageDataUrl(''); return; }
                const reader = new FileReader();
                reader.onload = () => setImageDataUrl(String(reader.result || ''));
                reader.onerror = () => setError('Could not read the source image');
                reader.readAsDataURL(file);
              }} className="block mt-2 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-2" />
            </label>}
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} className="w-full rounded-xl bg-zinc-950 border border-zinc-700 p-3 focus:border-fuchsia-500 outline-none" placeholder={kind === 'edit' ? 'Describe the exact edit…' : 'Describe what to generate…'} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {kind !== 'edit' && <label className="text-xs text-zinc-400">Width<input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} className="block mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-100" /></label>}
              {kind !== 'edit' && <label className="text-xs text-zinc-400">Height<input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} className="block mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-100" /></label>}
              {kind === 'video' && <label className="text-xs text-zinc-400">Frames<input type="number" value={frames} onChange={(e) => setFrames(Number(e.target.value))} className="block mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-100" /></label>}
              {kind === 'video' && <label className="text-xs text-zinc-400">Steps<input type="number" value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="block mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-zinc-100" /></label>}
            </div>
            <button disabled={!creativeReady || submitting || !prompt.trim() || (kind === 'edit' && !imageDataUrl)} className="px-5 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-zinc-700 disabled:text-zinc-500">
              {submitting ? 'Queueing…' : creativeReady ? (kind === 'edit' ? 'Edit image' : `Generate ${kind}`) : 'Switch to Creative mode first'}
            </button>
            {kind === 'video' && <p className="text-xs text-zinc-500">512×288 · 49 frames · 20 steps is the qualified default. Larger 832×480 renders need more time and VRAM.</p>}
            {kind === 'edit' && <p className="text-xs text-zinc-500">Qwen Image Edit uses its qualified 40-step workflow and scales the source to its native editing resolution.</p>}
          </form>
        </section>

        {job && <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="font-semibold">Current job</h2>
          <p className="text-sm text-zinc-400 mt-1">{job.prompt_id} · {job.status.replaceAll('_', ' ')}</p>
          {!['completed', 'failed'].includes(job.status) && <div className="mt-3 h-1 rounded bg-zinc-800 overflow-hidden"><div className="h-full w-1/3 bg-fuchsia-500 animate-pulse" /></div>}
          <div className="grid md:grid-cols-2 gap-4 mt-4">{generated.map((output) => output.kind.includes('video')
            ? <video key={`${output.subfolder}/${output.filename}`} controls src={outputUrl(output)} className="w-full rounded-xl" />
            : <img key={`${output.subfolder}/${output.filename}`} src={outputUrl(output)} alt={output.filename} className="w-full rounded-xl" />)}</div>
        </section>}

        <section>
          <h2 className="text-lg font-semibold mb-3">Installed creative models</h2>
          <div className="grid md:grid-cols-3 gap-3">{status?.profiles.map((profile) => <div key={profile.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="font-medium">{profile.display_name}</p>
            <p className="text-xs text-zinc-500 mt-1">{profile.role}</p>
            <div className="flex gap-2 mt-3 text-xs"><span className="px-2 py-1 rounded bg-zinc-800">{profile.license}</span><span className="px-2 py-1 rounded bg-zinc-800">{profile.status.replaceAll('_', ' ')}</span></div>
          </div>)}</div>
          <p className="text-xs text-zinc-500 mt-3">All three models are available through this page; the full ComfyUI graph editor remains available locally for advanced workflows.</p>
        </section>

        {!!status?.outputs.length && <section>
          <h2 className="text-lg font-semibold mb-3">Recent outputs</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{status.outputs.map((output) => <a key={`${output.subfolder}/${output.filename}`} href={outputUrl(output)} target="_blank" rel="noreferrer" className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden hover:border-fuchsia-700">
            {output.kind.includes('video') ? <video muted src={outputUrl(output)} className="w-full aspect-video object-cover" /> : <img src={outputUrl(output)} alt={output.filename} className="w-full aspect-square object-cover" />}
            <p className="text-xs text-zinc-500 p-2 truncate">{output.filename}</p>
          </a>)}</div>
        </section>}
      </div>
    </main>
  );
}
