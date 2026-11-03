-- Scenarios: each user owns many named scenarios
CREATE TABLE scenarios (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    assumptions JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, user_id),
    CHECK (LENGTH(BTRIM(name)) BETWEEN 1 AND 100),
    CHECK (jsonb_typeof(assumptions) = 'object')
);
CREATE UNIQUE INDEX uq_scenarios_user_name ON scenarios (user_id, LOWER(name));
CREATE TRIGGER trg_scenarios_updated BEFORE UPDATE ON scenarios
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Preserve existing data: every current user gets a Default scenario
INSERT INTO scenarios (user_id, name) SELECT id, 'Default' FROM users;

-- Nodes move under a scenario and gain canvas positions
ALTER TABLE financial_nodes
    ADD COLUMN scenario_id BIGINT,
    ADD COLUMN pos_x DOUBLE PRECISION,
    ADD COLUMN pos_y DOUBLE PRECISION;

UPDATE financial_nodes n SET scenario_id = s.id
FROM scenarios s WHERE s.user_id = n.user_id;

ALTER TABLE financial_nodes
    ALTER COLUMN scenario_id SET NOT NULL,
    ADD CONSTRAINT fk_nodes_scenario FOREIGN KEY (scenario_id, user_id)
        REFERENCES scenarios(id, user_id) ON DELETE CASCADE,
    ADD CONSTRAINT uq_nodes_id_scenario UNIQUE (id, scenario_id),
    ADD CONSTRAINT chk_nodes_position CHECK ((pos_x IS NULL) = (pos_y IS NULL));
CREATE INDEX idx_nodes_scenario ON financial_nodes (scenario_id);

-- Edges can only connect nodes inside the same scenario
ALTER TABLE node_edges ADD COLUMN scenario_id BIGINT;

UPDATE node_edges e SET scenario_id = n.scenario_id
FROM financial_nodes n WHERE n.id = e.source_node_id;

ALTER TABLE node_edges
    ALTER COLUMN scenario_id SET NOT NULL,
    ADD CONSTRAINT fk_edges_source_scenario FOREIGN KEY (source_node_id, scenario_id)
        REFERENCES financial_nodes(id, scenario_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_edges_target_scenario FOREIGN KEY (target_node_id, scenario_id)
        REFERENCES financial_nodes(id, scenario_id) ON DELETE CASCADE;
CREATE INDEX idx_edges_scenario ON node_edges (scenario_id);
