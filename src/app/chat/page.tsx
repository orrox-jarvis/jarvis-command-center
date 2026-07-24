'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, Check, Copy, History, LoaderCircle, MessageSquarePlus, Send, Trash2, User } from 'lucide-react';

const BRIDGE = '/api/bridge';

type ModelId = 'qwen-dense' | 'qwen-moe' | 'gemma-dense' | 'gemma-moe';
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; model?: ModelId };
type ChatSummary = {
  id: string; title: string; model: ModelId; created_at: string; updated_at: string;
  message_count: number; preview: string;
};
type StoredChat = ChatSummary & { messages: Array<ChatMessage & { created_at: string }> };
type Gpu1Status = {
  active_model: ModelId;
  model_loaded: string | null;
  responding: boolean;
  service_status: string;
  switch_status?: { phase: string; message: string; desired?: ModelId } | null;
};

const MODELS: Record<ModelId, { name: string; short: string; family: string; description: string; accent: string }> = {
  'qwen-dense': {
    name: 'Qwen 3.6 27B Dense', short: 'Qwen Dense', family: 'Qwen',
    description: 'Coding, tools and structured answers', accent: 'border-violet-500 bg-violet-500/10 text-violet-200',
  },
  'qwen-moe': {
    name: 'Qwen 3.6 35B-A3B MoE', short: 'Qwen MoE', family: 'Qwen',
    description: 'Fast reasoning and high throughput', accent: 'border-cyan-500 bg-cyan-500/10 text-cyan-200',
  },
  'gemma-dense': {
    name: 'Gemma 4 31B Dense', short: 'Gemma Dense', family: 'Gemma',
    description: 'Documents, review and general reasoning', accent: 'border-blue-500 bg-blue-500/10 text-blue-200',
  },
  'gemma-moe': {
    name: 'Gemma 4 26B-A4B MoE', short: 'Gemma MoE', family: 'Gemma',
    description: 'Long context and complex analysis', accent: 'border-emerald-500 bg-emerald-500/10 text-emerald-200',
  },
};

