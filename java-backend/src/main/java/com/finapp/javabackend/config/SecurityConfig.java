package com.finapp.javabackend.config;

import com.finapp.javabackend.repository.UserSessionRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, UserSessionRepository sessions)
        throws Exception {
        http
            // Disabled servlet-session persistence so a second JSESSIONID
            // could not restore identity after the FinApp tab key was cleared.
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session ->
                session.sessionCreationPolicy(
                    org.springframework.security.config.http.SessionCreationPolicy.STATELESS
                )
            )
            .requestCache(AbstractHttpConfigurer::disable)
            .addFilterBefore(
                new SessionCookieAuthenticationFilter(sessions),
                UsernamePasswordAuthenticationFilter.class
            )
            .exceptionHandling(errors ->
                errors.authenticationEntryPoint((request, response, error) -> {
                    response.setStatus(401);
                    response.setContentType("application/json");
                    response
                        .getWriter()
                        .write("{\"message\":\"Sign in to access this workspace.\"}");
                })
            )
            .authorizeHttpRequests(auth ->
                auth
                    // Kept demos and authentication entry points public while
                    // requiring the validated session for private graph reads.
                    .requestMatchers("/api/v1/health", "/api/v1/auth/**", "/api/v1/simulate")
                    .permitAll()
                    .requestMatchers(
                        HttpMethod.GET,
                        "/api/v1/graph/1",
                        "/api/v1/graph/2",
                        "/api/v1/graph/3"
                    )
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/v1/market/**")
                    .permitAll()
                    // The UI edits browser drafts. The old bulk-save endpoint
                    // has no ownership checks and must not be exposed publicly.
                    .requestMatchers(HttpMethod.POST, "/api/v1/graph")
                    .denyAll()
                    .anyRequest()
                    .authenticated()
            );

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // Industry standard BCrypt hashing algorithm
        return new BCryptPasswordEncoder();
    }
}
