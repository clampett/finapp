-- =========================================================
-- V2__Seed_archetypes.sql — Pre-Loaded Demo Archetypes (DML)
-- =========================================================

-- ---------- Archetype 1: Recent Grad with Loans ----------
INSERT INTO users (id, username, email, password_hash, is_archetype)
VALUES (1, 'recent_grad', 'grad@example.com', NULL, TRUE);

INSERT INTO financial_profiles (user_id, age, annual_income, risk_tolerance, target_retire_age)
VALUES (1, 23, 55000.00, 'MEDIUM', 65);

INSERT INTO financial_nodes (id, user_id, node_type, name, current_balance, interest_rate_apr) VALUES
                                                                                                   (1, 1, 'INCOME',     'Salary',            4583.33,  0),
                                                                                                   (2, 1, 'CHECKING',   'Checking Account',  1800.00,  0),
                                                                                                   (3, 1, 'EXPENSE',    'Rent',              1400.00,  0),
                                                                                                   (4, 1, 'DEBT',       'Student Loan A',    22000.00, 5.80),
                                                                                                   (5, 1, 'DEBT',       'Student Loan B',    8000.00,  3.40),
                                                                                                   (6, 1, 'INVESTMENT', 'Roth IRA',          1200.00,  7.00);

INSERT INTO node_edges (source_node_id, target_node_id, fixed_amount_flow) VALUES
                                                                               (1, 2, 4583.33),
                                                                               (2, 3, 1400.00),
                                                                               (2, 4, 300.00),
                                                                               (2, 5, 150.00),
                                                                               (2, 6, 200.00);

-- ---------- Archetype 2: Mid-Career Family ----------
INSERT INTO users (id, username, email, password_hash, is_archetype)
VALUES (2, 'midcareer_family', 'family@example.com', NULL, TRUE);

INSERT INTO financial_profiles (user_id, age, annual_income, risk_tolerance, target_retire_age)
VALUES (2, 41, 135000.00, 'MEDIUM', 62);

INSERT INTO financial_nodes (id, user_id, node_type, name, current_balance, interest_rate_apr) VALUES
                                                                                                   (7,  2, 'INCOME',     'Salary',             11250.00, 0),
                                                                                                   (8,  2, 'CHECKING',   'Checking Account',   6200.00,  0),
                                                                                                   (9,  2, 'EXPENSE',    'Mortgage',           2800.00,  0),
                                                                                                   (10, 2, 'EXPENSE',    'Childcare & Misc',   1800.00,  0),
                                                                                                   (11, 2, 'DEBT',       'Auto Loan',          14000.00, 4.90),
                                                                                                   (12, 2, 'INVESTMENT', '401k',               88000.00, 6.50),
                                                                                                   (13, 2, 'SAVINGS',    'College Fund (529)', 15000.00, 2.00);

INSERT INTO node_edges (source_node_id, target_node_id, fixed_amount_flow) VALUES
                                                                               (7,  8,  11250.00),
                                                                               (8,  9,  2800.00),
                                                                               (8,  10, 1800.00),
                                                                               (8,  11, 450.00),
                                                                               (8,  12, 1100.00),
                                                                               (8,  13, 300.00);

-- ---------- Archetype 3: FIRE Strategist ----------
INSERT INTO users (id, username, email, password_hash, is_archetype)
VALUES (3, 'fire_strategist', 'fire@example.com', NULL, TRUE);

INSERT INTO financial_profiles (user_id, age, annual_income, risk_tolerance, target_retire_age)
VALUES (3, 29, 98000.00, 'HIGH', 40);

INSERT INTO financial_nodes (id, user_id, node_type, name, current_balance, interest_rate_apr) VALUES
                                                                                                   (14, 3, 'INCOME',     'Salary',               8166.67,  0),
                                                                                                   (15, 3, 'CHECKING',   'Checking Account',     2500.00,  0),
                                                                                                   (16, 3, 'EXPENSE',    'Living Expenses',      2200.00,  0),
                                                                                                   (17, 3, 'INVESTMENT', 'Index Fund Brokerage', 72000.00, 8.00),
                                                                                                   (18, 3, 'INVESTMENT', '401k',                 45000.00, 6.50),
                                                                                                   (19, 3, 'SAVINGS',    'Emergency Fund',       20000.00, 1.50);

INSERT INTO node_edges (source_node_id, target_node_id, fixed_amount_flow) VALUES
                                                                               (14, 15, 8166.67),
                                                                               (15, 16, 2200.00);

INSERT INTO node_edges (source_node_id, target_node_id, percentage_flow) VALUES
                                                                             (15, 17, 50.00),
                                                                             (15, 18, 20.00),
                                                                             (15, 19, 5.00);

-- Fast-forward sequences so newly registered users & nodes don't collide with seed IDs
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));
SELECT setval(pg_get_serial_sequence('financial_nodes', 'id'), (SELECT MAX(id) FROM financial_nodes));