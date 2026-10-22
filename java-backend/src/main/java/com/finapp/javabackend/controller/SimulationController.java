package com.finapp.javabackend.controller;

import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@RestController
@RequestMapping("/api/v1/simulate")
public class SimulationController {

    private final RestTemplate restTemplate;
    private final String pythonUrl;

    public SimulationController(
        RestTemplateBuilder builder,
        @Value("${python.service.url:http://localhost:5000}") String pythonServiceUrl
    ) {
        // Bounded connection and response waits independently, keeping a failed
        // Python request from blocking the Java request thread indefinitely.
        restTemplate = builder
            .setConnectTimeout(Duration.ofSeconds(3))
            .setReadTimeout(Duration.ofSeconds(12))
            .build();
        pythonUrl = pythonServiceUrl.replaceAll("/+$", "") + "/api/simulate";
    }

    @PostMapping
    public ResponseEntity<String> proxySimulation(@RequestBody Map<String, Object> payload) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            ResponseEntity<String> response = restTemplate.postForEntity(
                pythonUrl,
                new HttpEntity<>(payload, headers),
                String.class
            );
            return ResponseEntity.status(response.getStatusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body(response.getBody());
        } catch (HttpStatusCodeException e) {
            // Preserve Python validation errors so the user can correct their input.
            return ResponseEntity.status(e.getStatusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body(e.getResponseBodyAsString());
        } catch (RestClientException e) {
            // Replaced transport details with a useful service error, avoiding
            // internal connection information in the browser-facing response.
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .contentType(MediaType.APPLICATION_JSON)
                .body(
                    "{\"status\":\"error\",\"message\":\"The simulation service is unavailable. Start the Python backend and try again.\"}"
                );
        }
    }
}
