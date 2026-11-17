package com.finapp.javabackend.controller;

import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.SimulationRunModels.*;
import com.finapp.javabackend.service.SimulationRunService;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/simulation-runs")
public class SimulationRunController {

    private final SimulationRunService runs;

    public SimulationRunController(SimulationRunService runs) {
        this.runs = runs;
    }

    private long owner(Authentication authentication) {
        // Derived ownership from the validated session rather than a client-supplied account ID.
        if (
            authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)
        ) throw new ResponseStatusException(
            HttpStatus.UNAUTHORIZED,
            "Sign in to use simulation history."
        );
        return user.id();
    }

    @GetMapping
    public Page list(
        Authentication auth,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "12") int size
    ) {
        return runs.list(owner(auth), page, size);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Detail save(Authentication auth, @RequestBody Save request) {
        return runs.save(owner(auth), request);
    }

    @GetMapping("/{id}")
    public Detail detail(Authentication auth, @PathVariable String id) {
        return runs.get(owner(auth), id);
    }

    @PatchMapping("/{id}")
    public Summary rename(
        Authentication auth,
        @PathVariable String id,
        @RequestBody Rename request
    ) {
        return runs.rename(owner(auth), id, request.title());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Authentication auth, @PathVariable String id) {
        runs.delete(owner(auth), id);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> rejected(ResponseStatusException error) {
        // Returned actionable validation and quota messages without exposing database details.
        return ResponseEntity.status(error.getStatusCode()).body(
            Map.of(
                "message",
                error.getReason() == null
                    ? "This saved-run request could not be completed."
                    : error.getReason()
            )
        );
    }
}
