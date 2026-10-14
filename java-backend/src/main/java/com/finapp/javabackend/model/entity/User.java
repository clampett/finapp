package com.finapp.javabackend.model.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

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

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "net_worth", nullable = false)
    private BigDecimal netWorth;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "financial_nodes", columnDefinition = "jsonb")
    private Map<Long, FinancialNode> financialNodes;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public User(String username, String email) {
        this.username = username;
        this.email = email;
        this.financialNodes = new HashMap<>();

        updateNetWorth();
    }

    public void addFinancialNode(FinancialNode fn) {
        netWorth.add(fn.getAmountOrBalance());
        financialNodes.put(fn.getId(), fn);
    }

    public boolean removeFinancialNode(String name) {
        for(FinancialNode fn : financialNodes.values()) {
            if(fn.getName().equals(name)) {
                financialNodes.remove(fn.getId());
                return true;
            }
        }

        return false;
    }

    public boolean removeFinancialNode(long id) {
        for(FinancialNode fn : financialNodes.values()) {
            if(fn.getId() == id) {
                financialNodes.remove(id);
                return true;
            }
        }

        return false;
    }

    public void updateNetWorth() {
        BigDecimal newNetWorth = new BigDecimal(0);

        for(FinancialNode fn : financialNodes.values()) {
            newNetWorth.add(fn.getAmountOrBalance());
        }

        netWorth = newNetWorth;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public BigDecimal getNetWorth() { return netWorth; }
    public void setNetWorth(BigDecimal netWorth) { this.netWorth = netWorth; }
    public Map<Long, FinancialNode> getFinancialNodes() { return financialNodes; }

    public String getNetWorthString() { return netWorth.toString(); }
}