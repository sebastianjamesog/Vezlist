package cc.vezlist.moderation.application;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import cc.vezlist.moderation.domain.ModerationPolicy;
import cc.vezlist.moderation.domain.ModerationPolicy.*;
import cc.vezlist.moderation.persistence.ModerationRepository;
import cc.vezlist.moderation.persistence.ModerationRepository.Case;
import cc.vezlist.moderation.persistence.ModerationRepository.Listing;
import cc.vezlist.moderation.web.ModerationRequests.*;
import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.shared.domain.SiteScope;
import static org.springframework.http.HttpStatus.*;

@Service
public class ModerationService {
    private final ModerationRepository repository;
    private final ObjectStorage storage;
    public ModerationService(ModerationRepository repository, ObjectStorage storage) {
        this.repository = repository;
        this.storage = storage;
    }

    public record Receipt(UUID id) { }
    public record OwnerStatus(UUID listingId, String status, String publicReason, boolean appealAllowed) { }
    public record DecisionResult(UUID id, String listingStatus, String caseStatus, long approvals) { }

    @Transactional
    public Receipt report(UUID actor, UUID listingId, Report request) {
        // Serialize quota checks across application instances, not just within this JVM.
        requireEnabledActor(actor, true);
        Listing listing = repository.listing(listingId, true);
        requireSite(listing, request.site());
        if (!listing.status().equals("ACTIVE") || !listing.enabled() || listing.owner().equals(actor)
                || expired(listing)) throw new ModerationException(NOT_FOUND, "Listing is unavailable for reporting.");
        var previous = repository.query("SELECT id FROM reports WHERE reporter_id = ? AND listing_id = ?", actor, listingId);
        if (!previous.isEmpty()) return new Receipt((UUID) previous.getFirst().get("id"));
        if (repository.count("SELECT count(*) FROM reports WHERE reporter_id = ? AND created_at > now() - interval '1 hour'", actor) >= 5
                || repository.count("SELECT count(*) FROM reports WHERE reporter_id = ? AND created_at > now() - interval '1 day'", actor) >= 20)
            throw new ModerationException(TOO_MANY_REQUESTS, "Too many reports. Please try again later.");
        UUID caseId = repository.openCase(listing, "REPORT");
        UUID id = UUID.randomUUID();
        repository.update("INSERT INTO reports(id, case_id, listing_id, reporter_id, reason, details) VALUES (?, ?, ?, ?, ?, ?)",
                id, caseId, listingId, actor, request.reason().name(), request.details());
        repository.audit(actor, listingId, "REPORT_CREATED", null);
        return new Receipt(id);
    }

    @Transactional(readOnly = true)
    public OwnerStatus ownerStatus(UUID actor, UUID id, SiteScope site) {
        requireEnabledActor(actor, false);
        Listing listing = owned(actor, id, site, false);
        boolean appeal = List.of("REJECTED", "REMOVED").contains(listing.status())
                && !(listing.verificationRequested() && !listing.verified())
                && repository.count("SELECT count(*) FROM moderation_cases WHERE listing_id = ? AND kind = 'APPEAL' AND review_version = ?",
                    id, listing.version()) == 0;
        String reason = listing.reason() == null ? null : PublicReason.valueOf(listing.reason()).message();
        return new OwnerStatus(id, listing.status(), reason, appeal);
    }

