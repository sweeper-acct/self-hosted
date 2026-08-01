-- Migration 035: BYOK (Bring Your Own Key) AI configuration per firm
-- Firms can optionally supply their own LLM API key (Anthropic/OpenAI/Google).
-- Key is encrypted at rest via Fernet (ENCRYPTION_KEY Railway env var).
-- ai_api_key_encrypted is NEVER returned in API responses.

ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS ai_provider        TEXT,    -- 'anthropic' | 'openai' | 'google'
  ADD COLUMN IF NOT EXISTS ai_model           TEXT,    -- null = use platform BAS_AGENT_MODEL default
  ADD COLUMN IF NOT EXISTS ai_api_key_encrypted TEXT;  -- Fernet-encrypted key; null = use platform key
