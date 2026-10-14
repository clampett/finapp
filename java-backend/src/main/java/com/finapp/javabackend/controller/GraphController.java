package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.service.GraphService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/graph")

public class GraphController {

    private final GraphService graphService;

    public GraphController(GraphService graphService) {
        this.graphService = graphService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<GraphDTO>> saveGraph(@RequestBody GraphDTO graphDTO) {
        GraphDTO saved = graphService.saveGraph(graphDTO);
        return ResponseEntity.ok(ApiResponse.success(saved, "Graph persisted successfully"));
    }

    @GetMapping("/{userId}")
    public ResponseEntity<ApiResponse<GraphDTO>> getGraph(@PathVariable Long userId) {
        GraphDTO graph = graphService.getGraphForUser(userId);
        return ResponseEntity.ok(ApiResponse.success(graph, "Graph fetched successfully"));
    }
}