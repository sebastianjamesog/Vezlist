package cc.vezlist.verification.web;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record VerificationDecisionRequest(
        @NotNull Decision decision,
        @Size(max = 300) String reason,
        @Size(max = 6) List<@NotNull UUID> verifiedMediaIds) {

    public enum Decision { APPROVE, REJECT }
}
