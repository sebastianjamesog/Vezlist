package cc.vezlist.users.domain;
import static org.assertj.core.api.Assertions.assertThat;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import cc.vezlist.identity.domain.User;
class UserPreferencesTest {
    @Test void availabilityExpiresAndOnlyExplicitActivationRenewsIt() {
        UserPreferences prefs = new UserPreferences(new User("Creator", "creator@example.test", "hash"));
        Instant before = Instant.now();
        prefs.update(true, false, true);
        Instant deadline = prefs.getAvailableUntil();
        assertThat(prefs.isAvailableNow()).isTrue();
        assertThat(deadline).isBetween(before.plusSeconds(1200), Instant.now().plusSeconds(1200));
        prefs.update(false, true, true);
        assertThat(prefs.getAvailableUntil()).isEqualTo(deadline);
        ReflectionTestUtils.setField(prefs, "availableUntil", Instant.now().minusSeconds(1));
        assertThat(prefs.isAvailableNow()).isFalse();
        prefs.update(true, false, null);
        assertThat(prefs.isAvailableNow()).isFalse();
        prefs.update(true, false, true);
        assertThat(prefs.isAvailableNow()).isTrue();
        prefs.update(true, false, false);
        assertThat(prefs.isAvailableNow()).isFalse();
        assertThat(prefs.getAvailableUntil()).isNull();
    }
}
