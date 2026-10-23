package cc.vezlist.users.application;

import java.util.UUID;
import cc.vezlist.users.domain.UserPrivacySettings;
import cc.vezlist.users.persistence.UserPrivacySettingsRepository;
import cc.vezlist.identity.persistence.UserRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdLocationService {
    public record Coordinates(Double latitude, Double longitude) {}
    private final UserPrivacySettingsRepository privacy;
    private final UserRepository users;
    private final JdbcTemplate jdbc;
    public AdLocationService(UserPrivacySettingsRepository privacy, UserRepository users, JdbcTemplate jdbc) {
        this.privacy = privacy; this.users = users; this.jdbc = jdbc;
    }
    @Transactional
    public Coordinates coordinatesFor(UUID ownerId, Double latitude, Double longitude) {
        // Serialize new ads with an opt-out so an in-flight create cannot escape clearing.
        users.findByIdForUpdate(ownerId).orElseThrow();
        return coordinatesFor(ownerId, latitude, longitude, true);
    }
    @Transactional(readOnly = true)
    public Coordinates coordinatesFor(UUID ownerId, Double latitude, Double longitude, boolean useSavedLocation) {
        var settings = privacy.findById(ownerId);
        // Explicit opt-out always wins over coordinates held by an old edit tab.
        if (settings.isPresent() && !settings.get().isPreciseLocation()) return new Coordinates(null, null);
        if (latitude != null || longitude != null) return new Coordinates(latitude, longitude);
        if (!useSavedLocation) return new Coordinates(null, null);
        return settings.filter(UserPrivacySettings::isPreciseLocation)
                .map(p -> new Coordinates(p.getAdLatitude(), p.getAdLongitude()))
                .orElseGet(() -> new Coordinates(null, null));
    }
    @Transactional
    public void setLocation(UUID ownerId, Double latitude, Double longitude) {
        users.findByIdForUpdate(ownerId).orElseThrow();
        UserPrivacySettings settings = privacy.findById(ownerId)
                .orElseGet(() -> new UserPrivacySettings(users.findById(ownerId).orElseThrow()));
        settings.setAdLocation(latitude, longitude);
        privacy.saveAndFlush(settings);
        // Explicitly confirmed by the advertiser: applies to their ads on both boards.
        jdbc.update("UPDATE listings SET latitude = ?, longitude = ? WHERE owner_id = ? AND status <> 'DELETED'",
                latitude, longitude, ownerId);
    }
}
