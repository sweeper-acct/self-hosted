import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

interface AiSettings {
  provider: string | null
  model: string | null
  key_set: boolean
  provider_models: Record<string, string[]>
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
}

export default function AISettingsPage() {
  const qc = useQueryClient()

  const { data: settings, isLoading } = useQuery<AiSettings>({
    queryKey: ['ai-settings'],
    queryFn: () => api.get('/api/v1/firms/ai-settings').then((r: { data: { data: AiSettings } }) => r.data.data),
  })

  const [provider, setProvider] = useState('')
  const [model, setModel]       = useState('')
  const [apiKey, setApiKey]     = useState('')
  const [showKey, setShowKey]   = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

  const providerModels = settings?.provider_models ?? {}
  const effectiveProvider = provider || settings?.provider || ''
  const modelOptions = effectiveProvider ? (providerModels[effectiveProvider] ?? []) : []

  const saveMut = useMutation({
    mutationFn: () =>
      api.put('/api/v1/firms/ai-settings', {
        provider: provider || settings?.provider,
        model:    model    || settings?.model,
        api_key:  apiKey,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-settings'] })
      setApiKey('')
      setSaved(true)
      setError('')
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Failed to save settings')
    },
  })

  const clearMut = useMutation({
    mutationFn: () => api.delete('/api/v1/firms/ai-settings/key'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-settings'] })
      setProvider('')
      setModel('')
      setApiKey('')
    },
  })

  function handleProviderChange(p: string) {
    setProvider(p)
    setModel('')
  }

  const canSave = apiKey.length >= 20 && (provider || settings?.provider) && (model || settings?.model)

  if (isLoading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  return (
    <div className="max-w-xl mx-auto p-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">AI Settings</h1>
      <p className="text-sm text-gray-500 mb-8">
        For firms with an existing Anthropic enterprise agreement. Using your own key keeps AI calls
        under your firm's data terms and API usage records — useful for compliance and data sovereignty.
        The key is encrypted at rest and never returned after saving.
      </p>

      {/* Current status */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-8">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Current configuration</p>
        {settings?.key_set ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-sm font-medium text-gray-800">
                {PROVIDER_LABELS[settings.provider ?? ''] ?? settings.provider}
              </span>
            </div>
            <p className="text-sm text-gray-500 pl-4">Model: {settings.model}</p>
            <p className="text-sm text-gray-500 pl-4">API key: ●●●●●●●● (set)</p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-300 shrink-0" />
            <span className="text-sm text-gray-500">Using platform default (no BYOK configured)</span>
          </div>
        )}
      </div>

      {/* Configure form */}
      <div className="space-y-5">
        {/* Provider */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Provider</label>
          <select
            value={effectiveProvider}
            onChange={e => handleProviderChange(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select provider…</option>
            {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Model</label>
          <select
            value={model || settings?.model || ''}
            onChange={e => setModel(e.target.value)}
            disabled={!effectiveProvider}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">Select model…</option>
            {modelOptions.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={settings?.key_set ? 'Enter new key to replace existing…' : 'sk-ant-api03-…'}
              className="w-full border border-gray-200 rounded-md px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Key is encrypted before storage and never returned via API.</p>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveMut.mutate()}
            disabled={!canSave || saveMut.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saveMut.isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save settings'}
          </button>

          {settings?.key_set && (
            <button
              onClick={() => clearMut.mutate()}
              disabled={clearMut.isPending}
              className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 disabled:opacity-40"
            >
              {clearMut.isPending ? 'Clearing…' : 'Revert to platform default'}
            </button>
          )}
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          <strong className="font-medium text-gray-500">Where to get your key:</strong>{' '}
          Anthropic — <span className="font-mono">console.anthropic.com</span> → API Keys
        </p>
      </div>
    </div>
  )
}
