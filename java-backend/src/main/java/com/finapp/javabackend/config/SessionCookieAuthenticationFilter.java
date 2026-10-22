package com.finapp.javabackend.config;

import com.finapp.javabackend.repository.UserSessionRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class SessionCookieAuthenticationFilter extends OncePerRequestFilter {

    private final UserSessionRepository sessions;

    public SessionCookieAuthenticationFilter(UserSessionRepository sessions) {
        this.sessions = sessions;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain chain
    ) throws ServletException, IOException {
        // Required both browser cookie and tab key before looking up the session;
        // a user ID supplied by the browser was never treated as authentication.
        if (
            request.getCookies() != null &&
            SecurityContextHolder.getContext().getAuthentication() == null
        ) {
            for (Cookie cookie : request.getCookies()) {
                // Cookies are shared between tabs; the matching key lives only in this tab's sessionStorage.
                if (
                    cookie.getName().equals("finapp_session") &&
                    cookie.getValue().matches("[a-fA-F0-9-]{36}") &&
                    cookie.getValue().equals(request.getHeader("X-FinApp-Session"))
                ) {
                    sessions
                        .findByToken(cookie.getValue())
                        .filter(session -> session.getExpiresAt().isAfter(LocalDateTime.now()))
                        .ifPresent(session -> {
                            // Derived identity from the stored session's user,
                            // then exposed that identity to downstream owner checks.
                            var user = session.getUser();
                            var principal = new SessionUser(user.getId(), user.getUsername());
                            SecurityContextHolder.getContext().setAuthentication(
                                new UsernamePasswordAuthenticationToken(principal, null, List.of())
                            );
                        });
                    break;
                }
            }
        }
        chain.doFilter(request, response);
    }
}
