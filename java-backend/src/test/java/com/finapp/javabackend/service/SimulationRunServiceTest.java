package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finapp.javabackend.dto.SimulationRunModels.Save;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.web.server.ResponseStatusException;

class SimulationRunServiceTest {

    private SimulationRunService service;
    private JdbcTemplate db;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void prepare() throws Exception {
        var source = new SingleConnectionDataSource(
            "jdbc:h2:mem:runs" + UUID.randomUUID() + ";MODE=PostgreSQL",
            "sa",
            "",
            true
        );
        db = new JdbcTemplate(source);
        db.execute("CREATE TABLE users (id BIGINT PRIMARY KEY)");
        db.update("INSERT INTO users VALUES (1), (2)");
        db.execute(
            "CREATE TABLE simulation_runs (id BIGINT PRIMARY KEY, legacy_result VARCHAR(100))"
        );
        db.update("INSERT INTO simulation_runs VALUES (1, 'unchanged legacy result')");
        // Executed the actual migration so schema constraints were covered with the service behavior.
        ScriptUtils.executeSqlScript(
            source.getConnection(),
            new ClassPathResource("db/migration/V10__Saved_simulation_runs.sql")
        );
        service = new SimulationRunService(db, mapper);
    }

    private Save request() throws Exception {
        var inputs = mapper.readTree(
            "{\"years\":1,\"sim_type\":\"monte_carlo\",\"inflation_rate\":0}"
        );
        var result = mapper.readTree(
            "{\"status\":\"success\",\"model_version\":3,\"monte_carlo\":[{\"year\":0,\"p10\":0,\"p50\":0,\"p90\":0,\"reference\":0},{\"year\":1,\"p10\":-100,\"p50\":200,\"p90\":400,\"reference\":100}]}"
        );
        ((com.fasterxml.jackson.databind.node.ObjectNode) result).set("inputs", inputs);
        return new Save("First what-if", "monte_carlo", inputs, result);
    }

    @Test
    void preservedLegacySimulationRecords() {
        assertEquals(
            "unchanged legacy result",
            db.queryForObject(
                "SELECT legacy_result FROM simulation_runs WHERE id = 1",
                String.class
            )
        );
    }

    @Test
    void savedListedReopenedRenamedAndDeletedImmutableForecast() throws Exception {
        var saved = service.save(1, request());
        assertEquals(200, saved.summary().p50());
        assertEquals(1, service.list(1, 0, 12).total());
        assertEquals(request().inputs(), service.get(1, saved.summary().id()).inputs());
        assertEquals("New title", service.rename(1, saved.summary().id(), "New title").title());
        assertEquals(request().result(), service.get(1, saved.summary().id()).result());
        service.delete(1, saved.summary().id());
        assertEquals(0, service.list(1, 0, 12).total());
    }

    @Test
    void blockedCrossAccountReadsRenamesAndDeletes() throws Exception {
        var id = service.save(1, request()).summary().id();
        assertEquals(0, service.list(2, 0, 12).total());
        for (Runnable action : java.util.List.<Runnable>of(
            () -> service.get(2, id),
            () -> service.rename(2, id, "Stolen"),
            () -> service.delete(2, id)
        )) {
            assertEquals(
                404,
                assertThrows(ResponseStatusException.class, action::run).getStatusCode().value()
            );
        }
        assertEquals(1, service.list(1, 0, 12).total());
    }

    @Test
    void rejectedIncompleteMismatchedAndOversizedResults() throws Exception {
        var original = request();
        assertThrows(ResponseStatusException.class, () ->
            service.save(1, new Save("", original.kind(), original.inputs(), original.result()))
        );
        assertThrows(ResponseStatusException.class, () ->
            service.save(1, new Save("Bad", "debt", original.inputs(), original.result()))
        );
        ((com.fasterxml.jackson.databind.node.ObjectNode) original.inputs()).put("years", 2);
        assertThrows(ResponseStatusException.class, () -> service.save(1, original));
        var oversized = request();
        ((com.fasterxml.jackson.databind.node.ObjectNode) oversized.result()).put(
            "oversized",
            "x".repeat(524289)
        );
        assertEquals(
            413,
            assertThrows(ResponseStatusException.class, () -> service.save(1, oversized))
                .getStatusCode()
                .value()
        );
        assertThrows(ResponseStatusException.class, () -> service.list(1, -1, 12));
    }

    @Test
    void treatedSqlInjectionAsTitleTextAndEnforcedQuota() throws Exception {
        var original = request();
        var title = "'; DROP TABLE simulation_runs; --";
        assertEquals(
            title,
            service
                .save(1, new Save(title, original.kind(), original.inputs(), original.result()))
                .summary()
                .title()
        );
        for (int i = 1; i < 100; i++) service.save(1, request());
        assertEquals(
            409,
            assertThrows(ResponseStatusException.class, () -> service.save(1, request()))
                .getStatusCode()
                .value()
        );
        assertEquals(100, service.list(1, 0, 25).total());
    }
}
