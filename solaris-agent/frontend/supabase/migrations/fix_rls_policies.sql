-- Recreate tables (will fail if they exist, that's OK - we just need policies)
-- The key is to add the missing UPDATE and DELETE policies

-- Create conversations table with TEXT id (if not exists)
CREATE TABLE IF NOT EXISTS public.conversations (
    id TEXT PRIMARY KEY DEFAULT 'default-session',
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create chat_messages table with TEXT session_id (if not exists)
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    team TEXT NOT NULL CHECK (team IN ('red', 'blue')),
    agent_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes (if not exists)
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_team ON public.chat_messages(team);

-- Enable RLS (if not already enabled)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and recreate them
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete" ON public.conversations;

DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_delete" ON public.chat_messages;

-- Create all policies for conversations
CREATE POLICY "conversations_select" ON public.conversations FOR SELECT USING (true);
CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "conversations_update" ON public.conversations FOR UPDATE USING (true);
CREATE POLICY "conversations_delete" ON public.conversations FOR DELETE USING (true);

-- Create all policies for chat_messages
CREATE POLICY "chat_messages_select" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "chat_messages_insert" ON public.chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "chat_messages_delete" ON public.chat_messages FOR DELETE USING (true);
