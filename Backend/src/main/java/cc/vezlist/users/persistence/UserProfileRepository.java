package cc.vezlist.users.persistence;

import java.util.UUID;

import cc.vezlist.users.domain.UserProfile;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserProfileRepository extends JpaRepository<UserProfile, UUID> {
}
