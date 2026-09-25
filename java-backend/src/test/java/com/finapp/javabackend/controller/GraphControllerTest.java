package com.finapp.javabackend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finapp.javabackend.dto.EdgeDTO;
import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.dto.NodeDTO;
import com.finapp.javabackend.service.GraphService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(GraphController.class)
class GraphControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private GraphService graphService;

    @Test
    @DisplayName("GET /api/v1/graph - Should return 200 OK with full graph DTO")
    void getGraph_ShouldReturnGraphDTO() throws Exception {
        // Arrange
        NodeDTO node = new NodeDTO(1L, "Checking Account", "CHECKING", new BigDecimal("5000.00"), new BigDecimal("0.05"));
        EdgeDTO edge = new EdgeDTO(1L, 1L, 2L, new BigDecimal("500.00"), BigDecimal.ZERO);
        GraphDTO mockGraph = new GraphDTO(List.of(node), List.of(edge));

        when(graphService.getFullGraph()).thenReturn(mockGraph);

        // Act & Assert
        mockMvc.perform(get("/api/v1/graph"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Graph fetched successfully"))
                .andExpect(jsonPath("$.data.nodes[0].name").value("Checking Account"))
                .andExpect(jsonPath("$.data.nodes[0].nodeType").value("CHECKING"));
    }

    @Test
    @DisplayName("POST /api/v1/graph - Should persist graph and return 200 OK")
    void saveGraph_ShouldSaveAndReturnGraph() throws Exception {
        // Arrange
        NodeDTO node = new NodeDTO(null, "Salary Income", "INCOME", new BigDecimal("80000.00"), BigDecimal.ZERO);
        GraphDTO inputGraph = new GraphDTO(List.of(node), List.of());
        GraphDTO savedGraph = new GraphDTO(List.of(new NodeDTO(1L, "Salary Income", "INCOME", new BigDecimal("80000.00"), BigDecimal.ZERO)), List.of());

        when(graphService.saveGraph(any(GraphDTO.class))).thenReturn(savedGraph);

        // Act & Assert
        mockMvc.perform(post("/api/v1/graph")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inputGraph)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.nodes[0].id").value(1))
                .andExpect(jsonPath("$.data.nodes[0].name").value("Salary Income"));
    }
}