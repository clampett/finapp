package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.dto.SimulationResultDTO;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@RestController
@RequestMapping("/api/v1/simulations")
public class SimulationController {

    @PostMapping("/run/{profileId}")
    public ResponseEntity<ApiResponse<SimulationResultDTO>> runSimulation(@PathVariable Long profileId) {
        // Mock stub result until the Python FastAPI integration client is set up
        SimulationResultDTO stubResult = new SimulationResultDTO(
                new BigDecimal("450000.00"),
                new BigDecimal("620000.00"),
                new BigDecimal("850000.00"),
                "Increase monthly savings contributions by 5% to optimize long-term growth."
        );

        return ResponseEntity.ok(ApiResponse.success(stubResult, "Simulation executed successfully"));
    }
}