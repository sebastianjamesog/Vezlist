package cc.vezlist.support.web;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/support/articles")
public class HelpArticleController {
    public record Article(UUID id, String category, String q, String a, boolean published, Instant updatedAt) {}
    public record Page(List<Article> items, Integer nextOffset) {}
    public record Write(@NotBlank @Size(max = 80) String category,
                        @NotBlank @Size(max = 240) String q,
                        @NotBlank @Size(max = 10000) String a,
                        boolean published) {}

    private final JdbcTemplate jdbc;

    public HelpArticleController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Page publicList(@RequestParam(defaultValue = "50") int limit,
                           @RequestParam(defaultValue = "0") int offset) {
        return list(false, limit, offset);
    }

    @GetMapping("/admin")
    @PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
    public Page adminList(@RequestParam(defaultValue = "50") int limit,
                          @RequestParam(defaultValue = "0") int offset) {
        return list(true, limit, offset);
    }

    @PostMapping("/admin")
    @PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public Article create(@Valid @RequestBody Write request) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO help_articles(id, category, question, answer, published) VALUES (?, ?, ?, ?, ?)",
                id, request.category().strip(), request.q().strip(), request.a().strip(), request.published());
        return find(id);
    }

    @PutMapping("/admin/{id}")
    @PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
    public Article update(@PathVariable UUID id, @Valid @RequestBody Write request) {
        int count = jdbc.update("UPDATE help_articles SET category = ?, question = ?, answer = ?, published = ?,"
                + " updated_at = now() WHERE id = ?", request.category().strip(), request.q().strip(),
                request.a().strip(), request.published(), id);
        if (count == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return find(id);
    }

    @DeleteMapping("/admin/{id}")
    @PreAuthorize("hasAnyRole('MODERATOR', 'ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        if (jdbc.update("DELETE FROM help_articles WHERE id = ?", id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    private Page list(boolean admin, int limit, int offset) {
        if (limit < 1 || limit > 100 || offset < 0 || offset > 100000) {
            throw new IllegalArgumentException("Limit must be 1-100 and offset must be 0-100000.");
        }
        String where = admin ? "" : " WHERE published = TRUE";
        List<Article> rows = jdbc.query("SELECT id, category, question, answer, published, updated_at"
                + " FROM help_articles" + where + " ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?",
                (rs, n) -> new Article(rs.getObject("id", UUID.class), rs.getString("category"),
                        rs.getString("question"), rs.getString("answer"), rs.getBoolean("published"),
                        rs.getTimestamp("updated_at").toInstant()), limit + 1, offset);
        boolean more = rows.size() > limit;
        return new Page(more ? rows.subList(0, limit) : rows, more ? offset + limit : null);
    }

    private Article find(UUID id) {
        try {
            return jdbc.queryForObject("SELECT id, category, question, answer, published, updated_at"
                    + " FROM help_articles WHERE id = ?", (rs, n) -> new Article(
                            rs.getObject("id", UUID.class), rs.getString("category"),
                            rs.getString("question"), rs.getString("answer"), rs.getBoolean("published"),
                            rs.getTimestamp("updated_at").toInstant()), id);
        } catch (EmptyResultDataAccessException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }
}
