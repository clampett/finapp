package com.finapp.javabackend.config;

import com.finapp.javabackend.repository.UserSessionRepository;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import org.springframework.beans.factory.annotation.Value;
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
    public SecurityFilterChain filterChain(
        HttpSecurity http,
        UserSessionRepository sessions,
        @Value("${finapp.session.invalidate-on-restart:false}") boolean invalidateOnRestart
    ) throws Exception {
        // Captured one startup cutoff at database timestamp precision for local launches.
        LocalDateTime sessionCutoff = invalidateOnRestart
            ? LocalDateTime.now().truncatedTo(ChronoUnit.MICROS)
            : null;
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
                new SessionCookieAuthenticationFilter(sessions, sessionCutoff),
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
                    // Limited anonymous market access to the public quote routes.
                    .requestMatchers(
                        HttpMethod.GET,
                        "/api/v1/market/stocks",
                        "/api/v1/market/stocks/{symbol}",
                        "/api/v1/market/crypto",
                        "/api/v1/market/crypto/{symbol}",
                        "/api/v1/market/currencies",
                        "/api/v1/market/currencies/{code}"
                    )
                    .permitAll()
                    // Kept the bulk-write route disabled while the UI edits browser drafts.
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
