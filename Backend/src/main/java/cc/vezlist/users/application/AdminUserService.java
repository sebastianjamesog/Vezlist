package cc.vezlist.users.application;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import cc.vezlist.admin.application.AdminAuditService;
import cc.vezlist.identity.domain.User;
import cc.vezlist.identity.persistence.UserRepository;
import cc.vezlist.shared.paging.OpaqueCursor;
import cc.vezlist.shared.security.AuthenticatedSessionService;
import cc.vezlist.users.persistence.AdminUserRepository;
import cc.vezlist.users.web.AdminUserDetailResponse;
import cc.vezlist.users.web.AdminUserPageResponse;
import cc.vezlist.users.web.AdminUserSummaryResponse;
import cc.vezlist.users.web.SuspendUserRequest;

@Service
public class AdminUserService {
    private static final int DEFAULT_LIMIT = 25;
    private static final int MAX_LIMIT = 100;

    private final AdminUserRepository users;
    private final UserRepository userRepository;
    private final AdminAuditService audit;
    private final AuthenticatedSessionService sessions;

    public AdminUserService(
            AdminUserRepository users,
            UserRepository userRepository,
            AdminAuditService audit,
            AuthenticatedSessionService sessions) {
        this.users = users;
        this.userRepository = userRepository;
        this.audit = audit;
        this.sessions = sessions;
    }

    @Transactional(readOnly = true)
    public AdminUserPageResponse list(String query, String encodedCursor, Integer requestedLimit, boolean staffOnly) {
        int limit = requestedLimit == null ? DEFAULT_LIMIT : requestedLimit;
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException("Limit must be between 1 and " + MAX_LIMIT + ".");
        }
        OpaqueCursor.Anchor cursor = OpaqueCursor.decode(encodedCursor);
        var fetched = users.page(query, cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id(), limit + 1, staffOnly);
        boolean hasMore = fetched.size() > limit;
        var page = hasMore ? fetched.subList(0, limit) : fetched;
        String nextCursor = hasMore
                ? OpaqueCursor.encode(new OpaqueCursor.Anchor(
                        page.get(page.size() - 1).createdAt(), page.get(page.size() - 1).id()))
                : null;
        return new AdminUserPageResponse(
                page.stream().map(this::summary).toList(), nextCursor, hasMore, users.countMatching(query, staffOnly));
    }

    @Transactional(readOnly = true)
    public AdminUserDetailResponse detail(UUID id) {
        var row = users.detail(id);
        if (row == null) throw new AdminUserNotFoundException();
        return new AdminUserDetailResponse(
                row.id(), row.displayName(), row.email(), row.roles(), row.enabled(), row.emailVerified(),
                row.createdAt(), row.suspendedAt(), row.suspensionReason(), row.listingCount(),
                row.activeListingCount());
    }

    @Transactional
    public AdminUserDetailResponse suspend(UUID actorId, UUID targetId, SuspendUserRequest request) {
        if (actorId.equals(targetId)) {
            throw new AdminActionConflictException("You cannot suspend your own account.");
        }
        User user = userRepository.findById(targetId).orElseThrow(AdminUserNotFoundException::new);
        boolean wasEnabled = user.isEnabled();
        user.suspend(request.reason());
        userRepository.saveAndFlush(user);
        if (wasEnabled) {
            audit.record(actorId, "USER_SUSPENDED", "USER", targetId.toString(), request.reason());
        }
        // Suspending must end every session opened before it, not just future
        // logins - enabled=false is otherwise never re-checked mid-session.
        sessions.revokeAllSessions(user.getEmail());
        return detail(targetId);
    }

    @Transactional
    public AdminUserDetailResponse reinstate(UUID actorId, UUID targetId) {
        User user = userRepository.findById(targetId).orElseThrow(AdminUserNotFoundException::new);
        boolean wasSuspended = !user.isEnabled();
        user.reinstate();
        userRepository.saveAndFlush(user);
        if (wasSuspended) {
            audit.record(actorId, "USER_REINSTATED", "USER", targetId.toString(), null);
        }
        return detail(targetId);
    }

    private AdminUserSummaryResponse summary(AdminUserRepository.Summary row) {
        return new AdminUserSummaryResponse(
                row.id(), row.displayName(), row.email(), row.roles(), row.enabled(), row.emailVerified(),
                row.createdAt(), row.listingCount());
    }
}
