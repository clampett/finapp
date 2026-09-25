package com.finapp.javabackend.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "financial_nodes")
public class FinancialNode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "profile_id")
    private Long profileId;

    public Long getProfileId() {
        return profileId;
    }

    public void setProfileId(Long profileId) {
        this.profileId = profileId;
    }

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String nodeType; // e.g. "INCOME", "CHECKING", "SAVINGS", "DEBT", "INVESTMENT"

    @Column(nullable = false)
    private BigDecimal amountOrBalance;

    private BigDecimal interestRateApr;

    public FinancialNode() {}

    public FinancialNode(String name, String nodeType, BigDecimal amountOrBalance, BigDecimal interestRateApr) {
        this.name = name;
        this.nodeType = nodeType;
        this.amountOrBalance = amountOrBalance;
        this.interestRateApr = interestRateApr;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getNodeType() { return nodeType; }
    public void setNodeType(String nodeType) { this.nodeType = nodeType; }

    public BigDecimal getAmountOrBalance() { return amountOrBalance; }
    public void setAmountOrBalance(BigDecimal amountOrBalance) { this.amountOrBalance = amountOrBalance; }

    public BigDecimal getInterestRateApr() { return interestRateApr; }
    public void setInterestRateApr(BigDecimal interestRateApr) { this.interestRateApr = interestRateApr; }
}