package com.finapp.javabackend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.dto.NodeDTO;
import com.finapp.javabackend.model.entity.NodeType;
import com.finapp.javabackend.service.GraphService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Collections;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
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
    void getGraphByProfileIdShouldReturnGraph() throws Exception {
        GraphDTO mockGraph = new GraphDTO(1L, Collections.emptyList(), Collections.emptyList());
        when(graphService.getUserGraphByProfileId(1L)).thenReturn(mockGraph);

        mockMvc.perform(get("/api/v1/graphs/profiles/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.profileId").value(1));
    }

    @Test
    void addNodeShouldReturnCreatedNode() throws Exception {
        NodeDTO inputNode = new NodeDTO(null, "Checking Account", NodeType.INCOME, new BigDecimal("5000.00"), BigDecimal.ZERO);
        NodeDTO createdNode = new NodeDTO(10L, "Checking Account", NodeType.INCOME, new BigDecimal("5000.00"), BigDecimal.ZERO);

        when(graphService.addNode(eq(1L), any(NodeDTO.class))).thenReturn(createdNode);

        mockMvc.perform(post("/api/v1/graphs/profiles/1/nodes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inputNode)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(10))
                .andExpect(jsonPath("$.data.name").value("Checking Account"));
    }

    @Test
    void updateNodeShouldReturnUpdatedNode() throws Exception {
        NodeDTO updatePayload = new NodeDTO(10L, "Savings Account", NodeType.ASSET, new BigDecimal("8000.00"), new BigDecimal("0.045"));

        when(graphService.updateNode(eq(10L), any(NodeDTO.class))).thenReturn(updatePayload);

        mockMvc.perform(put("/api/v1/graphs/nodes/10")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updatePayload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.name").value("Savings Account"));
    }

    @Test
    void deleteNodeShouldReturnSuccessMessage() throws Exception {
        doNothing().when(graphService).deleteNode(10L);

        mockMvc.perform(delete("/api/v1/graphs/nodes/10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Node deleted successfully"));
    }
}