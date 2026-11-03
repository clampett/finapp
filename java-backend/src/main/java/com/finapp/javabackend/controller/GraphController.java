package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.service.GraphService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/graph")
public class GraphController {

    private final GraphService graphService;

    public GraphController(GraphService graphService) {
        this.graphService = graphService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<GraphDTO>> saveGraph(@RequestBody GraphDTO graphDTO, Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to save your graph.");
        }
        GraphDTO saved = graphService.saveGraph(user.id(), graphDTO);
        return ResponseEntity.ok(ApiResponse.success(saved, "Graph persisted successfully"));
    }

    @GetMapping("/{userId}")
    public ResponseEntity<ApiResponse<GraphDTO>> getGraph(
        @PathVariable Long userId,
        Authentication authentication
    ) {
        // Allowed the three public archetypes while checking every other user ID
        // against the server-authenticated owner before loading financial records.
        if (
            userId < 1 ||
            (userId > 3 &&
                (authentication == null ||
                    !(authentication.getPrincipal() instanceof SessionUser user) ||
                    !user.id().equals(userId)))
        ) {
            throw new ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "This workspace belongs to another user."
            );
        }
        GraphDTO graph = graphService.getGraphForUser(userId);
        return ResponseEntity.ok(ApiResponse.success(graph, "Graph fetched successfully"));
    }
}
