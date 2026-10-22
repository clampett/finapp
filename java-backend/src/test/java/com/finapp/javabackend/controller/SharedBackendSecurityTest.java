package com.finapp.javabackend.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.finapp.javabackend.config.SecurityConfig;
import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.health.HealthController;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.entity.UserSession;
import com.finapp.javabackend.repository.UserSessionRepository;
import com.finapp.javabackend.service.GraphService;
import jakarta.servlet.http.Cookie;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest({ GraphController.class, HealthController.class })
@Import(SecurityConfig.class)
class SharedBackendSecurityTest {

    private static final String TOKEN = "12345678-1234-1234-1234-123456789abc";

    @Autowired
    MockMvc mvc;

    @MockBean
    GraphService graphs;

    @MockBean
    UserSessionRepository sessions;

    private UserSession session;

    @BeforeEach
    void prepare() {
        User user = new User();
        user.setId(9L);
        user.setUsername("fixture");
        session = new UserSession();
        session.setUser(user);
        session.setToken(TOKEN);
        session.setExpiresAt(LocalDateTime.now().plusHours(1));
        when(sessions.findByToken(TOKEN)).thenReturn(Optional.of(session));
        when(graphs.getGraphForUser(9L)).thenReturn(new GraphDTO(List.of(), List.of()));
        when(graphs.getGraphForUser(1L)).thenReturn(new GraphDTO(List.of(), List.of()));
    }

    @Test
    void healthAndDemoStayPublic() throws Exception {
        mvc.perform(get("/api/v1/health")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/graph/1")).andExpect(status().isOk());
    }

    @Test
    void privateWorkspaceRequiresLogin() throws Exception {
        mvc.perform(get("/api/v1/graph/9")).andExpect(status().isUnauthorized());
    }

    @Test
    void cookieAloneCannotRestoreAClosedTabsSession() throws Exception {
        mvc.perform(get("/api/v1/graph/9").cookie(new Cookie("finapp_session", TOKEN))).andExpect(
            status().isUnauthorized()
        );
        mvc.perform(
            get("/api/v1/graph/9")
                .cookie(new Cookie("finapp_session", TOKEN))
                .header("X-FinApp-Session", "different-tab")
        ).andExpect(status().isUnauthorized());
    }

    @Test
    void validSessionCanReadOwnWorkspace() throws Exception {
        mvc.perform(
            get("/api/v1/graph/9")
                .cookie(new Cookie("finapp_session", TOKEN))
                .header("X-FinApp-Session", TOKEN)
        ).andExpect(status().isOk());
    }

    @Test
    void cannotReadAnotherUsersWorkspace() throws Exception {
        mvc.perform(
            get("/api/v1/graph/10")
                .cookie(new Cookie("finapp_session", TOKEN))
                .header("X-FinApp-Session", TOKEN)
        ).andExpect(status().isForbidden());
    }

    @Test
    void expiredSessionCannotReadPrivateWorkspace() throws Exception {
        session.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        mvc.perform(
            get("/api/v1/graph/9")
                .cookie(new Cookie("finapp_session", TOKEN))
                .header("X-FinApp-Session", TOKEN)
        ).andExpect(status().isUnauthorized());
    }

    @Test
    void unsafeBulkWriteIsNotExposedOnSharedServer() throws Exception {
        mvc.perform(
            post("/api/v1/graph")
                .cookie(new Cookie("finapp_session", TOKEN))
                .header("X-FinApp-Session", TOKEN)
        ).andExpect(status().isForbidden());
    }
}
