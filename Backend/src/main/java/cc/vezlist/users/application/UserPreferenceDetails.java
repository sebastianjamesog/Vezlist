package cc.vezlist.users.application;

public record UserPreferenceDetails(
        boolean pushNotifications,
        boolean emailUpdates,
        boolean showPhoneOnAds,
        boolean preciseLocation) {
}
