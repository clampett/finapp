package com.finapp.javabackend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.http.HttpMethod;
import com.finapp.javabackend.repository.UserSessionRepository;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, UserSessionRepository sessions) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .addFilterBefore(new SessionCookieAuthenticationFilter(sessions), UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, error) -> {
                    response.setStatus(401);
                    response.setContentType("application/json");
                    response.getWriter().write("{\"message\":\"Sign in to access this workspace.\"}");
                }))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/health", "/api/v1/auth/**", "/api/v1/simulate").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/graph/1", "/api/v1/graph/2", "/api/v1/graph/3").permitAll()
                        // The UI edits browser drafts. The old bulk-save endpoint
                        // has no ownership checks and must not be exposed publicly.
                        .requestMatchers(HttpMethod.POST, "/api/v1/graph").denyAll()
                        .anyRequest().authenticated()
                );

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // Industry standard BCrypt hashing algorithm
        return new BCryptPasswordEncoder();
    }
}
