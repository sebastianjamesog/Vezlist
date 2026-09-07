package cc.vezlist.users.application;

import java.time.Instant;
import java.util.UUID;

import cc.vezlist.users.domain.AccountDeletionStatus;

public record DeletionRequestDetails(UUID requestId, AccountDeletionStatus status, Instant requestedAt) {
}
