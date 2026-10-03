package cc.vezlist.live.application;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import cc.vezlist.media.storage.ObjectStorage;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

class LivePresenceServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ObjectStorage storage = mock(ObjectStorage.class);
    private final LivePresenceService service = new LivePresenceService(jdbc, storage);

    @Test
    void aCreatorCannotStartPresenceForAnUnownedOrInactiveAd() {
        UUID owner = UUID.randomUUID();
        UUID listing = UUID.randomUUID();
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(listing), eq(owner)))
                .thenReturn(0);

        assertThatThrownBy(() -> service.start(owner, listing, "Hello"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> org.assertj.core.api.Assertions.assertThat(error.getStatusCode())
                                .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void expiredPresenceCannotBeKeptAliveByHeartbeat() {
        UUID owner = UUID.randomUUID();
        when(jdbc.update(anyString(), eq(owner))).thenReturn(0);

        assertThatThrownBy(() -> service.heartbeat(owner))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> org.assertj.core.api.Assertions.assertThat(error.getStatusCode())
                                .isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void stoppingPresenceOnlyDeletesTheAuthenticatedOwnersRow() {
        UUID owner = UUID.randomUUID();

        service.stop(owner);

        verify(jdbc).update("DELETE FROM live_presence WHERE owner_id = ?", owner);
    }

    @Test
    void listReturnsRealAdCoverAndProfileAvatar() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID listing = UUID.randomUUID();
        Instant started = Instant.parse("2026-09-28T12:00:00Z");
        ResultSet row = mock(ResultSet.class);
        when(row.getObject("owner_id", UUID.class)).thenReturn(owner);
        when(row.getObject("listing_id", UUID.class)).thenReturn(listing);
        when(row.getString("display_name")).thenReturn("Creator");
        when(row.getString("title")).thenReturn("Live title");
        when(row.getString("location")).thenReturn("Calgary");
        when(row.getString("cover")).thenReturn("ads/cover.webp");
        when(row.getString("avatar_url")).thenReturn("https://example.test/avatar.webp");
        when(row.getTimestamp("started_at")).thenReturn(Timestamp.from(started));
        when(storage.authorizeDownload("ads/cover.webp"))
                .thenReturn(URI.create("https://example.test/signed-cover.webp"));
        when(jdbc.queryForObject(anyString(), eq(Long.class))).thenReturn(1L);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(30))).thenAnswer(invocation -> {
            RowMapper<LivePresenceService.LiveCreator> mapper = invocation.getArgument(1);
            return java.util.List.of(mapper.mapRow(row, 0));
        });

        var directory = service.list(30);

        org.assertj.core.api.Assertions.assertThat(directory.total()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(directory.items()).singleElement().satisfies(creator -> {
            org.assertj.core.api.Assertions.assertThat(creator.ownerId()).isEqualTo(owner);
            org.assertj.core.api.Assertions.assertThat(creator.imageUrl())
                    .isEqualTo("https://example.test/signed-cover.webp");
            org.assertj.core.api.Assertions.assertThat(creator.avatarUrl())
                    .isEqualTo("https://example.test/avatar.webp");
        });
    }
}
