-- Migration: Create chat tables for TeamChat
-- Run this in your Supabase SQL Editor

-- Drop existing tables if they have wrong types
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;

-- Create conversations table with TEXT id for flexibility
CREATE TABLE IF NOT EXISTS public.conversations (
    id TEXT PRIMARY KEY DEFAULT 'default-session',
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create chat_messages table with TEXT session_id
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    team TEXT NOT NULL CHECK (team IN ('red', 'blue')),
    agent_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable realtime for chat_messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_team ON public.chat_messages(team);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Enable Row Level Security
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow public access policies
CREATE POLICY "Allow public access to conversations" ON public.conversations
    FOR SELECT USING (true);

CREATE POLICY "Allow public access to chat_messages" ON public.chat_messages
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert to chat_messages" ON public.chat_messages
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public insert to conversations" ON public.conversations
    FOR INSERT WITH CHECK (true);
