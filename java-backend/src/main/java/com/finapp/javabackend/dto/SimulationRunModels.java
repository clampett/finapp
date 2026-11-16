package com.finapp.javabackend.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

// Separated lightweight history listings from the larger immutable detail payload.
public final class SimulationRunModels {

    private SimulationRunModels() {}

    public record Save(String title, String kind, JsonNode inputs, JsonNode result) {}

    public record Rename(String title) {}

    public record Summary(
        String id,
        String title,
        String kind,
        String createdAt,
        int years,
        double p10,
        double p50,
        double p90
    ) {}

    public record Detail(Summary summary, JsonNode inputs, JsonNode result) {}

    public record Page(List<Summary> items, long total, int page, int size) {}
}
