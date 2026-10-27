package com.finapp.javabackend.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.client.RestClientTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;

@RestClientTest(MarketController.class)
class MarketControllerTest {

    @Autowired
    private MarketController controller;

    @Autowired
    private MockRestServiceServer server;

    @Test
    void forwardsStockLookups() {
        server
            .expect(requestTo("http://localhost:5000/api/stocks/AAPL"))
            .andRespond(withSuccess("{\"symbol\":\"AAPL\"}", MediaType.APPLICATION_JSON));
        var response = controller.stock("AAPL");
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());
        assertEquals("{\"symbol\":\"AAPL\"}", response.getBody());
        server.verify();
    }

    @Test
    void forwardsThePopularList() {
        server
            .expect(requestTo("http://localhost:5000/api/stocks"))
            .andRespond(withSuccess("[{\"symbol\":\"VOO\"}]", MediaType.APPLICATION_JSON));
        var response = controller.popularStocks();
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("[{\"symbol\":\"VOO\"}]", response.getBody());
        server.verify();
    }

    @Test
    void preservesNotFoundMessages() {
        server
            .expect(requestTo("http://localhost:5000/api/stocks/ZZZZ"))
            .andRespond(
                withStatus(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"detail\":\"No price data found for 'ZZZZ'.\"}")
            );
        var response = controller.stock("ZZZZ");
        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertTrue(response.getBody().contains("No price data"));
    }

    @Test
    void encodesSymbolsSoTheyCannotChangeThePath() {
        server
            .expect(requestTo("http://localhost:5000/api/stocks/A%2FB"))
            .andRespond(withStatus(HttpStatus.NOT_FOUND).body("{}"));
        controller.stock("A/B");
        server.verify();
    }

    @Test
    void unavailableServiceReturnsGatewayError() {
        server
            .expect(requestTo("http://localhost:5000/api/stocks/AAPL"))
            .andRespond(withException(new java.io.IOException("Connection refused")));
        assertEquals(HttpStatus.BAD_GATEWAY, controller.stock("AAPL").getStatusCode());
    }
}
