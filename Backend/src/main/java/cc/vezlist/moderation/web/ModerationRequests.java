package cc.vezlist.moderation.web;

import java.util.UUID;
import cc.vezlist.moderation.domain.ModerationPolicy.*;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.constraints.*;

public final class ModerationRequests {
    private ModerationRequests() { }
    public record Report(@NotNull SiteScope site, @NotNull ReportReason reason, @Size(max = 1000) String details) { }
    public record Appeal(@NotNull SiteScope site, @NotBlank @Size(max = 2000) String message) { }
    public record Assignment(@NotNull UUID assigneeId) { }
    public record Note(@NotBlank @Size(max = 2000) String message) { }
    public record MediaReview(@NotNull UUID mediaId, @NotNull Verdict verdict,
                              @Size(max = 2000) String note) { }
    public record DecisionRequest(@NotNull Decision decision, PublicReason reason,
                                  @Size(max = 2000) String note, boolean eligibilityChecked) { }
}
