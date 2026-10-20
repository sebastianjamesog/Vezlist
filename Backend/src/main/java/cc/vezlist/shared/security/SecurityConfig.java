package cc.vezlist.shared.security;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpMethod;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ApiAccessDeniedHandler accessDeniedHandler) throws Exception {
        CookieCsrfTokenRepository csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrf.setCookiePath("/");

        return http
                .cors(cors -> { })
                .csrf(csrfConfigurer -> csrfConfigurer.csrfTokenRepository(csrf))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .exceptionHandling(exception -> exception
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
                        .accessDeniedHandler(accessDeniedHandler))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/api/v1/admin/live-plans", "/api/v1/admin/live-plans/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/live/plans", "/api/v1/live/sessions/*",
                                "/api/v1/live/chat", "/api/v1/live/broadcast").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/live/sessions/*/viewer-ticket").permitAll()
                        .requestMatchers("/api/v1/admin/story-plans", "/api/v1/admin/story-plans/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/stories", "/api/v1/stories/plans", "/api/v1/stories/creator/*").permitAll()
                        .requestMatchers("/api/v1/moderation/**").hasAnyRole("MODERATOR", "ADMIN")
                        .requestMatchers("/api/v1/admin/**").hasAnyRole("MODERATOR", "ADMIN")
                        .requestMatchers("/api/v1/listings/*/verification/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/listings").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/listings/*").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/listings/*/views").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/sellers/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/support/articles", "/api/v1/public/settings").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/live").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/personals/featured").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/locations/search").permitAll()
                        .requestMatchers(
                                "/api/v1",
                                "/api/v1/auth/csrf",
                                "/api/v1/auth/register",
                                "/api/v1/auth/login",
                                "/api/v1/categories",
                                "/api/v1/locations",
                                "/actuator/health/**",
                                "/v3/api-docs/**",
                                "/swagger-ui.html",
                                "/swagger-ui/**")
                        .permitAll()
                        .anyRequest().authenticated())
                .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${vezlist.cors.allowed-origins}") List<String> allowedOrigins,
            @Value("${vezlist.cors.allow-local-patterns:false}") boolean allowLocalPatterns) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        if (allowLocalPatterns) {
            // An exact origin list is easy to fall out of sync with local dev
            // reality: `localhost` vs `127.0.0.1` vs a LAN IP are three
            // distinct origins to a browser even though they're the same
            // machine, and a dev opening the app by whichever one they typed
            // sees every API call fail as an indistinguishable-from-network
            // "Failed to fetch" rather than a clear CORS error. Patterns
            // cover the whole space instead of enumerating it. Gated by a
            // property (default off) so deployments opt in deliberately —
            // see VEZLIST_CORS_ALLOW_LOCAL_PATTERNS in .env.example.
            configuration.addAllowedOriginPattern("http://localhost:*");
            configuration.addAllowedOriginPattern("http://127.0.0.1:*");
            configuration.addAllowedOriginPattern("http://192.168.*.*:*");
            configuration.addAllowedOriginPattern("http://10.*.*.*:*");
        }
        configuration.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of(
                "Content-Type", "Idempotency-Key", "X-Request-Id", "X-CSRF-Token", "X-XSRF-TOKEN"));
        configuration.setExposedHeaders(List.of("X-Request-Id"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
