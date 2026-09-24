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

    private BigDecimal monthlyFixedFlow;
    private BigDecimal percentageFlow;

    public NodeEdge() {}

    public NodeEdge(FinancialNode sourceNode, FinancialNode targetNode, BigDecimal monthlyFixedFlow, BigDecimal percentageFlow) {
        this.sourceNode = sourceNode;
        this.targetNode = targetNode;
        this.monthlyFixedFlow = monthlyFixedFlow;
        this.percentageFlow = percentageFlow;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public FinancialNode getSourceNode() { return sourceNode; }
    public void setSourceNode(FinancialNode sourceNode) { this.sourceNode = sourceNode; }

    public FinancialNode getTargetNode() { return targetNode; }
    public void setTargetNode(FinancialNode targetNode) { this.targetNode = targetNode; }

    public BigDecimal getMonthlyFixedFlow() { return monthlyFixedFlow; }
    public void setMonthlyFixedFlow(BigDecimal monthlyFixedFlow) { this.monthlyFixedFlow = monthlyFixedFlow; }

    public BigDecimal getPercentageFlow() { return percentageFlow; }
    public void setPercentageFlow(BigDecimal percentageFlow) { this.percentageFlow = percentageFlow; }
}