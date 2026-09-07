package cc.vezlist.users.persistence;

import java.util.UUID;

import cc.vezlist.users.domain.UserPrivacySettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPrivacySettingsRepository extends JpaRepository<UserPrivacySettings, UUID> {
}
