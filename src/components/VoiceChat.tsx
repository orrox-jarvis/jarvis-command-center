'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { encodeMulawBuffer, decodeMulawBuffer } from '@/lib/mulaw'

type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking'

const GATEWAY_SAMPLE_RATE = 8000
const SEND_INTERVAL_MS    = 60   // send a packet every 60ms = 480 samples @ 8kHz
const PLAYBACK_LEAD_S     = 0.06 // 60ms scheduling lead for seamless audio

// ── base64 helpers ──────────────────────────────────────────────────────────
function uint8ToBase64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s)
}
function base64ToUint8(b64: string): Uint8Array {
  const s = atob(b64)
  const o = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i)
  return o
}

export default function VoiceChat() {
  const [state, setState]   = useState<VoiceState>('idle')
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const wsRef          = useRef<WebSocket | null>(null)
  const audioCtxRef    = useRef<AudioContext | null>(null)
  const streamRef      = useRef<MediaStream | null>(null)
  const workletRef     = useRef<AudioWorkletNode | null>(null)
  const nextPlayRef    = useRef<number>(0)
  const isMutedRef     = useRef(false)

  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])

  // ── Seamless playback scheduler ─────────────────────────────────────────
  const scheduleAudio = useCallback((pcm: Float32Array) => {
    const ctx = audioCtxRef.current
    if (!ctx || pcm.length === 0) return

    const buf = ctx.createBuffer(1, pcm.length, GATEWAY_SAMPLE_RATE)
    buf.getChannelData(0).set(pcm)

    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)

    const now     = ctx.currentTime
    const startAt = Math.max(now + PLAYBACK_LEAD_S, nextPlayRef.current)
    src.start(startAt)
    nextPlayRef.current = startAt + buf.duration

    setState('speaking')
    src.onended = () => {
      if (audioCtxRef.current && nextPlayRef.current <= audioCtxRef.current.currentTime + 0.1) {
        setState('listening')
      }
    }
  }, [])

  // ── Connect ─────────────────────────────────────────────────────────────
  const connect = async () => {
    try {
      setState('connecting')
      setError(null)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      streamRef.current = stream

      // Set AudioContext to 8kHz — the browser will resample the mic input
      // automatically when creating the MediaStreamSource, so we get 8kHz
      // samples directly without any manual resampling code.
      const ctx = new AudioContext({ sampleRate: GATEWAY_SAMPLE_RATE })
      audioCtxRef.current = ctx
      nextPlayRef.current = 0

      const source = ctx.createMediaStreamSource(stream)

      // Accumulation buffer — collect SEND_INTERVAL_MS worth of samples then send
      const samplesPerPacket = Math.round(GATEWAY_SAMPLE_RATE * SEND_INTERVAL_MS / 1000)
      let accBuf: Float32Array[] = []
      let accLen = 0

      const flush = () => {
        if (!isMutedRef.current && wsRef.current?.readyState === WebSocket.OPEN && accLen > 0) {
          const merged = new Float32Array(accLen)
          let off = 0
          for (const c of accBuf) { merged.set(c, off); off += c.length }
          const mulaw = encodeMulawBuffer(merged)
          wsRef.current.send(JSON.stringify({
            event: 'media',
            media: { payload: uint8ToBase64(mulaw) }
          }))
        }
        accBuf = []
        accLen = 0
      }

      // Try AudioWorklet first (runs off main thread = no glitches)
      try {
        const code = `
          class Cap extends AudioWorkletProcessor {
            process(inputs) {
              const ch = inputs[0]?.[0]
              if (ch) this.port.postMessage(ch.slice())
              return true
            }
          }
          registerProcessor('cap', Cap)
        `
        const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
        await ctx.audioWorklet.addModule(url)
        URL.revokeObjectURL(url)

        const worklet = new AudioWorkletNode(ctx, 'cap')
        workletRef.current = worklet

        worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
          accBuf.push(e.data)
          accLen += e.data.length
          if (accLen >= samplesPerPacket) flush()
        }

        source.connect(worklet)
        worklet.connect(ctx.destination) // keep graph alive

      } catch {
        // Fallback: ScriptProcessorNode
        console.warn('AudioWorklet unavailable, using ScriptProcessor')
        // @ts-ignore
        const sp = ctx.createScriptProcessor(2048, 1, 1)
        sp.onaudioprocess = (e: AudioProcessingEvent) => {
          accBuf.push(e.inputBuffer.getChannelData(0).slice())
          accLen += e.inputBuffer.length
          if (accLen >= samplesPerPacket) flush()
        }
        source.connect(sp)
        sp.connect(ctx.destination)
      }

      // ── WebSocket ──────────────────────────────────────────────────────
      const ws = new WebSocket(process.env.NEXT_PUBLIC_VOICE_GATEWAY_URL!)
      wsRef.current = ws

      ws.onopen = () => {
        setState('listening')
        ws.send(JSON.stringify({
          event: 'start',
          start: {
            streamSid: `browser-${Date.now()}`,
            accountSid: 'browser',
            callSid:    'browser-call',
          }
        }))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          if (data.event === 'media' && data.media?.payload) {
            const mulaw = base64ToUint8(data.media.payload)
            const pcm   = decodeMulawBuffer(mulaw)
            scheduleAudio(pcm)
          }
          // ignore clear/mark/other events
        } catch (err) {
          console.error('ws message error:', err)
        }
      }

      ws.onerror = () => {
        setError('Connection error — check your network')
        setState('idle')
      }
      ws.onclose = () => setState('idle')

    } catch (err) {
      console.error('Connect error:', err)
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setState('idle')
    }
  }

  // ── Disconnect ───────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'stop' }))
    }
    wsRef.current?.close()
    wsRef.current = null

    workletRef.current?.disconnect()
    workletRef.current = null

    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    audioCtxRef.current?.close()
    audioCtxRef.current = null
    nextPlayRef.current = 0

    setState('idle')
  }, [])

  useEffect(() => () => { disconnect() }, [disconnect])

  // ── UI ───────────────────────────────────────────────────────────────────
  const orbGradient = {
    idle:       'from-[#00d4ff]/20 to-[#7c3aed]/20',
    connecting: 'from-[#00d4ff]/40 to-[#7c3aed]/40 animate-pulse',
    listening:  'from-[#00d4ff]/60 to-[#7c3aed]/60 animate-pulse-slow',
    speaking:   'from-[#00d4ff] to-[#7c3aed] animate-pulse-fast',
  }[state]

  const statusText = {
    idle:       'Click "Start Talking" to begin your conversation with Jarvis',
    connecting: 'Connecting to Jarvis...',
    listening:  isMuted ? 'Microphone muted — click Unmute to speak' : 'Listening... speak now',
    speaking:   'Jarvis is speaking...',
  }[state]

  return (
    <div className="flex flex-col items-center justify-center gap-8 p-8">
      {/* Orb */}
      <div className="relative">
        <div className={`
          w-48 h-48 rounded-full bg-gradient-to-br ${orbGradient}
          transition-all duration-300 flex items-center justify-center
          shadow-[0_0_60px_rgba(0,212,255,0.4)]
        `}>
          <div className="text-white/90 text-lg font-medium capitalize">{state}</div>
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-950/30 px-4 py-2 rounded-lg border border-red-800/50">
          {error}
        </div>
      )}

      <div className="flex gap-4">
        {state === 'idle' ? (
          <button
            onClick={connect}
            className="px-8 py-3 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-lg"
          >
            Start Talking
          </button>
        ) : (
          <>
            <button
              onClick={() => setIsMuted(m => !m)}
              className={`px-6 py-3 font-semibold rounded-lg transition-all shadow-lg ${
                isMuted
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              {isMuted ? '🎤 Unmute' : '🔇 Mute'}
            </button>
            <button
              onClick={disconnect}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all shadow-lg"
            >
              Disconnect
            </button>
          </>
        )}
      </div>

      <div className="text-gray-400 text-sm text-center max-w-xs">{statusText}</div>

      <style jsx>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes pulse-fast {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.9; transform: scale(1.1); }
        }
        .animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
        .animate-pulse-fast  { animation: pulse-fast 0.8s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
