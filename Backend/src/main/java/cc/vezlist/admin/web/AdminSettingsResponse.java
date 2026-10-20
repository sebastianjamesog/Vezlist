package cc.vezlist.admin.web;

public record AdminSettingsResponse(String ageGateTitle, String ageGateBody,
        int reviewSlaHours, int reportSlaHours, int ticketSlaHours, long version) { }
