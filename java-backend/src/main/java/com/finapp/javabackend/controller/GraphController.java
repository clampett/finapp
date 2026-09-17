package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.dto.NodeDTO;
import com.finapp.javabackend.service.GraphService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/graphs")
public class GraphController {

    private final GraphService graphService;

    public GraphController(GraphService graphService) {
        this.graphService = graphService;
    }

    @GetMapping("/profiles/{profileId}")
    public ResponseEntity<ApiResponse<GraphDTO>> getGraphByProfileId(@PathVariable Long profileId) {
        GraphDTO graph = graphService.getUserGraphByProfileId(profileId);
        return ResponseEntity.ok(ApiResponse.success(graph, "Financial graph retrieved successfully"));
    }

    @PostMapping("/profiles/{profileId}/nodes")
    public ResponseEntity<ApiResponse<NodeDTO>> addNode(@PathVariable Long profileId, @RequestBody NodeDTO nodeDTO) {
        NodeDTO createdNode = graphService.addNode(profileId, nodeDTO);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(createdNode, "Node created successfully"));
    }

    @PutMapping("/nodes/{nodeId}")
    public ResponseEntity<ApiResponse<NodeDTO>> updateNode(@PathVariable Long nodeId, @RequestBody NodeDTO nodeDTO) {
        NodeDTO updatedNode = graphService.updateNode(nodeId, nodeDTO);
        return ResponseEntity.ok(ApiResponse.success(updatedNode, "Node updated successfully"));
    }

    @DeleteMapping("/nodes/{nodeId}")
    public ResponseEntity<ApiResponse<Void>> deleteNode(@PathVariable Long nodeId) {
        graphService.deleteNode(nodeId);
        return ResponseEntity.ok(ApiResponse.success(null, "Node deleted successfully"));
    }
}