package com.finapp.javabackend.model.entity; // Make sure this matches your project's package structure

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "simulation_runs")
public class SimulationRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Directly links the simulation to the user
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "run_date", nullable = false)
    private LocalDateTime runDate;

    // Stores the input config (savings rate, inflation toggle, etc.) as a JSON string
    @Column(name = "parameters", columnDefinition = "jsonb")
    private String parameters;

    // Stores the full 30-year Monte Carlo array from Python as a JSON string
    @Column(name = "results", columnDefinition = "jsonb")
    private String results;

    @Column(name = "ai_recommendation", columnDefinition = "TEXT")
    private String aiRecommendation;

    @PrePersist
    protected void onCreate() {
        this.runDate = LocalDateTime.now();
    }

    public SimulationRun() {}

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public LocalDateTime getRunDate() { return runDate; }
    public void setRunDate(LocalDateTime runDate) { this.runDate = runDate; }

    public String getParameters() { return parameters; }
    public void setParameters(String parameters) { this.parameters = parameters; }

    public String getResults() { return results; }
    public void setResults(String results) { this.results = results; }

    public String getAiRecommendation() { return aiRecommendation; }
    public void setAiRecommendation(String aiRecommendation) { this.aiRecommendation = aiRecommendation; }
}