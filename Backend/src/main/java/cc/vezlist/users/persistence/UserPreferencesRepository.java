package cc.vezlist.users.persistence;

import java.util.UUID;

import cc.vezlist.users.domain.UserPreferences;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPreferencesRepository extends JpaRepository<UserPreferences, UUID> {
}
