package com.finapp.javabackend.health;

import com.finapp.javabackend.common.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/health")
public class HealthController {

    @GetMapping
    public ResponseEntity<ApiResponse<HealthResponse>> getHealth() {
        HealthResponse health = new HealthResponse("UP", "java-backend");
        return ResponseEntity.ok(ApiResponse.success(health, "Service is healthy"));
    }
}