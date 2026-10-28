package com.finapp.javabackend.config;

import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.UserRepository;
import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Repeatable local fixture. This is a real database user, not a login bypass. */
@Component
@Profile("local")
@ConditionalOnProperty(name = "finapp.dev.seed-user", havingValue = "true")
public class LocalDevelopmentData implements ApplicationRunner {

    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final JdbcTemplate jdbc;

    public LocalDevelopmentData(
        UserRepository users,
        PasswordEncoder passwords,
        JdbcTemplate jdbc
    ) {
        this.users = users;
        this.passwords = passwords;
        this.jdbc = jdbc;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        // Restricted the public classroom fixture to the local profile and an
        // explicit property above; normal registration was never bypassed globally.
        User user = users.findByUsername("testuser").orElseGet(() -> {
            User fixture = new User();
            fixture.setUsername("testuser");
            fixture.setEmail("testuser@finapp.test");
            fixture.setPasswordHash(passwords.encode("test123"));
            fixture.setIsArchetype(false);
            fixture.setIsEmailVerified(true);
            return users.saveAndFlush(fixture);
        });
        if (
            user.getPasswordHash() == null || !passwords.matches("test123", user.getPasswordHash())
        ) {
            // Preserved an existing account's password instead of silently
            // replacing personal credentials with the known development password.
            throw new IllegalStateException(
                "Local testuser already exists with a different password. " +
                    "No account was overwritten. Rename that account before enabling the development fixture, " +
                    "or set FINAPP_DEV_SEED_USER=false and use its existing password."
            );
        }
        user.setIsEmailVerified(true);
        users.save(user);
        jdbc.update(
            "INSERT INTO financial_profiles (user_id, age, annual_income, risk_tolerance, target_retire_age) " +
                "VALUES (?, 23, 55000, 'MEDIUM', 65) ON CONFLICT (user_id) DO NOTHING",
            user.getId()
        );

        // Give a new workspace the Recent Grad scenario without modifying existing work.
        if (
            jdbc.queryForObject(
                "SELECT count(*) FROM financial_nodes WHERE user_id = ?",
                Long.class,
                user.getId()
            ) == 0
        ) {
            // Remapped copied node IDs before copying edges, so the development
            // account owned its graph rather than sharing the archetype's records.
            Map<Long, Long> ids = new HashMap<>();
            for (Long sourceId : jdbc.queryForList(
                "SELECT id FROM financial_nodes WHERE user_id = 1 ORDER BY id",
                Long.class
            )) {
                Long newId = jdbc.queryForObject(
                    "INSERT INTO financial_nodes " +
                        "(user_id, node_type, name, current_balance, interest_rate_apr) " +
                        "SELECT ?, node_type, name, current_balance, interest_rate_apr FROM financial_nodes WHERE id = ? RETURNING id",
                    Long.class,
                    user.getId(),
                    sourceId
                );
                ids.put(sourceId, newId);
            }
            for (Map<String, Object> edge : jdbc.queryForList(
                "SELECT e.* FROM node_edges e " +
                    "JOIN financial_nodes n ON n.id = e.source_node_id WHERE n.user_id = 1"
            )) {
                Long source = ids.get(((Number) edge.get("source_node_id")).longValue());
                Long target = ids.get(((Number) edge.get("target_node_id")).longValue());
                if (source != null && target != null) {
                    jdbc.update(
                        "INSERT INTO node_edges (source_node_id, target_node_id, percentage_flow, fixed_amount_flow) VALUES (?, ?, ?, ?)",
                        source,
                        target,
                        edge.get("percentage_flow"),
                        edge.get("fixed_amount_flow")
                    );
                }
            }
        }
        System.out.println(
            "[LOCAL DEVELOPMENT] Sign in: testuser / test123 (this computer's database)"
        );
    }
}
