package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.sql.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

// Required an explicitly configured test database and isolated all fixtures in a temporary schema.
@EnabledIfEnvironmentVariable(named = "FINAPP_TEST_DATABASE_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BudgetingMigrationTest {

    private Connection connection;
    private String schema;

    @BeforeAll
    void migrate() throws Exception {
        String url = System.getenv("FINAPP_TEST_DATABASE_URL");
        String user = System.getenv().getOrDefault("FINAPP_TEST_DATABASE_USER", "postgres");
        String password = System.getenv().getOrDefault("FINAPP_TEST_DATABASE_PASSWORD", "postgres");
        schema = "budget_review_" + UUID.randomUUID().toString().replace("-", "");
        connection = DriverManager.getConnection(url, user, password);
        Flyway.configure()
            .dataSource(url, user, password)
            .schemas(schema)
            .defaultSchema(schema)
            .target("4")
            .load()
            .migrate();
        // Verified the upgrade path from an already-applied V4 as well as earlier schema creation.
        Flyway.configure()
            .dataSource(url, user, password)
            .schemas(schema)
            .defaultSchema(schema)
            .load()
            .migrate();
        connection.setSchema(schema);
    }

    @AfterAll
    void cleanup() throws Exception {
        if (connection != null) {
            try (var statement = connection.createStatement()) {
                statement.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
            } finally {
                connection.close();
            }
        }
    }

    @Test
    void userVerificationCanUpdateAfterMigration() throws Exception {
        try (var statement = connection.createStatement()) {
            assertEquals(
                1,
                statement.executeUpdate("UPDATE users SET is_email_verified = true WHERE id = 1")
            );
            try (var result = statement.executeQuery("SELECT updated_at FROM users WHERE id = 1")) {
                assertTrue(result.next());
                assertNotNull(result.getTimestamp(1));
            }
        }
    }

    private long stock(String ticker) throws Exception {
        try (
            var statement = connection.prepareStatement(
                "INSERT INTO stocks(user_id,ticker,last_price) VALUES (1,?,30) RETURNING id"
            )
        ) {
            statement.setString(1, ticker);
            try (var result = statement.executeQuery()) {
                result.next();
                return result.getLong(1);
            }
        }
    }

    private void trade(
        long stock,
        String type,
        String quantity,
        String price,
        String fees,
        String date
    ) throws Exception {
        try (
            var statement = connection.prepareStatement(
                "INSERT INTO stock_transactions(user_id,stock_id,type,quantity,price_per_share,fees,transaction_date) " +
                    "VALUES (1,?,?::stock_txn_type,?,?,?,?::date)"
            )
        ) {
            statement.setLong(1, stock);
            statement.setString(2, type);
            statement.setBigDecimal(3, new BigDecimal(quantity));
            statement.setBigDecimal(4, new BigDecimal(price));
            statement.setBigDecimal(5, new BigDecimal(fees));
            statement.setString(6, date);
            statement.executeUpdate();
        }
    }

    private void position(long stock, String shares, String basis) throws Exception {
        try (
            var statement = connection.prepareStatement(
                "SELECT * FROM stock_positions WHERE stock_id=?"
            )
        ) {
            statement.setLong(1, stock);
            try (var result = statement.executeQuery()) {
                assertTrue(result.next());
                assertEquals(
                    0,
                    new BigDecimal(shares).compareTo(result.getBigDecimal("shares_owned"))
                );
                assertEquals(
                    0,
                    new BigDecimal(basis).compareTo(result.getBigDecimal("cost_basis"))
                );
                assertEquals(
                    0,
                    new BigDecimal(shares)
                        .multiply(new BigDecimal("30"))
                        .compareTo(result.getBigDecimal("market_value"))
                );
            }
        }
    }

    @Test
    void sellingThenRepurchasingStartsANewCostBasis() throws Exception {
        long stock = stock("REPURCHASE");
        trade(stock, "buy", "10", "10", "0", "2026-01-01");
        trade(stock, "sell", "10", "15", "0", "2026-02-01");
        trade(stock, "buy", "10", "20", "0", "2026-03-01");
        position(stock, "10", "200");
    }

    @Test
    void splitDoesNotMultiplyLaterPurchasesOrSales() throws Exception {
        long stock = stock("SPLIT");
        trade(stock, "buy", "10", "10", "0", "2026-01-01");
        trade(stock, "split", "2", "0", "0", "2026-02-01");
        trade(stock, "buy", "5", "20", "0", "2026-03-01");
        trade(stock, "sell", "5", "30", "0", "2026-04-01");
        position(stock, "20", "160");
    }

    @Test
    void backdatedTradesWereReplayedByDateAndBuyFeesWereRetained() throws Exception {
        long stock = stock("BACKDATE");
        trade(stock, "sell", "5", "20", "1", "2026-02-01");
        trade(stock, "buy", "10", "10", "2", "2026-01-01");
        position(stock, "5", "51");
    }

    @Test
    void stocksWithoutTradesHaveZeroHoldings() throws Exception {
        position(stock("EMPTY"), "0", "0");
    }
}
