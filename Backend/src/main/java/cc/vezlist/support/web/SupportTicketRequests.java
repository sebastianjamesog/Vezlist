package cc.vezlist.support.web;

import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class SupportTicketRequests {
    private SupportTicketRequests() {}

    public record Create(@NotNull SiteScope site,
                         @NotBlank @Size(max = 160) String subject,
                         @NotBlank @Size(max = 4000) String body) {}

    public record Reply(@NotBlank @Size(max = 4000) String body) {}

    public record Read(@NotNull java.util.UUID messageId) {}

    public record Status(@NotNull String status) {}
}
