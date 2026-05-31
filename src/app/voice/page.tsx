'use client'

import Link from 'next/link'
import VoiceChat from '@/components/VoiceChat'

export default function VoicePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="p-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <Link 
          href="/" 
          className="text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-2"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">🎙️ Voice Assistant</h1>
        <div className="w-20" /> {/* spacer to balance header */}
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center justify-center px-6">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-extrabold mb-4 tracking-tight text-white">
            Talk to Jarvis directly from your browser
          </h2>
          <p className="text-zinc-400 text-lg">
            Real-time voice interaction enabled via WebSocket.
          </p>
        </div>

        <div className="flex items-center justify-center w-full max-w-2xl">
          <VoiceChat />
        </div>
      </main>

      {/* Footer */}
      <footer className="p-8 text-center">
        <p className="text-zinc-500 text-sm font-mono">
          Connected to wss://voice.dataintellagents.com/media
        </p>
      </footer>
    </div>
  )
}
