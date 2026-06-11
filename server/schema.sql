-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(20) DEFAULT 'player',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  arena VARCHAR(50) NOT NULL,
  format VARCHAR(50) NOT NULL,
  max_players INT NOT NULL,
  entry_fee INT NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tournament Registrations
CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  paystack_ref VARCHAR(255) UNIQUE,
  payment_status VARCHAR(20) DEFAULT 'pending',
  registered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tournament_id, user_id)
);

-- Brackets / Standings
CREATE TABLE IF NOT EXISTS bracket_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  points INT DEFAULT 0,
  wins INT DEFAULT 0,
  draws INT DEFAULT 0,
  losses INT DEFAULT 0,
  goals_for INT DEFAULT 0,
  goals_against INT DEFAULT 0,
  goal_diff INT GENERATED ALWAYS AS (goals_for - goals_against) STORED,
  round INT DEFAULT 1,
  eliminated BOOLEAN DEFAULT FALSE,
  UNIQUE(tournament_id, user_id)
);

-- Match Results
CREATE TABLE IF NOT EXISTS match_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id),
  submitter_id UUID REFERENCES users(id),
  opponent_id UUID REFERENCES users(id),
  submitter_score INT NOT NULL,
  opponent_score INT NOT NULL,
  screenshot_path VARCHAR(500),
  ai_verified BOOLEAN DEFAULT FALSE,
  ai_result JSONB,
  admin_approved BOOLEAN DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  submitted_at TIMESTAMP DEFAULT NOW()
);

-- Match Codes
CREATE TABLE IF NOT EXISTS match_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  code VARCHAR(20) NOT NULL,
  note TEXT,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(128) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Admin Invites
CREATE TABLE IF NOT EXISTS admin_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  token VARCHAR(128) UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id),
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Streams
CREATE TABLE IF NOT EXISTS streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id),
  title VARCHAR(255),
  platform VARCHAR(50) DEFAULT 'internal',
  stream_url TEXT,
  is_live BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Player Bank Accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  account_number VARCHAR(20) NOT NULL,
  bank_code VARCHAR(20) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  recipient_code VARCHAR(100),
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tournament Prize Pools
CREATE TABLE IF NOT EXISTS prize_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE UNIQUE,
  positions JSONB NOT NULL DEFAULT '{}',
  total_amount INT DEFAULT 0,
  platform_cut_pct INT DEFAULT 10,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Payouts
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id),
  user_id UUID REFERENCES users(id),
  position INT NOT NULL,
  amount INT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  transfer_code VARCHAR(100),
  transfer_reference VARCHAR(100),
  failure_reason TEXT,
  initiated_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP,
  UNIQUE(tournament_id, user_id)
);

-- Match Fixtures (scheduled matches with date/time)
CREATE TABLE IF NOT EXISTS fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  scheduled_at TIMESTAMP NOT NULL,
  round_label VARCHAR(100),
  match_code VARCHAR(20),
  status VARCHAR(20) DEFAULT 'scheduled',
  reminder_sent BOOLEAN DEFAULT FALSE,
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- In-app Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  link VARCHAR(500),
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  arena VARCHAR(50),
  type VARCHAR(30) DEFAULT 'news',
  pinned BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Match Disputes
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_result_id UUID REFERENCES match_results(id),
  tournament_id UUID REFERENCES tournaments(id),
  raised_by UUID REFERENCES users(id),
  reason TEXT NOT NULL,
  evidence_path VARCHAR(500),
  status VARCHAR(20) DEFAULT 'open',
  admin_note TEXT,
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_registrations_tournament ON registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_bracket_tournament ON bracket_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_match_tournament ON match_results(tournament_id);
CREATE INDEX IF NOT EXISTS idx_bracket_user ON bracket_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_invite_token ON admin_invites(token);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user ON bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_payouts_tournament ON payouts(tournament_id);
CREATE INDEX IF NOT EXISTS idx_payouts_user ON payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_fixtures_tournament ON fixtures(tournament_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_players ON fixtures(player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_disputes_tournament ON disputes(tournament_id);
