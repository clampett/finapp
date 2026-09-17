package com.finapp.javabackend.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "financial_profiles")
public class FinancialProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "profile_name", nullable = false, length = 50)
    private String profileName;

    @Column(name = "target_retirement_age")
    private Integer targetRetirementAge;

    @Column(name = "monthly_gross_income", precision = 12, scale = 2)
    private BigDecimal monthlyGrossIncome;

    public FinancialProfile() {}

    // Getters and Setters
    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getProfileName() { return profileName; }
    public void setProfileName(String profileName) { this.profileName = profileName; }
    public Integer getTargetRetirementAge() { return targetRetirementAge; }
    public void setTargetRetirementAge(Integer targetRetirementAge) { this.targetRetirementAge = targetRetirementAge; }
    public BigDecimal getMonthlyGrossIncome() { return monthlyGrossIncome; }
    public void setMonthlyGrossIncome(BigDecimal monthlyGrossIncome) { this.monthlyGrossIncome = monthlyGrossIncome; }
}