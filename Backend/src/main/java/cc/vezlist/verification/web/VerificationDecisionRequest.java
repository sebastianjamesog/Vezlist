package cc.vezlist.verification.web;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record VerificationDecisionRequest(
        @NotNull Decision decision,
        @Size(max = 300) String reason) {

    public enum Decision { APPROVE, REJECT }
}
