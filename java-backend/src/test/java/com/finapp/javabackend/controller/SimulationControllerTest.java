package com.finapp.javabackend.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SimulationController.class)
class SimulationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void runSimulationShouldReturnStubbedResults() throws Exception {
        mockMvc.perform(post("/api/v1/simulations/run/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Simulation executed successfully"))
                .andExpect(jsonPath("$.data.p10NetWorth").value(450000.00))
                .andExpect(jsonPath("$.data.p50NetWorth").value(620000.00))
                .andExpect(jsonPath("$.data.p90NetWorth").value(850000.00));
    }
}