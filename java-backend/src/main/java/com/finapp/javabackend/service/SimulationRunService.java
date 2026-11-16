package com.finapp.javabackend.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finapp.javabackend.dto.SimulationRunModels.*;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SimulationRunService {

    private final JdbcTemplate db;
    private final ObjectMapper json;

    public SimulationRunService(JdbcTemplate db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    private String title(String title) {
        if (
            title == null ||
            title.isBlank() ||
            title.trim().length() > 100 ||
            title.chars().anyMatch(c -> c < 32)
        ) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "Use a run name between 1 and 100 characters."
        );
        return title.trim();
    }

    private String encoded(JsonNode node, int limit) {
        if (node == null || !node.isObject()) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "A completed forecast and its inputs are required."
        );
        String value = node.toString();
        // Bounded stored JSON independently of the gateway's general request-body limit.
        if (
            value.getBytes(StandardCharsets.UTF_8).length > limit
        ) throw new ResponseStatusException(
            HttpStatus.PAYLOAD_TOO_LARGE,
            "This forecast is too large to save."
        );
        return value;
    }

    private double number(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (
            !value.isNumber() || !Double.isFinite(value.doubleValue())
        ) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "The forecast contains an invalid " + field + " value."
        );
        return value.doubleValue();
    }

    private Summary summary(ResultSet row, int ignored) throws SQLException {
        return new Summary(
            row.getString("id"),
            row.getString("title"),
            row.getString("kind"),
            row.getTimestamp("created_at").toInstant().toString(),
            row.getInt("years"),
            row.getDouble("p10"),
            row.getDouble("p50"),
            row.getDouble("p90")
        );
    }

    @Transactional
    public Detail save(long userId, Save request) {
        if (
            request == null ||
            !("monte_carlo".equals(request.kind()) || "markov".equals(request.kind()))
        ) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "Choose a completed Monte Carlo or Markov forecast."
        );
        String name = title(request.title());
        String inputs = encoded(request.inputs(), 262144),
            result = encoded(request.result(), 524288);
        JsonNode forecast = request.result(),
            input = request.inputs(),
            points = forecast.path(request.kind());
        int years = input.path("years").asInt(0);
        if (
            !"success".equals(forecast.path("status").asText()) ||
            forecast.path("model_version").asInt() != 3 ||
            !request.kind().equals(input.path("sim_type").asText()) ||
            !input.equals(forecast.path("inputs")) ||
            !input.path("years").isIntegralNumber() ||
            years < 1 ||
            years > 50 ||
            !points.isArray() ||
            points.size() != years + 1
        ) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "Save a complete forecast with matching inputs and yearly results."
        );
        // Validated every percentile row before it could become a durable or exportable snapshot.
        for (int year = 0; year < points.size(); year++) {
            JsonNode point = points.get(year);
            double low = number(point, "p10"),
                mid = number(point, "p50"),
                high = number(point, "p90");
            number(point, "reference");
            if (
                number(point, "year") != year || low > mid || mid > high
            ) throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Forecast years or percentiles are inconsistent."
            );
        }
        // Locked the owning account so simultaneous saves could not bypass the 100-run quota.
        db.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", Long.class, userId);
        if (
            db.queryForObject(
                "SELECT COUNT(*) FROM simulation_run_snapshots WHERE user_id = ?",
                Long.class,
                userId
            ) >= 100
        ) throw new ResponseStatusException(
            HttpStatus.CONFLICT,
            "Your history holds 100 runs. Delete a saved run before adding another."
        );
        String id = UUID.randomUUID().toString();
        JsonNode last = points.get(years);
        db.update(
            "INSERT INTO simulation_run_snapshots (id,user_id,title,kind,years,p10,p50,p90,inputs_json,result_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
            id,
            userId,
            name,
            request.kind(),
            years,
            number(last, "p10"),
            number(last, "p50"),
            number(last, "p90"),
            inputs,
            result
        );
        return get(userId, id);
    }

    @Transactional(readOnly = true)
    public Page list(long userId, int page, int size) {
        if (page < 0 || page > 100 || size < 1 || size > 25) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "Choose a valid history page."
        );
        // Selected only summary columns for paginated history rather than transferring every chart.
        var items = db.query(
            "SELECT id,title,kind,created_at,years,p10,p50,p90 FROM simulation_run_snapshots WHERE user_id = ? ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
            this::summary,
            userId,
            size,
            page * size
        );
        long count = db.queryForObject(
            "SELECT COUNT(*) FROM simulation_run_snapshots WHERE user_id = ?",
            Long.class,
            userId
        );
        return new Page(items, count, page, size);
    }

    @Transactional(readOnly = true)
    public Detail get(long userId, String id) {
        // Applied ownership in SQL for reads, renames, and deletes; IDs alone never granted access.
        var matches = db.query(
            "SELECT * FROM simulation_run_snapshots WHERE id = ? AND user_id = ?",
            (row, index) -> {
                try {
                    return new Detail(
                        summary(row, index),
                        json.readTree(row.getString("inputs_json")),
                        json.readTree(row.getString("result_json"))
                    );
                } catch (JsonProcessingException error) {
                    throw new IllegalStateException("Stored forecast could not be read.", error);
                }
            },
            id,
            userId
        );
        if (matches.isEmpty()) throw new ResponseStatusException(
            HttpStatus.NOT_FOUND,
            "Saved run not found."
        );
        return matches.get(0);
    }

    @Transactional
    public Summary rename(long userId, String id, String name) {
        if (
            db.update(
                "UPDATE simulation_run_snapshots SET title = ? WHERE id = ? AND user_id = ?",
                title(name),
                id,
                userId
            ) != 1
        ) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Saved run not found.");
        return get(userId, id).summary();
    }

    @Transactional
    public void delete(long userId, String id) {
        if (
            db.update(
                "DELETE FROM simulation_run_snapshots WHERE id = ? AND user_id = ?",
                id,
                userId
            ) != 1
        ) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Saved run not found.");
    }
}
