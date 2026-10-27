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
            "/api/v1/market/stocks",
            "/api/v1/market/stocks/{symbol}",
            "/api/v1/market/private",
            "/api/v1/market/stocks/AAPL/private",
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
    void onlyQuoteReadsArePublic() throws Exception {
        mvc.perform(get("/api/v1/market/stocks")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/market/stocks/AAPL")).andExpect(status().isOk());
    }

    @Test
    void otherMarketRoutesStillRequireAuthentication() throws Exception {
        mvc.perform(get("/api/v1/market/private")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/market/stocks/AAPL/private")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/market/stocks")).andExpect(status().isUnauthorized());
    }
}
