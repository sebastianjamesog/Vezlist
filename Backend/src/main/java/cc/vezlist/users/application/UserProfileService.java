package cc.vezlist.users.application;

import java.util.Locale;
import java.util.UUID;
import cc.vezlist.notifications.application.NotificationPublisher;
import cc.vezlist.notifications.domain.NotificationType;
import cc.vezlist.shared.domain.SiteScope;

import cc.vezlist.identity.application.EmailAlreadyRegisteredException;
import cc.vezlist.identity.domain.User;
import cc.vezlist.identity.persistence.UserRepository;
import cc.vezlist.users.domain.AccountDeletionRequest;
import cc.vezlist.users.domain.AccountDeletionStatus;
import cc.vezlist.users.domain.UserPreferences;
import cc.vezlist.users.domain.UserPrivacySettings;
import cc.vezlist.users.domain.UserProfile;
import cc.vezlist.users.persistence.AccountDeletionRequestRepository;
import cc.vezlist.users.persistence.UserPreferencesRepository;
import cc.vezlist.users.persistence.UserPrivacySettingsRepository;
import cc.vezlist.users.persistence.UserProfileRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserProfileService {

    private final UserRepository users;
    private final UserProfileRepository profiles;
    private final UserPreferencesRepository preferences;
    private final UserPrivacySettingsRepository privacySettings;
    private final AccountDeletionRequestRepository deletionRequests;
    private final PasswordEncoder passwordEncoder;
    private final NotificationPublisher notifications;

    public UserProfileService(
            UserRepository users,
            UserProfileRepository profiles,
            UserPreferencesRepository preferences,
            UserPrivacySettingsRepository privacySettings,
            AccountDeletionRequestRepository deletionRequests,
            PasswordEncoder passwordEncoder,
            NotificationPublisher notifications) {
        this.users = users;
        this.profiles = profiles;
        this.preferences = preferences;
        this.privacySettings = privacySettings;
        this.deletionRequests = deletionRequests;
        this.passwordEncoder = passwordEncoder;
        this.notifications = notifications;
    }

    @Transactional
    public UserProfileDetails getProfile(UUID userId) {
        User user = requireUser(userId);
        UserProfile profile = profiles.findById(userId)
                .orElseGet(() -> profiles.saveAndFlush(new UserProfile(user)));
        return profileDetails(user, profile);
    }

    @Transactional
    public UserProfileDetails updateProfile(
            UUID userId,
            String name,
            String emailValue,
            String phone,
            String location,
            String bio) {
        User user = requireUser(userId);
        String email = emailValue.trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmailAndIdNot(email, userId)) {
            throw new EmailAlreadyRegisteredException();
        }

        user.updateIdentity(name.trim(), email);
        UserProfile profile = profiles.findById(userId).orElseGet(() -> new UserProfile(user));
        profile.update(phone, location, bio);
        try {
            users.saveAndFlush(user);
            profiles.saveAndFlush(profile);
        } catch (DataIntegrityViolationException exception) {
            throw new EmailAlreadyRegisteredException();
        }
        return profileDetails(user, profile);
    }

    @Transactional
    public UserPreferenceDetails getPreferences(UUID userId) {
        User user = requireUser(userId);
        UserPreferences userPreferences = preferences.findById(userId)
                .orElseGet(() -> preferences.save(new UserPreferences(user)));
        UserPrivacySettings privacy = privacySettings.findById(userId)
                .orElseGet(() -> privacySettings.save(new UserPrivacySettings(user)));
        return preferenceDetails(userPreferences, privacy);
    }

    @Transactional
    public UserPreferenceDetails updatePreferences(
            UUID userId,
            boolean pushNotifications,
            boolean emailUpdates,
            boolean showPhoneOnAds,
            boolean preciseLocation) {
        User user = requireUser(userId);
        UserPreferences userPreferences = preferences.findById(userId)
                .orElseGet(() -> new UserPreferences(user));
        UserPrivacySettings privacy = privacySettings.findById(userId)
                .orElseGet(() -> new UserPrivacySettings(user));
        userPreferences.update(pushNotifications, emailUpdates);
        privacy.update(showPhoneOnAds, preciseLocation);
        preferences.save(userPreferences);
        privacySettings.save(privacy);
        return preferenceDetails(userPreferences, privacy);
    }

    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        User user = requireUser(userId);
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new CurrentPasswordInvalidException();
        }
        user.changePassword(passwordEncoder.encode(newPassword));
        users.save(user);
        UUID eventId = UUID.randomUUID();
        for (SiteScope site : SiteScope.values()) {
            notifications.publish(eventId, userId, site, NotificationType.SECURITY_EVENT, userId);
        }
    }

    @Transactional
    public DeletionRequestDetails requestDeletion(UUID userId) {
        User user = requireUser(userId);
        AccountDeletionRequest deletionRequest = deletionRequests
                .findByUserIdAndStatus(userId, AccountDeletionStatus.PENDING)
                .orElseGet(() -> deletionRequests.save(new AccountDeletionRequest(user)));
        return new DeletionRequestDetails(
                deletionRequest.getId(), deletionRequest.getStatus(), deletionRequest.getRequestedAt());
    }

    private User requireUser(UUID userId) {
        return users.findById(userId)
                .orElseThrow(() -> new UsernameNotFoundException("User account was not found."));
    }

    private UserProfileDetails profileDetails(User user, UserProfile profile) {
        return new UserProfileDetails(
                user.getId(), user.getDisplayName(), user.getEmail(), profile.getPhone(), profile.getLocation(),
                profile.getBio(), profile.getAvatarUrl(), user.isEmailVerified(), user.getCreatedAt(),
                profile.getUpdatedAt());
    }

    private UserPreferenceDetails preferenceDetails(
            UserPreferences userPreferences,
            UserPrivacySettings privacy) {
        return new UserPreferenceDetails(
                userPreferences.isPushNotifications(),
                userPreferences.isEmailUpdates(),
                privacy.isShowPhoneOnAds(),
                privacy.isPreciseLocation());
    }
}
