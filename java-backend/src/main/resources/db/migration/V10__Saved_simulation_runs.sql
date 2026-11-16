-- Retained immutable forecast inputs/results independently of editable scenario drafts.
-- Preserved the legacy simulation_runs table and its records without reinterpreting their format.
CREATE TABLE simulation_run_snapshots (
    id VARCHAR(36) PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('monte_carlo', 'markov')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    years INTEGER NOT NULL CHECK (years BETWEEN 1 AND 50),
    p10 DOUBLE PRECISION NOT NULL,
    p50 DOUBLE PRECISION NOT NULL,
    p90 DOUBLE PRECISION NOT NULL,
    inputs_json TEXT NOT NULL CHECK (octet_length(inputs_json) <= 262144),
    result_json TEXT NOT NULL CHECK (octet_length(result_json) <= 524288)
);
-- Indexed account-scoped chronological reads without exposing another user's snapshots.
CREATE INDEX idx_simulation_snapshots_owner_date ON simulation_run_snapshots(user_id, created_at DESC, id);
