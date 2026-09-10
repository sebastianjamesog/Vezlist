package cc.vezlist.sellers.web;

import java.time.Instant;
import java.util.UUID;

/** Public projection: intentionally excludes contact, bio, roles, and account data. */
public record SellerResponse(UUID id, String displayName, String avatarUrl, Instant memberSince,
                             boolean verified, String responseTime) { }
