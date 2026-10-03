package cc.vezlist.users.web;

import jakarta.validation.constraints.NotNull;

public record PreferencesUpdateRequest(
        @NotNull(message = "Push notification preference is required.") Boolean pushNotifications,
        @NotNull(message = "Email update preference is required.") Boolean emailUpdates,
        @NotNull(message = "Phone visibility preference is required.") Boolean showPhoneOnAds,
        @NotNull(message = "Location precision preference is required.") Boolean preciseLocation,
        Boolean availableNow) {
}
