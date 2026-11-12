package com.finapp.javabackend.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finapp.javabackend.config.SecurityConfig;
import com.finapp.javabackend.dto.GoogleAuthResult;
import com.finapp.javabackend.dto.GoogleUserInfo;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.entity.UserSession;
import com.finapp.javabackend.repository.AuthTokenRepository;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.repository.UserSessionRepository;
import com.finapp.javabackend.service.EmailService;
import com.finapp.javabackend.service.GoogleAuthService;
import jakarta.servlet.http.Cookie;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
    controllers = AuthController.class,
    properties = "google.client.id=test.apps.googleusercontent.com"
)
@Import(SecurityConfig.class)
class GoogleAuthHttpTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @MockBean
    GoogleAuthService google;

    @MockBean
    UserRepository users;

    @MockBean
    UserSessionRepository sessions;

    @MockBean
    AuthTokenRepository tokens;

    @MockBean
    EmailService emails;

    @Test
    void googleChallengeAndCallbackOpenedTheSameAuthenticatedDashboardSession() throws Exception {
        var config = mvc
            .perform(get("/api/v1/auth/google/config"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andReturn()
            .getResponse();
        var body = json.readTree(config.getContentAsString());
        String nonce = body.get("nonce").asText();
        assertEquals("test.apps.googleusercontent.com", body.get("clientId").asText());
        Cookie challenge = config.getCookie("finapp_google_nonce");
        assertNotNull(challenge);
        assertTrue(challenge.isHttpOnly());
        assertEquals(nonce, challenge.getValue());

        var identity = new GoogleUserInfo(
            "google-subject",
            "user@gmail.com",
            true,
            "User",
            null,
            null
        );
        String key = "12345678-1234-1234-1234-123456789abc";
        when(google.verifyToken("signed-id-token", nonce)).thenReturn(Optional.of(identity));
        when(google.authenticateOrCreateUser(eq(identity), any())).thenReturn(
            new GoogleAuthResult(25L, key)
        );
        var callback = mvc
            .perform(
                post("/api/v1/auth/google")
                    .cookie(challenge)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"token\":\"signed-id-token\"}")
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value(25))
            .andExpect(jsonPath("$.sessionToken").value(key))
            .andReturn()
            .getResponse();
        Cookie sessionCookie = callback.getCookie("finapp_session");
        assertNotNull(sessionCookie);
        assertTrue(sessionCookie.isHttpOnly());
        assertEquals(0, callback.getCookie("finapp_google_nonce").getMaxAge());

        var user = new User();
        user.setId(25L);
        user.setUsername("google-user");
        var session = new UserSession();
        session.setUser(user);
        session.setToken(key);
        session.setExpiresAt(LocalDateTime.now().plusHours(1));
        when(sessions.findByToken(key)).thenReturn(Optional.of(session));
        mvc.perform(
            get("/api/v1/auth/session").cookie(sessionCookie).header("X-FinApp-Session", key)
        )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value(25));
        mvc.perform(get("/api/v1/auth/session").cookie(sessionCookie)).andExpect(
            status().isUnauthorized()
        );
    }

    @Test
    void callbackWithoutTheInitiatingBrowserWasRejected() throws Exception {
        mvc.perform(
            post("/api/v1/auth/google")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"signed-id-token\"}")
        ).andExpect(status().isUnauthorized());
        verifyNoInteractions(google);
    }
}
