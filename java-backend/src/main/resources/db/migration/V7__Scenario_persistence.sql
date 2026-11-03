-- Assigned each scenario to one user and enforced unique names within that account.
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

-- Backfilled a default scenario for every existing user before assigning their nodes.
INSERT INTO scenarios (user_id, name) SELECT id, 'Default' FROM users;

-- Created a default scenario for users registered after the backfill.
CREATE FUNCTION create_default_user_scenario() RETURNS trigger LANGUAGE plpgsql AS $scenario$
BEGIN
    INSERT INTO scenarios (user_id, name) VALUES (NEW.id, 'Default');
    RETURN NEW;
END;
$scenario$;
CREATE TRIGGER trg_users_default_scenario AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_default_user_scenario();

-- Assigned each legacy node to its owner’s default scenario and reserved paired canvas coordinates.
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

-- Preserved invalid legacy edges for inspection without exposing them in any user graph.
CREATE TABLE scenario_migration_rejected_edges (
    edge_id BIGINT PRIMARY KEY,
    edge_data JSONB NOT NULL
);
WITH rejected AS (
    DELETE FROM node_edges e
    USING financial_nodes source, financial_nodes target
    WHERE e.source_node_id = source.id AND e.target_node_id = target.id
      AND source.scenario_id <> target.scenario_id
    RETURNING e.*
)
INSERT INTO scenario_migration_rejected_edges (edge_id, edge_data)
SELECT id, to_jsonb(rejected) FROM rejected;

-- Bound both edge endpoints to the same scenario.
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
