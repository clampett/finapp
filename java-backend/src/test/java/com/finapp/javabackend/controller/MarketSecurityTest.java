package com.finapp.javabackend.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.finapp.javabackend.config.SecurityConfig;
import com.finapp.javabackend.repository.UserSessionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.*;

@WebMvcTest(MarketSecurityTest.Probe.class)
@Import({ SecurityConfig.class, MarketSecurityTest.Probe.class })
class MarketSecurityTest {

    @Autowired
    MockMvc mvc;

    @MockBean
    UserSessionRepository sessions;

    @RestController
    static class Probe {

        // Isolated route authorization from provider requests and database availability.
        @GetMapping({
            "/api/v1/market/context/{symbol}/chart",
            "/api/v1/market/context/{symbol}/chart/private",
            "/api/v1/market/context",
            "/api/v1/market/context/private",
            "/api/v1/market/stocks/{symbol}/chart",
            "/api/v1/market/stocks/{symbol}/chart/private",
            "/api/v1/market/stocks",
            "/api/v1/market/stocks/{symbol}",
            "/api/v1/market/private",
            "/api/v1/market/stocks/AAPL/private",
            "/api/v1/market/crypto",
            "/api/v1/market/crypto/{symbol}",
            "/api/v1/market/currencies",
            "/api/v1/market/currencies/{code}",
            "/api/v1/market/crypto/BTC/private",
            "/api/v1/market/currencies/EUR/private",
        })
        String read() {
            return "{}";
        }

        @PostMapping("/api/v1/market/stocks")
        String write() {
            return "{}";
        }
    }

    @Test
    void onlyTheExactBriefingReadWasPublic() throws Exception {
        mvc.perform(get("/api/v1/market/context")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/market/context/VOO/chart?period=5y")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/market/context/VOO/chart/private")).andExpect(
            status().isUnauthorized()
        );
        mvc.perform(post("/api/v1/market/context/VOO/chart")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/market/context/private")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/market/context")).andExpect(status().isUnauthorized());
    }

    @Test
    void onlyQuoteReadsArePublic() throws Exception {
        mvc.perform(get("/api/v1/market/stocks")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/market/stocks/GOOGL/chart?period=5y")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/market/stocks/GOOGL/chart/private")).andExpect(
            status().isUnauthorized()
        );
        mvc.perform(post("/api/v1/market/stocks/GOOGL/chart")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/market/stocks/AAPL")).andExpect(status().isOk());
    }

    @Test
    void otherMarketRoutesStillRequireAuthentication() throws Exception {
        mvc.perform(get("/api/v1/market/private")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/market/stocks/AAPL/private")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/market/stocks")).andExpect(status().isUnauthorized());
    }

    @Test
    void cryptoAndCurrencyReadsArePublic() throws Exception {
        mvc.perform(get("/api/v1/market/crypto")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/market/crypto/BTC")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/market/currencies")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/market/currencies/EUR")).andExpect(status().isOk());
    }

    @Test
    void nestedCryptoAndCurrencyRoutesStillRequireAuthentication() throws Exception {
        mvc.perform(get("/api/v1/market/crypto/BTC/private")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/market/currencies/EUR/private")).andExpect(
            status().isUnauthorized()
        );
    }
}