const TRANSITION_PHASES = new Set(['draining', 'unloading', 'switching', 'loading', 'rollback']);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatChatDate(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

async function apiFetch(path: string, options?: RequestInit) {
  const response = await fetch(`${BRIDGE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try {
      const body = JSON.parse(text);
      detail = typeof body.detail === 'string'
        ? body.detail
        : body.detail?.message || JSON.stringify(body.detail || body);
    } catch {
      // Preserve a non-JSON upstream error body.
    }
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return response.json();
}

export default function ChatPage() {
  const [status, setStatus] = useState<Gpu1Status | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId>('gemma-moe');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(async () => {
    const next = await apiFetch('/status/gpu1_model') as Gpu1Status;
    setStatus(next);
    return next;
  }, []);

  const refreshChats = useCallback(async () => {
    const result = await apiFetch('/chats') as { chats: ChatSummary[] };
    setChats(result.chats);
    return result.chats;
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
      void refreshStatus().then((next) => setSelectedModel(next.active_model)).catch((err) => setError(errorMessage(err)));
      void refreshChats().catch((err) => setError(errorMessage(err)));
    }, 0);
    const interval = setInterval(() => { void refreshStatus().catch(() => undefined); }, 5000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [refreshChats, refreshStatus]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const chooseModel = async (model: ModelId) => {
    setSelectedModel(model);
    setError(null);
    if (status?.active_model === model && status.responding && !TRANSITION_PHASES.has(status.switch_status?.phase ?? '')) return;

    setSwitching(true);
    try {
      await apiFetch('/control/gpu1_model', { method: 'POST', body: JSON.stringify({ model }) });
      for (let attempt = 0; attempt < 150; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const next = await refreshStatus();
        const phase = next.switch_status?.phase ?? '';
        if (next.active_model === model && next.responding && !TRANSITION_PHASES.has(phase)) return;
        if (phase === 'error') throw new Error(next.switch_status?.message || 'Model switch failed');
      }
      throw new Error('Model switch timed out');
    } catch (err) {
      setError(errorMessage(err));
      const live = await refreshStatus().catch(() => null);
      if (live?.active_model) setSelectedModel(live.active_model);
    } finally {
      setSwitching(false);
    }
  };

  const newConversation = () => {
    setCurrentChatId(null);
    setMessages([]);
    setInput('');
    setError(null);
  };

  const openChat = async (chatId: string) => {
    if (sending || switching || loadingChat) return;
    setLoadingChat(true);
    setError(null);
    try {
      const stored = await apiFetch(`/chats/${chatId}`) as StoredChat;
      setCurrentChatId(stored.id);
      setMessages(stored.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        model: message.model || undefined,
      })));
      setInput('');
      // Restoring history must not churn GPU1 just because the user is browsing chats.
      // The existing model button remains the explicit control for loading this profile.
      setSelectedModel(stored.model);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingChat(false);
    }
  };

  const deleteChat = async (chatId: string) => {
    const chat = chats.find((item) => item.id === chatId);
    if (!window.confirm(`Delete “${chat?.title || 'this conversation'}”?`)) return;
    try {
      await apiFetch(`/chats/${chatId}`, { method: 'DELETE' });
      if (currentChatId === chatId) newConversation();
      await refreshChats();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || sending || switching || loadingChat) return;
    if (!status?.responding || status.active_model !== selectedModel) {
      setError('Wait for the selected model to finish loading before sending.');
      return;
    }

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const history = nextMessages.slice(-40).map(({ role, content }) => ({ role, content }));
      const response = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: selectedModel,
          messages: history,
          conversation_id: currentChatId,
          max_tokens: 2048,
        }),
      });
      setCurrentChatId(response.conversation_id);
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: 'assistant', content: response.content, model: response.profile,
      }]);
      try {
        await refreshChats();
      } catch (refreshError) {
        setError(`Reply saved, but the chat list could not refresh: ${errorMessage(refreshError)}`);
      }
    } catch (err) {
      // The bridge only persists completed user/assistant pairs. Roll back the
      // optimistic user bubble so the visible and durable transcripts cannot diverge.
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setInput(text);
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const copyMessage = async (message: ChatMessage) => {
    await navigator.clipboard.writeText(message.content);
    setCopied(message.id);
    setTimeout(() => setCopied(null), 1500);
  };

  const phase = status?.switch_status?.phase ?? '';
  const modelReady = Boolean(status?.responding && status.active_model === selectedModel && !TRANSITION_PHASES.has(phase));

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" aria-label="Back to dashboard" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <h1 className="font-bold text-lg leading-tight">Local Model Chat</h1>
            <p className="text-xs text-slate-500 truncate">Choose one GPU1 model and chat privately on your own hardware</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${modelReady ? 'bg-emerald-400' : switching ? 'bg-amber-400 animate-pulse' : 'bg-rose-400'}`} />
            <span className="hidden sm:inline text-slate-400">{switching ? 'Switching model' : modelReady ? 'Ready' : 'Not ready'}</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] min-h-0">
        <aside className="border-b lg:border-b-0 lg:border-r border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Choose model</h2>
            <span className="text-[11px] text-slate-600">GPU1 · 8081</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            {(Object.keys(MODELS) as ModelId[]).map((model) => {
              const info = MODELS[model];
              const selected = selectedModel === model;
              const active = status?.active_model === model && status.responding;
              return (
                <button
                  key={model}
                  onClick={() => void chooseModel(model)}
                  disabled={switching || sending}
                  className={`text-left rounded-xl border p-3 transition-all disabled:opacity-50 ${selected ? info.accent : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{info.short}</span>
                    {active && <span className="ml-auto h-2 w-2 bg-emerald-400 rounded-full" title="Loaded" />}
                  </div>
                  <p className="hidden sm:block text-[11px] text-slate-500 mt-1 leading-snug">{info.description}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs">
            <div className="text-slate-500 mb-1">Selected</div>
            <div className="font-medium text-slate-200">{MODELS[selectedModel].name}</div>
            {switching && (
              <div className="mt-2 flex items-center gap-2 text-amber-300">
                <LoaderCircle size={13} className="animate-spin" />
                <span>{status?.switch_status?.message || 'Preparing model…'}</span>
              </div>
            )}
          </div>

          <button
            onClick={newConversation}
            disabled={(!currentChatId && !messages.length) || sending || switching || loadingChat}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2.5 text-xs font-medium text-white disabled:bg-slate-800 disabled:text-slate-500 transition-colors"
          >
            <MessageSquarePlus size={14} /> New conversation
          </button>

          <div className="mt-5 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              <History size={13} /> Previous chats
              {chats.length > 0 && <span className="ml-auto text-[10px] text-slate-600">{chats.length}</span>}
            </div>
            <div className="max-h-52 lg:max-h-[30vh] overflow-y-auto space-y-1 pr-1">
              {!chats.length && <p className="py-3 text-xs text-slate-600 text-center">No saved conversations yet</p>}
              {chats.map((chat) => (
                <div key={chat.id} className={`group flex items-center rounded-lg border ${currentChatId === chat.id ? 'border-indigo-600 bg-indigo-500/10' : 'border-transparent hover:bg-slate-900'}`}>
                  <button
                    onClick={() => void openChat(chat.id)}
                    disabled={sending || switching || loadingChat}
                    title={chat.preview}
                    className="min-w-0 flex-1 text-left px-3 py-2 disabled:opacity-50"
                  >
                    <div className="truncate text-xs font-medium text-slate-300">{chat.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-600">
                      <span>{MODELS[chat.model]?.short || chat.model}</span>
                      <span>·</span>
                      <span>{chat.message_count} messages</span>
                      <span className="ml-auto">{formatChatDate(chat.updated_at)}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => void deleteChat(chat.id)}
                    disabled={sending || switching || loadingChat}
                    aria-label={`Delete ${chat.title}`}
                    className="shrink-0 mr-2 p-1.5 rounded-md text-slate-700 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex flex-col min-h-[70vh] lg:h-[calc(100vh-65px)]">
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
            <div className="max-w-3xl mx-auto space-y-5">
              {!messages.length && (
                <div className="py-14 text-center">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-4">
                    <Bot className="text-indigo-300" size={28} />
                  </div>
                  <h2 className="text-xl font-semibold">Chat with {MODELS[selectedModel].short}</h2>
                  <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
                    Your conversation is sent directly to the selected model on GPU1. Switching models safely unloads the current profile first.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-400">
                    {['Explain this concept', 'Help me write code', 'Review a document', 'Plan a project'].map((prompt) => (
                      <button key={prompt} onClick={() => setInput(prompt + ': ')} className="px-3 py-2 rounded-full border border-slate-800 hover:border-slate-600 hover:text-white">
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <article key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role === 'assistant' && <div className="mt-1 shrink-0 w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center"><Bot size={17} className="text-indigo-300" /></div>}
                  <div className={`group relative max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-3 ${message.role === 'user' ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-md'}`}>
                    {message.role === 'assistant' && message.model && <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{MODELS[message.model].short}</div>}
                    <div className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</div>
                    <button onClick={() => void copyMessage(message)} aria-label="Copy message" className="absolute -bottom-7 right-0 opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-500 hover:text-white">
                      {copied === message.id ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  {message.role === 'user' && <div className="mt-1 shrink-0 w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center"><User size={16} className="text-slate-300" /></div>}
                </article>
              ))}

              {sending && (
                <div className="flex gap-3 items-center text-sm text-slate-500">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center"><Bot size={17} className="text-indigo-300" /></div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                    <LoaderCircle size={15} className="animate-spin" /> {MODELS[selectedModel].short} is thinking…
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-slate-800 bg-slate-950 p-4">
            <form onSubmit={(event) => void sendMessage(event)} className="max-w-3xl mx-auto">
              {error && <div className="mb-3 rounded-xl border border-rose-800 bg-rose-950/40 px-4 py-2.5 text-sm text-rose-300">{error}</div>}
              <div className="relative rounded-2xl border border-slate-700 bg-slate-900 focus-within:border-indigo-500 transition-colors">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={loadingChat ? 'Loading conversation…' : modelReady ? `Message ${MODELS[selectedModel].short}…` : 'Waiting for model…'}
                  disabled={!modelReady || sending || switching || loadingChat}
                  rows={3}
                  className="w-full resize-none bg-transparent px-4 py-3 pr-14 text-sm text-white placeholder:text-slate-600 outline-none disabled:opacity-50"
                />
                <button type="submit" disabled={!input.trim() || !modelReady || sending || switching || loadingChat} aria-label="Send message" className="absolute right-3 bottom-3 w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 flex items-center justify-center transition-colors">
                  {sending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-600">Enter to send · Shift+Enter for a new line · Chats are saved privately on this machine</p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
