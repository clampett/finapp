package com.finapp.javabackend.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "financial_nodes")
public class FinancialNode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id", nullable = false)
    private FinancialProfile profile;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "node_type", nullable = false, length = 30)
    private NodeType nodeType;

    @Column(name = "current_balance", precision = 12, scale = 2)
    private BigDecimal currentBalance;

    @Column(name = "interest_rate_apr", precision = 5, scale = 2)
    private BigDecimal interestRateApr;

    public FinancialNode() {}

    // Getters and Setters
    public Long getId() { return id; }
    public FinancialProfile getProfile() { return profile; }
    public void setProfile(FinancialProfile profile) { this.profile = profile; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public NodeType getNodeType() { return nodeType; }
    public void setNodeType(NodeType nodeType) { this.nodeType = nodeType; }
    public BigDecimal getCurrentBalance() { return currentBalance; }
    public void setCurrentBalance(BigDecimal currentBalance) { this.currentBalance = currentBalance; }
    public BigDecimal getInterestRateApr() { return interestRateApr; }
    public void setInterestRateApr(BigDecimal interestRateApr) { this.interestRateApr = interestRateApr; }
}