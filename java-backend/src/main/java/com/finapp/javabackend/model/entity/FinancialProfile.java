package com.finapp.javabackend.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "financial_profiles")
public class FinancialProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // The database schema enforces UNIQUE on user_id, making this a 1-to-1 relationship
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(name = "age")
    private Integer age;

    @Column(name = "annual_income", precision = 14, scale = 2)
    private BigDecimal annualIncome;

    @Column(name = "risk_tolerance", length = 20)
    private String riskTolerance;

    @Column(name = "target_retire_age")
    private Integer targetRetireAge;

    public FinancialProfile() {}

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public Integer getAge() { return age; }
    public void setAge(Integer age) { this.age = age; }

    public BigDecimal getAnnualIncome() { return annualIncome; }
    public void setAnnualIncome(BigDecimal annualIncome) { this.annualIncome = annualIncome; }

    public String getRiskTolerance() { return riskTolerance; }
    public void setRiskTolerance(String riskTolerance) { this.riskTolerance = riskTolerance; }

    public Integer getTargetRetireAge() { return targetRetireAge; }
    public void setTargetRetireAge(Integer targetRetireAge) { this.targetRetireAge = targetRetireAge; }
}