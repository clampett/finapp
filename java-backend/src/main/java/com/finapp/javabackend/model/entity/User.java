package com.finapp.javabackend.model.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String username;

    @Column(nullable = false, unique = true, length = 100)
    private String email;

    // For password storage - we'll need to include this field for Spring Security
    @Column(length = 255)  
    private String password;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "net_worth", nullable = false)
    private BigDecimal netWorth;

    // Note: Removed financialNodes field as nodes are stored in separate table for each user
    // This field does not match the database schema (no financial_nodes column in users table)

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public User(String username, String email) {
        this.username = username;
        this.email = email;
        // Initialize netWorth to zero for new user 
        this.netWorth = BigDecimal.ZERO;
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public BigDecimal getNetWorth() { return netWorth; }
    public void setNetWorth(BigDecimal netWorth) { this.netWorth = netWorth; }

    public String getNetWorthString() { return netWorth.toString(); }
}