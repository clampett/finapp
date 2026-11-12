package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.DriverManager;
import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

class GoogleIdentityMigrationTest {

    @Test
    void migrationPreservedLegacyAccountsAndEnforcedUniqueGoogleSubjects() throws Exception {
        try (
            var connection = DriverManager.getConnection(
                "jdbc:h2:mem:google_migration;MODE=PostgreSQL"
            );
            var statement = connection.createStatement()
        ) {
            statement.execute("CREATE TABLE users (id BIGINT PRIMARY KEY, username VARCHAR(50))");
            statement.execute("INSERT INTO users VALUES (1, 'existing'), (2, 'another')");
            ScriptUtils.executeSqlScript(
                connection,
                new ClassPathResource("db/migration/V9__Bind_google_account_identity.sql")
            );
            try (
                var rows = statement.executeQuery(
                    "SELECT COUNT(*) FROM users WHERE google_subject IS NULL"
                )
            ) {
                assertTrue(rows.next());
                assertEquals(2, rows.getInt(1));
            }
            statement.execute("UPDATE users SET google_subject='google-subject' WHERE id=1");
            assertThrows(SQLException.class, () ->
                statement.execute("UPDATE users SET google_subject='google-subject' WHERE id=2")
            );
        }
    }
}
