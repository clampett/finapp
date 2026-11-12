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
    void forwardsTheFixedPublicBriefing() {
        server
            .expect(requestTo("http://localhost:5000/api/coach/market"))
            .andRespond(withSuccess("{\"status\":\"pending\"}", MediaType.APPLICATION_JSON));
        var response = controller.marketContext();
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("pending"));
        server.verify();
    }

    @Test
    void forwardsEncodedBenchmarkChartPeriods() {
        server
            .expect(requestTo("http://localhost:5000/api/coach/chart/VOO?period=5y"))
            .andRespond(withSuccess("{\"points\":[]}", MediaType.APPLICATION_JSON));
        assertEquals(HttpStatus.OK, controller.benchmarkChart("VOO", "5y").getStatusCode());
        server.verify();
    }

    @Test
    void forwardsStockChartTimeframes() {
        server
            .expect(requestTo("http://localhost:5000/api/stocks/GOOGL/chart?period=5y"))
            .andRespond(withSuccess("{\"points\":[]}", MediaType.APPLICATION_JSON));
        assertEquals(HttpStatus.OK, controller.stockChart("GOOGL", "5y").getStatusCode());
        server.verify();
    }

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

    @Test
    void forwardsTheCryptoList() {
        server
            .expect(requestTo("http://localhost:5000/api/crypto"))
            .andRespond(withSuccess("[{\"symbol\":\"BTC\"}]", MediaType.APPLICATION_JSON));
        var response = controller.cryptoPrices();
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("[{\"symbol\":\"BTC\"}]", response.getBody());
        server.verify();
    }

    @Test
    void forwardsOneCoin() {
        server
            .expect(requestTo("http://localhost:5000/api/crypto/BTC"))
            .andRespond(withSuccess("{\"symbol\":\"BTC\"}", MediaType.APPLICATION_JSON));
        var response = controller.cryptoPrice("BTC");
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("{\"symbol\":\"BTC\"}", response.getBody());
        server.verify();
    }

    @Test
    void forwardsTheCurrencyRates() {
        server
            .expect(requestTo("http://localhost:5000/api/currencies"))
            .andRespond(withSuccess("[{\"code\":\"EUR\"}]", MediaType.APPLICATION_JSON));
        var response = controller.currencyRates();
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("[{\"code\":\"EUR\"}]", response.getBody());
        server.verify();
    }

    @Test
    void forwardsOneCurrency() {
        server
            .expect(requestTo("http://localhost:5000/api/currencies/EUR"))
            .andRespond(withSuccess("{\"code\":\"EUR\"}", MediaType.APPLICATION_JSON));
        var response = controller.currencyRate("EUR");
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("{\"code\":\"EUR\"}", response.getBody());
        server.verify();
    }

    @Test
    void preservesUnknownCoinMessages() {
        server
            .expect(requestTo("http://localhost:5000/api/crypto/NOTACOIN"))
            .andRespond(
                withStatus(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"detail\":\"Unsupported coin 'NOTACOIN'.\"}")
            );
        var response = controller.cryptoPrice("NOTACOIN");
        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertTrue(response.getBody().contains("Unsupported coin"));
    }
}
