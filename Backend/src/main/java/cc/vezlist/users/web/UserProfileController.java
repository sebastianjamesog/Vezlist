package cc.vezlist.users.web;

import cc.vezlist.admin.application.SecurityEventService;
import cc.vezlist.admin.domain.SecurityEventType;
import cc.vezlist.identity.application.IdentityService;
import cc.vezlist.identity.application.VezlistUserPrincipal;
import cc.vezlist.shared.security.AuthenticatedSessionService;
import cc.vezlist.users.application.CurrentPasswordInvalidException;
import cc.vezlist.users.application.DeletionRequestDetails;
import cc.vezlist.users.application.UserPreferenceDetails;
import cc.vezlist.users.application.UserProfileDetails;
import cc.vezlist.users.application.UserProfileService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
public class UserProfileController {

    private final UserProfileService profileService;
    private final cc.vezlist.users.application.AdLocationService adLocation;
    private final IdentityService identityService;
    private final AuthenticatedSessionService sessionService;
    private final SecurityEventService securityEvents;

    public UserProfileController(
            UserProfileService profileService,
            cc.vezlist.users.application.AdLocationService adLocation,
            IdentityService identityService,
            AuthenticatedSessionService sessionService,
            SecurityEventService securityEvents) {
        this.profileService = profileService;
        this.adLocation = adLocation;
        this.identityService = identityService;
        this.sessionService = sessionService;
        this.securityEvents = securityEvents;
    }

    @GetMapping("/profile")
    UserProfileDetails profile(@AuthenticationPrincipal VezlistUserPrincipal principal) {
        return profileService.getProfile(principal.id());
    }

    @PatchMapping("/profile")
    UserProfileDetails updateProfile(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @Valid @RequestBody ProfileUpdateRequest request,
            HttpServletRequest httpRequest) {
        UserProfileDetails result = profileService.updateProfile(
                principal.id(), request.name(), request.email(), request.phone(), request.location(), request.bio());
        VezlistUserPrincipal updated = identityService.loadUserById(principal.id());
        if (!principal.email().equals(updated.email())) {
            sessionService.revokeOtherSessions(principal.email(), httpRequest.getSession().getId());
            httpRequest.changeSessionId();
        }
        sessionService.replacePrincipal(updated, httpRequest);
        return result;
    }

    @GetMapping("/preferences")
    UserPreferenceDetails preferences(@AuthenticationPrincipal VezlistUserPrincipal principal) {
        return profileService.getPreferences(principal.id());
    }

    @PatchMapping("/preferences")
    UserPreferenceDetails updatePreferences(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @Valid @RequestBody PreferencesUpdateRequest request) {
        return profileService.updatePreferences(
                principal.id(), request.pushNotifications(), request.emailUpdates(),
                request.showPhoneOnAds(), request.preciseLocation(), request.availableNow());
    }

    @PatchMapping("/ad-location")
    UserPreferenceDetails updateAdLocation(@AuthenticationPrincipal VezlistUserPrincipal principal,
            @Valid @RequestBody AdLocationRequest request) {
        adLocation.setLocation(principal.id(), request.latitude(), request.longitude());
        return profileService.getPreferences(principal.id());
    }

    @PatchMapping("/password")
    ResponseEntity<Void> changePassword(
            @AuthenticationPrincipal VezlistUserPrincipal principal,
            @Valid @RequestBody PasswordChangeRequest request,
            HttpServletRequest httpRequest) {
        try {
            profileService.changePassword(principal.id(), request.currentPassword(), request.newPassword());
        } catch (CurrentPasswordInvalidException exception) {
            securityEvents.record(
                    SecurityEventType.PASSWORD_CHANGE_FAILED, principal.id(), principal.email(), httpRequest, null);
            throw exception;
        }
        String currentSessionId = httpRequest.getSession(false).getId();
        sessionService.revokeOtherSessions(principal.email(), currentSessionId);
        httpRequest.changeSessionId();
        sessionService.replacePrincipal(identityService.loadUserById(principal.id()), httpRequest);
        securityEvents.record(SecurityEventType.PASSWORD_CHANGED, principal.id(), principal.email(), httpRequest, null);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    ResponseEntity<DeletionRequestDetails> requestDeletion(
            @AuthenticationPrincipal VezlistUserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(profileService.requestDeletion(principal.id()));
    }
}
