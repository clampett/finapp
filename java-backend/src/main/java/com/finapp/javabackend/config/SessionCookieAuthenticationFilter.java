package com.finapp.javabackend.config;

import com.finapp.javabackend.repository.UserSessionRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.List;

public class SessionCookieAuthenticationFilter extends OncePerRequestFilter {
    private final UserSessionRepository sessions;

    public SessionCookieAuthenticationFilter(UserSessionRepository sessions) { this.sessions = sessions; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getCookies() != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            for (Cookie cookie : request.getCookies()) {
                if (cookie.getName().equals("finapp_session") && cookie.getValue().matches("[a-fA-F0-9-]{36}")) {
                    sessions.findByToken(cookie.getValue()).filter(session -> session.getExpiresAt().isAfter(LocalDateTime.now()))
                        .ifPresent(session -> {
                            var user = session.getUser();
                            var principal = new SessionUser(user.getId(), user.getUsername());
                            SecurityContextHolder.getContext().setAuthentication(
                                new UsernamePasswordAuthenticationToken(principal, null, List.of()));
                        });
                    break;
                }
            }
        }
        chain.doFilter(request, response);
    }
}
