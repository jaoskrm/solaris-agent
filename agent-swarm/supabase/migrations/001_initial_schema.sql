-- Solaris-Agent Supabase Schema
-- Cross-engagement persistent storage

-- ===========================================
-- ENGAGEMENTS TABLE
-- ===========================================
-- Stores metadata about each pentest engagement
-- Written by: Commander (on swarm_complete)
-- Read by: All agents (on start)

CREATE TABLE IF NOT EXISTS engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  scope TEXT[] NOT NULL,
  out_of_scope TEXT[] DEFAULT '{}',
  tech_stack TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'complete', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_engagements_status ON engagements(status);
CREATE INDEX idx_engagements_target ON engagements(target_url);

-- ===========================================
-- CROSS_ENGAGEMENT_LESSONS TABLE
-- ===========================================
-- Persistent lessons learned across engagements
-- Keyed by stack fingerprint for retrieval
-- Written by: Critic (on swarm_complete)
-- Read by: OSINT (on engagement start)

CREATE TABLE IF NOT EXISTS cross_engagement_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Stack fingerprint for matching
  stack_fingerprint JSONB NOT NULL,
  /*
    Example:
    {
      "framework": ["express", "react"],
      "auth_type": "jwt",
      "db_hints": ["postgresql", "redis"],
      "server": "nginx"
    }
  */
  
  -- Engagement context
  engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL,
  engagement_name TEXT,
  
  -- Lesson content
  target_class TEXT NOT NULL,  -- e.g., 'sql_injection', 'xss', 'idor'
  exploit_type TEXT NOT NULL,  -- e.g., 'boolean_based_sqli', 'stored_xss'
  failure_class TEXT,         -- e.g., 'waf_blocked', 'auth_required'
  successful_payload TEXT,
  delta TEXT,                  -- What changed/worked after failure
  reusable BOOLEAN NOT NULL DEFAULT true,
  tags TEXT[] DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_lessons_fingerprint ON cross_engagement_lessons USING GIN(stack_fingerprint);
CREATE INDEX idx_lessons_target_class ON cross_engagement_lessons(target_class);
CREATE INDEX idx_lessons_tags ON cross_engagement_lessons USING GIN(tags);
CREATE INDEX idx_lessons_engagement ON cross_engagement_lessons(engagement_id);

-- ===========================================
-- RUN_REPORTS TABLE
-- ===========================================
-- Final pentest reports
-- Written by: Report Agent (on swarm_complete)
-- Read by: External systems

CREATE TABLE IF NOT EXISTS run_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID REFERENCES engagements(id) ON DELETE CASCADE,
  
  -- Report content
  summary JSONB NOT NULL,
  /*
    Example:
    {
      "mission_count": 50,
      "success_count": 12,
      "failure_count": 8,
      "duration_ms": 3600000,
      "total_findings": 45,
      "critical_findings": 3,
      "high_findings": 10
    }
  */
  
  findings JSONB DEFAULT '[]',
  credentials_discovered JSONB DEFAULT '[]',
  attack_chains_completed JSONB DEFAULT '[]',
  
  -- Report metadata
  format TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'md', 'html')),
  version TEXT NOT NULL DEFAULT '1.0',
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'final')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_engagement ON run_reports(engagement_id);
CREATE INDEX idx_reports_status ON run_reports(status);

-- ===========================================
-- TARGET_CONFIGS TABLE
-- ===========================================
-- Target configuration history
-- Written by: Commander (on init)
-- Read by: All agents (on start)

CREATE TABLE IF NOT EXISTS target_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID REFERENCES engagements(id) ON DELETE CASCADE,
  
  -- Target identification
  target_url TEXT NOT NULL,
  target_name TEXT,
  
  -- Configuration
  config JSONB NOT NULL,
  /*
    Example:
    {
      "scope": ["api.example.com", "app.example.com"],
      "out_of_scope": ["dev.example.com"],
      "auth_config": {
        "type": "jwt",
        "token_endpoint": "https://api.example.com/auth/token"
      },
      "rate_limits": {
        "default": "100/min",
        "api": "1000/min"
      }
    }
  */
  
  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_target_configs_engagement ON target_configs(engagement_id);
CREATE INDEX idx_target_configs_target ON target_configs(target_url);
CREATE INDEX idx_target_configs_active ON target_configs(is_active);

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Function to search lessons by stack fingerprint similarity
CREATE OR REPLACE FUNCTION search_lessons_by_stack(
  p_stack_fingerprint JSONB,
  p_target_class TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS SETOF cross_engagement_lessons AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM cross_engagement_lessons
  WHERE 
    target_class = p_target_class
    AND (
      -- Match at least one framework
      stack_fingerprint->'framework' @> p_stack_fingerprint->'framework'
      OR stack_fingerprint->'framework' <@ p_stack_fingerprint->'framework'
    )
    AND reusable = true
  ORDER BY 
    use_count ASC,
    created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to update lesson usage stats
CREATE OR REPLACE FUNCTION record_lesson_use(p_lesson_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE cross_engagement_lessons
  SET 
    use_count = use_count + 1,
    last_used_at = NOW()
  WHERE id = p_lesson_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- ROW LEVEL SECURITY (RLS)
-- ===========================================

ALTER TABLE engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_engagement_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE target_configs ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (configure as needed for production)
-- In production, you'd want policies based on user roles

CREATE POLICY "Allow all for engagements" ON engagements FOR ALL USING (true);
CREATE POLICY "Allow all for lessons" ON cross_engagement_lessons FOR ALL USING (true);
CREATE POLICY "Allow all for reports" ON run_reports FOR ALL USING (true);
CREATE POLICY "Allow all for target configs" ON target_configs FOR ALL USING (true);
