package com.finapp.javabackend.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.client.RestClientTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

@RestClientTest(SimulationController.class)
class SimulationControllerTest {
    @Autowired private SimulationController controller;
    @Autowired private MockRestServiceServer server;

    @Test
    void forwardsPayloadAndReturnsPythonResult() {
        server.expect(requestTo("http://localhost:5000/api/simulate"))
                .andExpect(content().json("{\"sim_type\":\"debt\"}"))
                .andRespond(withSuccess("{\"status\":\"success\"}", MediaType.APPLICATION_JSON));
        var response = controller.proxySimulation(Map.of("sim_type", "debt"));
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());
        assertEquals("{\"status\":\"success\"}", response.getBody());
        server.verify();
    }

    @Test
    void preservesValidationErrors() {
        server.expect(requestTo("http://localhost:5000/api/simulate"))
                .andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
                        .contentType(MediaType.APPLICATION_JSON).body("{\"detail\":\"Invalid scenario\"}"));
        var response = controller.proxySimulation(Map.of());
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, response.getStatusCode());
        assertTrue(response.getBody().contains("Invalid scenario"));
    }

    @Test
    void unavailableServiceReturnsGatewayError() {
        server.expect(requestTo("http://localhost:5000/api/simulate"))
                .andRespond(withException(new java.io.IOException("Connection refused")));
        assertEquals(HttpStatus.BAD_GATEWAY, controller.proxySimulation(Map.of()).getStatusCode());
    }
}
