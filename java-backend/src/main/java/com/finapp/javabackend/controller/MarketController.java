package com.finapp.javabackend.controller;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriUtils;

@RestController
@RequestMapping("/api/v1/market")
public class MarketController {

    private final RestTemplate restTemplate;
    private final String pythonBaseUrl;

    public MarketController(
        RestTemplateBuilder builder,
        @Value("${python.service.url:http://localhost:5000}") String pythonServiceUrl
    ) {
        // A new symbol makes Python download full price history, which can take a few
        // seconds. Stay under the 15 second limit of the Express proxy.
        restTemplate = builder
            .setConnectTimeout(Duration.ofSeconds(3))
            .setReadTimeout(Duration.ofSeconds(12))
            .build();
        pythonBaseUrl = pythonServiceUrl.replaceAll("/+$", "");
    }

    @GetMapping("/stocks")
    public ResponseEntity<String> popularStocks() {
        return forward(URI.create(pythonBaseUrl + "/api/stocks"));
    }

    @GetMapping("/stocks/{symbol}")
    public ResponseEntity<String> stock(@PathVariable String symbol) {
        // Encoded so the symbol can never change which Python route is called.
        String encoded = UriUtils.encodePathSegment(symbol, StandardCharsets.UTF_8);
        return forward(URI.create(pythonBaseUrl + "/api/stocks/" + encoded));
    }

    private ResponseEntity<String> forward(URI uri) {
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(uri, String.class);
            return ResponseEntity.status(response.getStatusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body(response.getBody());
        } catch (HttpStatusCodeException e) {
            // Preserve Python's 400, 404, and 429 messages so the page can show them.
            return ResponseEntity.status(e.getStatusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body(e.getResponseBodyAsString());
        } catch (RestClientException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .contentType(MediaType.APPLICATION_JSON)
                .body(
                    "{\"detail\":\"The market data service is unavailable. Start the Python backend and try again.\"}"
                );
        }
    }
}
