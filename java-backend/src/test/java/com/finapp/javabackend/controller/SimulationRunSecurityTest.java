package com.finapp.javabackend.controller;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.finapp.javabackend.config.SecurityConfig;
import com.finapp.javabackend.dto.SimulationRunModels.Page;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.entity.UserSession;
import com.finapp.javabackend.repository.UserSessionRepository;
import com.finapp.javabackend.service.SimulationRunService;
import jakarta.servlet.http.Cookie;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(SimulationRunController.class)
@Import(SecurityConfig.class)
class SimulationRunSecurityTest {

    @Autowired
    MockMvc mvc;

    @MockBean
    SimulationRunService runs;

    @MockBean
    UserSessionRepository sessions;

    @Test
    void refusedAnonymousAndCookieOnlyAccess() throws Exception {
        mvc.perform(get("/api/v1/simulation-runs")).andExpect(status().isUnauthorized());
        mvc.perform(
            post("/api/v1/simulation-runs").contentType("application/json").content("{}")
        ).andExpect(status().isUnauthorized());
        verifyNoInteractions(runs);
    }

    @Test
    void derivedOwnerFromTheValidatedSessionEvenWhenAnotherIdWasSupplied() throws Exception {
        String token = "12345678-1234-1234-1234-123456789abc";
        User user = new User();
        user.setId(9L);
        user.setUsername("owner");
        UserSession session = new UserSession();
        session.setUser(user);
        session.setToken(token);
        session.setExpiresAt(LocalDateTime.now().plusHours(1));
        when(sessions.findByToken(token)).thenReturn(Optional.of(session));
        when(runs.list(9, 0, 12)).thenReturn(new Page(List.of(), 0, 0, 12));
        mvc.perform(
            get("/api/v1/simulation-runs?userId=2").cookie(new Cookie("finapp_session", token))
        ).andExpect(status().isUnauthorized());
        mvc.perform(
            get("/api/v1/simulation-runs?userId=2")
                .cookie(new Cookie("finapp_session", token))
                .header("X-FinApp-Session", token)
        ).andExpect(status().isOk());
        verify(runs).list(9, 0, 12);
    }
}