    @Transactional
    public Receipt appeal(UUID actor, UUID id, Appeal request) {
        requireEnabledActor(actor, true);
        Listing listing = owned(actor, id, request.site(), true);
        if (!List.of("REJECTED", "REMOVED").contains(listing.status()))
            throw new ModerationException(CONFLICT, "Only rejected or removed listings can be appealed.");
        if (listing.verificationRequested() && !listing.verified())
            throw new ModerationException(CONFLICT, "Edit and resubmit this listing for verification instead of appealing.");
        var previous = repository.query("SELECT id FROM moderation_cases WHERE listing_id = ? AND kind = 'APPEAL' AND review_version = ?",
                id, listing.version());
        if (!previous.isEmpty()) return new Receipt((UUID) previous.getFirst().get("id"));
        if (repository.count("""
                SELECT count(*) FROM moderation_cases c JOIN listings l ON l.id = c.listing_id
                WHERE l.owner_id = ? AND c.kind = 'APPEAL' AND c.created_at > now() - interval '1 day'
                """, actor) >= 5) throw new ModerationException(TOO_MANY_REQUESTS, "Too many appeals. Please try again tomorrow.");
        UUID caseId = repository.openCase(listing, "APPEAL");
        repository.action(repository.caseById(caseId), actor, "APPEAL", null, request.message(), false);
        return new Receipt(caseId);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> queue(UUID actor, SiteScope site, int limit, int offset) {
        staff(actor);
        return repository.queue(site, limit, offset);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> detail(UUID actor, UUID caseId) {
        staff(actor);
        Case review = repository.caseById(caseId);
        Listing listing = repository.listing(review.listingId(), false);
        var content = repository.query("SELECT id, title, description, business_name, site_scope, category_id, status FROM listings WHERE id = ?", listing.id()).getFirst();
        var media = repository.query("SELECT id, status, checksum_sha256, object_key FROM listing_media WHERE listing_id = ? ORDER BY position, id LIMIT 6", listing.id());
        for (Map<String, Object> image : media) {
            Object objectKey = image.remove("object_key");
            image.put("url", "READY".equals(image.get("status")) ? storage.authorizeDownload(objectKey.toString()).toString() : null);
        }
        return Map.of("review", review, "listing", content, "policy", ModerationPolicy.forListing(listing.site(), listing.category()),
                "media", media, "mediaReviews", repository.query("SELECT media_id, reviewer_id, verdict, checksum_sha256 FROM moderation_media_reviews WHERE case_id = ? LIMIT 100", caseId),
                "reports", repository.query("SELECT id, reason, details, created_at FROM reports WHERE case_id = ? ORDER BY created_at, id LIMIT 100", caseId),
                "actions", repository.query("SELECT * FROM moderation_actions WHERE case_id = ? ORDER BY created_at DESC, id DESC LIMIT 100", caseId));
    }

    @Transactional
    public Receipt assign(UUID actor, UUID caseId, Assignment request) {
        staff(actor);
        Case review = lockedCase(caseId);
        requireOpen(review);
        Listing listing = repository.listing(review.listingId(), false);
        notOwner(actor, listing);
        staff(request.assigneeId());
        notOwner(request.assigneeId(), listing);
        if (repository.count("SELECT count(*) FROM moderation_actions WHERE case_id = ? AND actor_id = ? AND action = 'APPROVE'",
                caseId, request.assigneeId()) > 0)
            throw new ModerationException(CONFLICT, "A different reviewer must complete this case.");
        if (!actor.equals(request.assigneeId()) && !admin(actor))
            throw new ModerationException(FORBIDDEN, "Only administrators can assign another reviewer.");
        if (review.assignee() != null && !review.assignee().equals(actor) && !admin(actor))
            throw new ModerationException(CONFLICT, "This case is assigned to another reviewer.");
        repository.update("UPDATE moderation_cases SET assigned_to = ? WHERE id = ?", request.assigneeId(), caseId);
        return new Receipt(repository.action(review, actor, "ASSIGN", null, request.assigneeId().toString(), false));
    }

    @Transactional
    public Receipt note(UUID actor, UUID caseId, Note request) {
        staff(actor);
        Case review = lockedCase(caseId);
        requireReviewer(actor, review);
        return new Receipt(repository.action(review, actor, "NOTE", null, request.message(), false));
    }

    @Transactional
    public Receipt reviewMedia(UUID actor, UUID caseId, MediaReview request) {
        staff(actor);
        Case review = lockedCase(caseId);
        requireReviewer(actor, review);
        var images = repository.query("SELECT checksum_sha256 FROM listing_media WHERE id = ? AND listing_id = ? AND status = 'READY' FOR UPDATE",
                request.mediaId(), review.listingId());
        if (images.isEmpty()) throw new ModerationException(CONFLICT, "Only ready media belonging to this listing can be reviewed.");
        // Once an approval is recorded its evidence cannot be changed underneath it.
        if (repository.count("SELECT count(*) FROM moderation_actions WHERE case_id = ? AND actor_id = ? AND action = 'APPROVE'", caseId, actor) > 0)
            throw new ModerationException(CONFLICT, "Your approval has already been recorded.");
        UUID id = UUID.randomUUID();
        repository.update("""
                INSERT INTO moderation_media_reviews(id, case_id, media_id, reviewer_id, checksum_sha256, verdict)
                VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(case_id, media_id, reviewer_id)
                DO UPDATE SET checksum_sha256 = EXCLUDED.checksum_sha256, verdict = EXCLUDED.verdict, created_at = now()
                """, id, caseId, request.mediaId(), actor, images.getFirst().get("checksum_sha256"), request.verdict().name());
        return new Receipt(repository.action(review, actor, "MEDIA_" + request.verdict().name(), null,
                request.mediaId() + (request.note() == null ? "" : ": " + request.note().substring(0, Math.min(1900, request.note().length()))), false));
    }

    @Transactional
    public DecisionResult decide(UUID actor, UUID caseId, DecisionRequest request) {
        staff(actor);
        Case review = lockedCase(caseId);
        Listing listing = repository.listing(review.listingId(), false);
        notOwner(actor, listing);
        // A repeated vote or final decision is safe to retry; other actions on closed cases conflict.
        if (repository.count("SELECT count(*) FROM moderation_actions WHERE case_id = ? AND actor_id = ? AND action = ?",
                caseId, actor, request.decision().name()) > 0)
            return result(review, listing.status());
        requireReviewer(actor, review);
        if (!listing.enabled() || listing.status().equals("DELETED"))
            throw new ModerationException(CONFLICT, "Listing is no longer available for review.");
        if (!review.kind().equals("REPORT") && listing.version() != review.reviewVersion())
            throw new ModerationException(CONFLICT, "Listing changed during review. A new submission is required.");
        switch (request.decision()) {
            case APPROVE -> approve(actor, review, listing, request);
            case REJECT -> {
                if (!listing.status().equals("PENDING_REVIEW") && !review.kind().equals("APPEAL"))
                    throw new ModerationException(CONFLICT, "Only pending submissions or appeals may be rejected.");
                reasonRequired(request);
                finish(review, actor, request, review.kind().equals("APPEAL") && listing.status().equals("REMOVED") ? "REMOVED" : "REJECTED");
            }
            case REMOVE -> {
                if (!listing.status().equals("ACTIVE")) throw new ModerationException(CONFLICT, "Only active listings may be removed.");
                reasonRequired(request);
                finish(review, actor, request, "REMOVED");
            }
            case DISMISS -> {
                if (!review.kind().equals("REPORT") || !listing.status().equals("ACTIVE"))
                    throw new ModerationException(CONFLICT, "Only reports on active listings may be dismissed.");
                repository.action(review, actor, "DISMISS", null, request.note(), false);
                close(review);
            }
        }
        return result(repository.caseById(caseId), repository.listing(listing.id(), false).status());
    }

    private void approve(UUID actor, Case review, Listing listing, DecisionRequest request) {
        if (listing.verificationRequested() && !listing.verified())
            throw new ModerationException(CONFLICT, "Complete verification review before publishing this listing.");
        if (!listing.status().equals("PENDING_REVIEW") && !review.kind().equals("APPEAL"))
            throw new ModerationException(CONFLICT, "Only pending submissions or appeals may be approved.");
        ModerationPolicy policy = ModerationPolicy.forListing(listing.site(), listing.category());
        if (policy.eligibilityRequired() && !request.eligibilityChecked())
            throw new ModerationException(CONFLICT, "Personals approval requires an eligibility and consent check.");
        if (repository.count("SELECT count(*) FROM categories WHERE id = ? AND site_scope = ? AND enabled = true", listing.category(), listing.site().name()) == 0)
            throw new ModerationException(CONFLICT, "The listing category is no longer enabled.");
        long images = repository.count("SELECT count(*) FROM listing_media WHERE listing_id = ? AND status = 'READY'", listing.id());
        if (images == 0 || repository.count("SELECT count(*) FROM listing_media WHERE listing_id = ? AND status <> 'READY'", listing.id()) > 0)
            throw new ModerationException(CONFLICT, "Every attached image must finish processing successfully before approval.");
        if (repository.count("""
                SELECT count(*) FROM moderation_media_reviews r JOIN listing_media m ON m.id = r.media_id
                WHERE r.case_id = ? AND r.verdict = 'BLOCK' AND r.checksum_sha256 = m.checksum_sha256
                """, review.id()) > 0) throw new ModerationException(CONFLICT, "A media safety review blocks approval.");
        long checked = repository.count("""
                SELECT count(*) FROM moderation_media_reviews r JOIN listing_media m ON m.id = r.media_id
                WHERE r.case_id = ? AND r.reviewer_id = ? AND r.verdict = 'PASS'
                  AND m.listing_id = ? AND m.status = 'READY' AND r.checksum_sha256 = m.checksum_sha256
                """, review.id(), actor, listing.id());
        if (checked != images) throw new ModerationException(CONFLICT, "Review every ready image before approving.");
        repository.action(review, actor, "APPROVE", null, request.note(), request.eligibilityChecked());
        if (approvals(review.id()) >= policy.approvalsRequired()) {
            long staleApprovals = repository.count("""
                    SELECT count(*) FROM moderation_actions a WHERE a.case_id = ? AND a.action = 'APPROVE'
                    AND (SELECT count(*) FROM moderation_media_reviews r JOIN listing_media m ON m.id = r.media_id
                         WHERE r.case_id = a.case_id AND r.reviewer_id = a.actor_id AND r.verdict = 'PASS'
                           AND m.listing_id = a.listing_id AND m.status = 'READY'
                           AND r.checksum_sha256 = m.checksum_sha256) <> ?
                    """, review.id(), images);
            if (staleApprovals > 0) throw new ModerationException(CONFLICT, "Media changed after an earlier approval. Submit the listing for a new review.");
            changeStatus(review, "ACTIVE", null);
            close(review);
        } else {
            // Release the claim so a different reviewer can provide the second approval.
            repository.update("UPDATE moderation_cases SET assigned_to = NULL WHERE id = ?", review.id());
        }
    }

    private void finish(Case review, UUID actor, DecisionRequest request, String status) {
        repository.action(review, actor, request.decision().name(), request.reason().name(), request.note(), false);
        changeStatus(review, status, request.reason().name());
        close(review);
    }
    private void changeStatus(Case review, String status, String reason) {
        repository.update("""
                UPDATE listings SET status = ?, moderation_reason = ?, version = version + 1, updated_at = now(),
                    published_at = CASE WHEN ? = 'ACTIVE' THEN now() ELSE published_at END,
                    expires_at = CASE WHEN ? = 'ACTIVE' THEN now() + interval '30 days' ELSE expires_at END
                WHERE id = ?
                """, status, reason, status, status, review.listingId());
        String event = switch (status) { case "ACTIVE" -> "LISTING_APPROVED"; case "REMOVED" -> "LISTING_REMOVED"; default -> "LISTING_REJECTED"; };
        // Durable outbox row is visible to future notification workers only after commit.
        repository.update("INSERT INTO listing_events(id, listing_id, event_type) VALUES (?, ?, ?)", UUID.randomUUID(), review.listingId(), event);
    }
    private void close(Case review) { repository.update("UPDATE moderation_cases SET status = 'CLOSED', closed_at = now() WHERE id = ?", review.id()); }
    private long approvals(UUID caseId) { return repository.count("SELECT count(*) FROM moderation_actions WHERE case_id = ? AND action = 'APPROVE'", caseId); }
    private DecisionResult result(Case review, String status) { return new DecisionResult(review.id(), status, review.status(), approvals(review.id())); }
    private Case lockedCase(UUID id) {
        Case initial = repository.caseById(id);
        repository.listing(initial.listingId(), true);
        return repository.caseById(id);
    }
    private void requireReviewer(UUID actor, Case review) {
        requireOpen(review);
        notOwner(actor, repository.listing(review.listingId(), false));
        if (!actor.equals(review.assignee())) throw new ModerationException(CONFLICT, "Claim this case before reviewing it.");
    }
    private void requireOpen(Case review) { if (!review.status().equals("OPEN")) throw new ModerationException(CONFLICT, "This case is closed."); }
    private void reasonRequired(DecisionRequest request) { if (request.reason() == null) throw new ModerationException(BAD_REQUEST, "A public reason is required."); }
    private void requireSite(Listing listing, SiteScope site) { if (listing.site() != site) throw new ModerationException(NOT_FOUND, "Listing not found."); }
    private boolean expired(Listing listing) { return listing.expiresAt() != null && !listing.expiresAt().isAfter(Instant.now()); }
    private void notOwner(UUID actor, Listing listing) { if (listing.owner().equals(actor)) throw new ModerationException(FORBIDDEN, "You cannot moderate your own listing."); }
    private Listing owned(UUID actor, UUID id, SiteScope site, boolean lock) {
        Listing listing = repository.listing(id, lock);
        requireSite(listing, site);
        if (!listing.owner().equals(actor) || listing.status().equals("DELETED")) throw new ModerationException(NOT_FOUND, "Listing not found.");
        return listing;
    }
    private void requireEnabledActor(UUID actor, boolean lock) {
        if (repository.query("SELECT id FROM app_users WHERE id = ? AND enabled = true" + (lock ? " FOR UPDATE" : ""), actor).isEmpty())
            throw new ModerationException(FORBIDDEN, "This account is not available.");
    }
    private boolean admin(UUID actor) { return repository.count("SELECT count(*) FROM user_roles WHERE user_id = ? AND role = 'ADMIN'", actor) > 0; }
    private void staff(UUID actor) {
        requireEnabledActor(actor, false);
        if (repository.count("SELECT count(*) FROM user_roles WHERE user_id = ? AND role IN ('MODERATOR', 'ADMIN')", actor) == 0)
            throw new ModerationException(FORBIDDEN, "Staff access is required.");
    }
}
