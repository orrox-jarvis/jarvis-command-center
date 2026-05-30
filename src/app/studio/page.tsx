'use client';
import { useState, useRef, useCallback } from 'react';
import { Mic, Wand2, Upload, Play, Save, Check, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'https://studio.dataintellagents.com';

// Voice preset descriptions for quick selection
const VOICE_PRESETS = [
  { label: 'Calm British Male', value: 'A calm, deep British male voice, clear and authoritative, like a refined butler' },
  { label: 'Warm American Male', value: 'A warm, friendly American male voice, conversational and approachable' },
  { label: 'Cool & Robotic', value: 'A cool, slightly synthetic AI assistant voice, precise and neutral' },
  { label: 'Deep & Dramatic', value: 'A deep, dramatic male voice with gravitas, like a movie narrator' },
  { label: 'Energetic & Fast', value: 'An energetic, fast-paced male voice, enthusiastic and sharp' },
  { label: 'Whisper & Calm', value: 'A soft, calm whispery voice, intimate and relaxed' },
];

const SAMPLE_TEXTS = [
  "Good morning. I'm Jarvis, your personal AI assistant. How can I help you today?",
  "I've analysed the data and found three key insights worth your attention.",
  "Connecting you now. Please hold for a moment.",
];

function AudioPlayer({ url, label }: { url: string; label: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-xl border border-zinc-700">
      <Play size={14} className="text-green-400 flex-shrink-0" />
      <span className="text-xs text-zinc-300 flex-1">{label}</span>
      <audio controls src={url} className="h-8 w-48" />
    </div>
  );
}

export default function VoiceStudio() {
  // Voice Design tab
  const [designText, setDesignText] = useState(SAMPLE_TEXTS[0]);
  const [designInstruct, setDesignInstruct] = useState(VOICE_PRESETS[0].value);
  const [designAudio, setDesignAudio] = useState<string | null>(null);
  const [designing, setDesigning] = useState(false);
  const [designErr, setDesignErr] = useState('');

  // Voice Clone tab
  const [cloneText, setCloneText] = useState(SAMPLE_TEXTS[0]);
  const [cloneRefText, setCloneRefText] = useState('');
  const [cloneAudio, setCloneAudio] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [cloneErr, setCloneErr] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Recording
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<File | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Save voice
  const [voiceName, setVoiceName] = useState('jarvis_custom');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [tab, setTab] = useState<'design' | 'clone'>('design');

  const handleDesign = async () => {
    setDesigning(true);
    setDesignErr('');
    setDesignAudio(null);
    try {
      const res = await fetch(`${STUDIO_URL}/synthesize_design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: designText, instruct: designInstruct, language: 'english' }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      setDesignAudio(URL.createObjectURL(blob));
    } catch (e: any) {
      setDesignErr(e.message);
    } finally {
      setDesigning(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        const file = new File([blob], 'recording.wav', { type: 'audio/wav' });
        setRecorded(file);
        setUploadedFile(file);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch (e: any) {
      setCloneErr('Microphone access denied: ' + e.message);
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const handleClone = async () => {
    const audioFile = uploadedFile || recorded;
    if (!audioFile) { setCloneErr('Please upload or record reference audio first.'); return; }
    setCloning(true);
    setCloneErr('');
    setCloneAudio(null);
    try {
      const fd = new FormData();
      fd.append('text', cloneText);
      fd.append('ref_text', cloneRefText);
      fd.append('language', 'english');
      fd.append('audio', audioFile);
      const res = await fetch(`${STUDIO_URL}/clone_voice`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      setCloneAudio(URL.createObjectURL(blob));
    } catch (e: any) {
      setCloneErr(e.message);
    } finally {
      setCloning(false);
    }
  };

  const handleSave = async () => {
    const audioFile = uploadedFile || recorded;
    if (!audioFile) { setCloneErr('Need reference audio to save a voice profile.'); return; }
    setSaving(true);
    setSaved(false);
    try {
      const fd = new FormData();
      fd.append('audio', audioFile);
      fd.append('ref_text', cloneRefText);
      fd.append('voice_name', voiceName);
      const res = await fetch(`${STUDIO_URL}/save_jarvis_voice`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setCloneErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      {/* Header */}
      <div className="flex items-center gap-4 mb-10">
        <Link href="/" className="p-2 hover:bg-zinc-900 rounded-full transition-colors text-zinc-500 hover:text-white">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tighter flex items-center gap-3">
            <Wand2 className="text-purple-500" size={24} />
            JARVIS VOICE STUDIO
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Design a voice or clone your own</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {[{ id: 'design', label: 'Voice Design', icon: Wand2 }, { id: 'clone', label: 'Voice Clone', icon: Mic }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'bg-purple-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Voice Design Tab */}
      {tab === 'design' && (
        <div className="max-w-2xl space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Describe Your Voice</h2>

            {/* Presets */}
            <div>
              <p className="text-xs text-zinc-500 mb-2">Quick presets</p>
              <div className="flex flex-wrap gap-2">
                {VOICE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => setDesignInstruct(p.value)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      designInstruct === p.value ? 'border-purple-600 bg-purple-900/30 text-purple-300' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom description */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Voice description</label>
              <textarea
                value={designInstruct}
                onChange={e => setDesignInstruct(e.target.value)}
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-700 resize-none"
                placeholder="A deep, calm British male voice with a slight robot edge..."
              />
            </div>

            {/* Sample text */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Preview text</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {SAMPLE_TEXTS.map((t, i) => (
                  <button key={i} onClick={() => setDesignText(t)} className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 transition-colors">
                    Sample {i + 1}
                  </button>
                ))}
              </div>
              <textarea
                value={designText}
                onChange={e => setDesignText(e.target.value)}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-700 resize-none"
              />
            </div>

            <button
              onClick={handleDesign}
              disabled={designing}
              className="w-full py-3 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
            >
              {designing ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : <><Wand2 size={16} /> Generate Voice</>}
            </button>

            {designErr && (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle size={12} /> {designErr}
              </div>
            )}

            {designAudio && <AudioPlayer url={designAudio} label="Generated Voice Preview" />}
          </div>
        </div>
      )}

      {/* Voice Clone Tab */}
      {tab === 'clone' && (
        <div className="max-w-2xl space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Clone a Voice</h2>

            {/* Record or upload */}
            <div>
              <p className="text-xs text-zinc-500 mb-3">Reference audio (5–30 seconds of clear speech)</p>
              <div className="flex gap-3">
                <button
                  onClick={recording ? stopRecording : startRecording}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    recording ? 'bg-red-700 hover:bg-red-600 animate-pulse' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'
                  }`}
                >
                  <Mic size={14} /> {recording ? 'Stop Recording' : 'Record'}
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all"
                >
                  <Upload size={14} /> Upload Audio
                </button>
                <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={e => setUploadedFile(e.target.files?.[0] ?? null)} />
              </div>
              {(uploadedFile || recorded) && (
                <div className="mt-3 text-xs text-green-400 flex items-center gap-2">
                  <Check size={12} /> {uploadedFile?.name ?? 'recording.wav'} ready
                </div>
              )}
            </div>

            {/* Reference transcript (optional) */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Reference transcript (optional — improves quality)</label>
              <textarea
                value={cloneRefText}
                onChange={e => setCloneRefText(e.target.value)}
                rows={2}
                placeholder="What was said in the reference audio..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-700 resize-none"
              />
            </div>

            {/* Text to speak */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Text to synthesise</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {SAMPLE_TEXTS.map((t, i) => (
                  <button key={i} onClick={() => setCloneText(t)} className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 transition-colors">
                    Sample {i + 1}
                  </button>
                ))}
              </div>
              <textarea
                value={cloneText}
                onChange={e => setCloneText(e.target.value)}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-700 resize-none"
              />
            </div>

            <button
              onClick={handleClone}
              disabled={cloning}
              className="w-full py-3 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
            >
              {cloning ? <><Loader2 size={16} className="animate-spin" /> Cloning...</> : <><Mic size={16} /> Preview Clone</>}
            </button>

            {cloneErr && (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle size={12} /> {cloneErr}
              </div>
            )}

            {cloneAudio && <AudioPlayer url={cloneAudio} label="Cloned Voice Preview" />}

            {/* Save as Jarvis voice */}
            {cloneAudio && (
              <div className="pt-4 border-t border-zinc-800 space-y-3">
                <p className="text-xs text-zinc-400 font-semibold">Save as Jarvis Voice Profile</p>
                <div className="flex gap-3">
                  <input
                    value={voiceName}
                    onChange={e => setVoiceName(e.target.value)}
                    placeholder="voice profile name"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-700"
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-xl text-sm font-semibold transition-all"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
                    {saved ? 'Saved!' : 'Save Voice'}
                  </button>
                </div>
                <p className="text-xs text-zinc-600">Saved to ~/.hermes/voice_profiles/{voiceName}.pt — Jarvis can use this on calls.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
