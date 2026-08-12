-- Run this SQL in the Supabase SQL Editor to create the passages table
-- Go to: https://supabase.com/dashboard → your project → SQL Editor

CREATE TABLE IF NOT EXISTS passages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  en TEXT NOT NULL,
  zh TEXT NOT NULL,
  source TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  difficulty TEXT NOT NULL DEFAULT 'advanced',
  word_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE passages ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read" ON passages
  FOR SELECT USING (true);

-- Allow insert via service role only (for the daily generation script)
CREATE POLICY "Allow service insert" ON passages
  FOR INSERT WITH CHECK (true);

-- Create an index for date-based queries
CREATE INDEX IF NOT EXISTS idx_passages_created_at ON passages(created_at DESC);

-- Create an index for full-text search
CREATE INDEX IF NOT EXISTS idx_passages_tags ON passages USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_passages_title_trgm ON passages USING GIN(title gin_trgm_ops);

-- Enable full-text search extension (run once)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- To enable full-text search on the en and zh columns, add these indexes:
CREATE INDEX IF NOT EXISTS idx_passages_en_search ON passages USING GIN(to_tsvector('english', en));
