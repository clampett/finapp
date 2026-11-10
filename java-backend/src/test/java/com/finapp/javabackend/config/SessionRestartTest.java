package com.finapp.javabackend.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.entity.UserSession;
import com.finapp.javabackend.repository.UserSessionRepository;
import jakarta.servlet.http.Cookie;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

class SessionRestartTest {

    private static final String TOKEN = "12345678-1234-1234-1234-123456789abc";

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void localRestartRejectedAnUnexpiredSessionFromThePreviousLaunch() throws Exception {
        var session = session();
        authenticate(session, session.getCreatedAt().plusSeconds(1));

        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    void localLaunchAcceptedASessionIssuedAfterStartup() throws Exception {
        var session = session();
        authenticate(session, session.getCreatedAt().minusSeconds(1));

        assertEquals(new SessionUser(9L, "fixture"), SecurityContextHolder.getContext().getAuthentication().getPrincipal());
    }

    private UserSession session() {
        var user = new User();
        user.setId(9L);
        user.setUsername("fixture");
        var session = new UserSession();
        session.setUser(user);
        session.setExpiresAt(LocalDateTime.now().plusHours(1));
        return session;
    }

    private void authenticate(UserSession session, LocalDateTime startup) throws Exception {
        var sessions = mock(UserSessionRepository.class);
        when(sessions.findByToken(TOKEN)).thenReturn(Optional.of(session));
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("finapp_session", TOKEN));
        request.addHeader("X-FinApp-Session", TOKEN);
        new SessionCookieAuthenticationFilter(sessions, startup).doFilter(
            request, new MockHttpServletResponse(), new MockFilterChain()
        );
    }
}
