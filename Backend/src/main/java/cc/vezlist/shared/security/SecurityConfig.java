package cc.vezlist.shared.security;

import java.util.List;
import cc.vezlist.identity.application.IdentityService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.session.web.http.CookieHttpSessionIdResolver;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.session.web.http.HttpSessionIdResolver;

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
    SecurityFilterChain securityFilterChain(HttpSecurity http, ApiAccessDeniedHandler accessDeniedHandler,
            AudienceCsrfTokenRepository csrf, IdentityService identity) throws Exception {
        return http
                .cors(cors -> { })
                .csrf(csrfConfigurer -> csrfConfigurer.csrfTokenRepository(csrf))
                .requestCache(cache -> cache.disable())
                .addFilterAfter(new CurrentAccountFilter(identity), SecurityContextHolderFilter.class)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .exceptionHandling(exception -> exception
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
                        .accessDeniedHandler(accessDeniedHandler))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/api/v1/admin/auth/csrf", "/api/v1/admin/auth/login").permitAll()
                        .requestMatchers("/api/v1/support/articles/admin", "/api/v1/support/articles/admin/**")
                            .hasAnyRole("MODERATOR", "ADMIN")
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
                                "/api/v1/ethnicities",
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
    AudienceCsrfTokenRepository csrfTokenRepository() {
        return new AudienceCsrfTokenRepository();
    }

    @Bean
    HttpSessionIdResolver httpSessionIdResolver(ServerProperties properties,
            ObjectProvider<JdbcIndexedSessionRepository> repository) {
        var cookie = properties.getServlet().getSession().getCookie();
        int maxAge = cookie.getMaxAge() == null ? -1 : Math.toIntExact(cookie.getMaxAge().getSeconds());
        return new AudienceSessionIdResolver(sessionCookie("SESSION", maxAge, cookie.getSecure()),
                sessionCookie("ADMIN_SESSION", -1, cookie.getSecure()), repository);
    }

    private CookieHttpSessionIdResolver sessionCookie(String name, int maxAge, Boolean secure) {
        DefaultCookieSerializer cookie = new DefaultCookieSerializer();
        cookie.setCookieName(name);
        cookie.setCookiePath("/");
        cookie.setUseHttpOnlyCookie(true);
        cookie.setSameSite("Lax");
        cookie.setCookieMaxAge(maxAge);
        if (secure != null) cookie.setUseSecureCookie(secure);
        CookieHttpSessionIdResolver resolver = new CookieHttpSessionIdResolver();
        resolver.setCookieSerializer(cookie);
        return resolver;
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
            @Value("${vezlist.cors.admin-origins}") List<String> adminOrigins,
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
        CorsConfiguration adminConfiguration = new CorsConfiguration(configuration);
        adminConfiguration.setAllowedOrigins(adminOrigins);
        adminConfiguration.setAllowedOriginPatterns(List.of());
        source.registerCorsConfiguration("/api/v1/admin/**", adminConfiguration);
        source.registerCorsConfiguration("/api/v1/moderation/**", adminConfiguration);
        source.registerCorsConfiguration("/api/v1/support/articles/admin", adminConfiguration);
        source.registerCorsConfiguration("/api/v1/support/articles/admin/**", adminConfiguration);
        source.registerCorsConfiguration("/api/**", configuration);
        return request -> {
            String path = request.getServletPath();
            if (path == null || path.isEmpty()) {
                path = org.springframework.web.util.UriUtils.decode(request.getRequestURI(),
                        java.nio.charset.StandardCharsets.UTF_8);
            }
            // An old console tab must not keep using the public login/logout
            // endpoints after rollout and overwrite the Marketplace session.
            if (path.startsWith("/api/v1/auth/") && adminOrigins.contains(request.getHeader("Origin"))) {
                return new CorsConfiguration();
            }
            return source.getCorsConfiguration(request);
        };
    }
}
