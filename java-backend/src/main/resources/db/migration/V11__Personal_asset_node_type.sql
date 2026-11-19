-- Extended the existing node-type constraint without rewriting released migrations.
-- Retained personal property as a distinct balance type rather than recurring income.
ALTER TABLE financial_nodes DROP CONSTRAINT financial_nodes_node_type_check;
ALTER TABLE financial_nodes ADD CONSTRAINT financial_nodes_node_type_check
    CHECK (node_type IN ('INCOME', 'CHECKING', 'SAVINGS', 'INVESTMENT', 'DEBT', 'EXPENSE', 'ASSET'));
