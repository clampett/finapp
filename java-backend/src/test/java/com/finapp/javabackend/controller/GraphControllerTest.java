package com.finapp.javabackend.controller;

import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.service.GraphService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Collections;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(GraphController.class)
class GraphControllerTest {

    @Autowired
    private MockMvc mockMvc;

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
}