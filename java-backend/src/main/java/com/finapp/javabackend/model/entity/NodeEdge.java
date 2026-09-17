package com.finapp.javabackend.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "node_edges")
public class NodeEdge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_node_id", nullable = false)
    private FinancialNode sourceNode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_node_id", nullable = false)
    private FinancialNode targetNode;

    @Column(name = "percentage_flow", precision = 5, scale = 2)
    private BigDecimal percentageFlow;

    @Column(name = "fixed_amount_flow", precision = 12, scale = 2)
    private BigDecimal fixedAmountFlow;

    public NodeEdge() {}

    // Getters and Setters
    public Long getId() { return id; }
    public FinancialNode getSourceNode() { return sourceNode; }
    public void setSourceNode(FinancialNode sourceNode) { this.sourceNode = sourceNode; }
    public FinancialNode getTargetNode() { return targetNode; }
    public void setTargetNode(FinancialNode targetNode) { this.targetNode = targetNode; }
    public BigDecimal getPercentageFlow() { return percentageFlow; }
    public void setPercentageFlow(BigDecimal percentageFlow) { this.percentageFlow = percentageFlow; }
    public BigDecimal getFixedAmountFlow() { return fixedAmountFlow; }
    public void setFixedAmountFlow(BigDecimal fixedAmountFlow) { this.fixedAmountFlow = fixedAmountFlow; }
}