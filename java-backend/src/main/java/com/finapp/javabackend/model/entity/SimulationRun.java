package com.finapp.javabackend.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "simulation_runs")
public class SimulationRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id", nullable = false)
    private FinancialProfile profile;

    @Column(name = "ran_at", nullable = false)
    private LocalDateTime ranAt;

    @Column(name = "p10_net_worth", precision = 12, scale = 2)
    private BigDecimal p10NetWorth;

    @Column(name = "p50_net_worth", precision = 12, scale = 2)
    private BigDecimal p50NetWorth;

    @Column(name = "p90_net_worth", precision = 12, scale = 2)
    private BigDecimal p90NetWorth;

    @Column(name = "ai_recommendation", columnDefinition = "TEXT")
    private String aiRecommendation;

    @PrePersist
    protected void onCreate() {
        this.ranAt = LocalDateTime.now();
    }

    public SimulationRun() {}

    // Getters and Setters
    public Long getId() { return id; }
    public FinancialProfile getProfile() { return profile; }
    public void setProfile(FinancialProfile profile) { this.profile = profile; }
    public LocalDateTime getRanAt() { return ranAt; }
    public BigDecimal getP10NetWorth() { return p10NetWorth; }
    public void setP10NetWorth(BigDecimal p10NetWorth) { this.p10NetWorth = p10NetWorth; }
    public BigDecimal getP50NetWorth() { return p50NetWorth; }
    public void setP50NetWorth(BigDecimal p50NetWorth) { this.p50NetWorth = p50NetWorth; }
    public BigDecimal getP90NetWorth() { return p90NetWorth; }
    public void setP90NetWorth(BigDecimal p90NetWorth) { this.p90NetWorth = p90NetWorth; }
    public String getAiRecommendation() { return aiRecommendation; }
    public void setAiRecommendation(String aiRecommendation) { this.aiRecommendation = aiRecommendation; }
}