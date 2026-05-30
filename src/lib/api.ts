const BRIDGE = process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'https://cmd.dataintellagents.com';
const TOKEN  = process.env.NEXT_PUBLIC_BRIDGE_TOKEN ?? '';

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BRIDGE}${path}`, {
    ...opts,
    headers: { 'X-Jarvis-Token': TOKEN, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const api = {
  health:    () => req('/healthz'),
  hardware:  () => req('/status/hardware'),
  services:  () => req('/status/services'),
  ttsMode:   (mode: string)  => req('/control/tts',     { method: 'POST', body: JSON.stringify({ mode }) }),
  llmTier:   (tier: string)  => req('/control/llm',     { method: 'POST', body: JSON.stringify({ tier }) }),
  envUpdate: (key: string, value: string) => req('/control/env', { method: 'POST', body: JSON.stringify({ key, value }) }),
  restartSvc:(name: string)  => req('/control/restart', { method: 'POST', body: JSON.stringify({ service: name }) }),
};
