package cc.vezlist.shared.web;

import java.time.Instant;
import java.util.List;

import cc.vezlist.identity.application.EmailAlreadyRegisteredException;
import cc.vezlist.catalog.application.CatalogAlreadyExistsException;
import cc.vezlist.catalog.application.CatalogInUseException;
import cc.vezlist.catalog.application.CatalogNotFoundException;
import cc.vezlist.catalog.application.CatalogReferenceInvalidException;
import cc.vezlist.discovery.application.DiscoveryCursorInvalidException;
import cc.vezlist.discovery.application.DiscoveryQueryInvalidException;
import cc.vezlist.identity.web.AccountSuspendedException;
import cc.vezlist.identity.web.InvalidCredentialsException;
import cc.vezlist.listings.application.IdempotencyConflictException;
import cc.vezlist.listings.application.ListingNotFoundException;
import cc.vezlist.listings.application.ListingStateException;
import cc.vezlist.media.application.MediaNotFoundException;
import cc.vezlist.media.application.MediaStateException;
import cc.vezlist.media.application.MediaValidationException;
import cc.vezlist.saved.application.SavedListingCursorInvalidException;
import cc.vezlist.saved.application.SavedListingQueryInvalidException;
import cc.vezlist.users.application.AdminActionConflictException;
import cc.vezlist.users.application.AdminUserNotFoundException;
import cc.vezlist.users.application.CurrentPasswordInvalidException;
import cc.vezlist.verification.application.VerificationNotFoundException;
import cc.vezlist.verification.application.VerificationStateException;
import cc.vezlist.verification.application.VerificationValidationException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.slf4j.MDC;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(EmailAlreadyRegisteredException.class)
    ResponseEntity<ApiError> handleDuplicateEmail(
            EmailAlreadyRegisteredException exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.CONFLICT,
                "EMAIL_ALREADY_REGISTERED",
                exception.getMessage(),
                List.of(),
                request);
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    ResponseEntity<ApiError> handleInvalidCredentials(
            InvalidCredentialsException exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.UNAUTHORIZED,
                "INVALID_CREDENTIALS",
                exception.getMessage(),
                List.of(),
                request);
    }

    @ExceptionHandler(AccountSuspendedException.class)
    ResponseEntity<ApiError> handleAccountSuspended(
            AccountSuspendedException exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.FORBIDDEN,
                "ACCOUNT_SUSPENDED",
                exception.getMessage(),
                List.of(),
                request);
    }

    @ExceptionHandler(CurrentPasswordInvalidException.class)
    ResponseEntity<ApiError> handleCurrentPasswordInvalid(
            CurrentPasswordInvalidException exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.BAD_REQUEST,
                "CURRENT_PASSWORD_INVALID",
                exception.getMessage(),
                List.of(new FieldViolation("currentPassword", exception.getMessage())),
                request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request) {
        List<FieldViolation> violations = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new FieldViolation(error.getField(), error.getDefaultMessage()))
                .toList();
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "One or more fields are invalid.", violations, request);
    }

    @ExceptionHandler({CatalogReferenceInvalidException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<ApiError> handleInvalidCatalogReference(
            Exception exception,
            HttpServletRequest request) {
        if (exception instanceof MethodArgumentTypeMismatchException
                && isSavedListingRequest(request)) {
            return error(
                    HttpStatus.BAD_REQUEST,
                    "SAVED_LISTING_QUERY_INVALID",
                    "One or more saved-listing request values are invalid.",
                    List.of(),
                    request);
        }
        if (exception instanceof MethodArgumentTypeMismatchException
                && request.getRequestURI().startsWith("/api/v1/listings")) {
            return error(
                    HttpStatus.BAD_REQUEST,
                    "DISCOVERY_QUERY_INVALID",
                    "One or more discovery query values are invalid.",
                    List.of(),
                    request);
        }
        return error(
                HttpStatus.BAD_REQUEST,
                "CATALOG_REFERENCE_INVALID",
                "The selected category or location is invalid.",
                List.of(),
                request);
    }

    @ExceptionHandler({ListingNotFoundException.class, MediaNotFoundException.class})
    ResponseEntity<ApiError> handleListingNotFound(
            RuntimeException exception,
            HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "LISTING_NOT_FOUND", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(MediaValidationException.class)
    ResponseEntity<ApiError> handleMediaValidation(
            MediaValidationException exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.BAD_REQUEST,
                "MEDIA_VALIDATION_ERROR",
                exception.getMessage(),
                List.of(),
                request);
    }

    @ExceptionHandler({ListingStateException.class, MediaStateException.class, IdempotencyConflictException.class,
            ObjectOptimisticLockingFailureException.class})
    ResponseEntity<ApiError> handleListingConflict(
            Exception exception,
            HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "LISTING_CONFLICT", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiError> handleAccessDenied(
            AccessDeniedException exception,
            HttpServletRequest request) {
        // Method-level @PreAuthorize checks (e.g. ADMIN-only admin actions) throw this from inside the
        // dispatch, so it must be mapped here explicitly - otherwise it would fall through to the generic
        // 500 handler below instead of reaching Spring Security's filter-level 403 translation.
        return error(HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to perform this action.",
                List.of(), request);
    }

    @ExceptionHandler(CatalogNotFoundException.class)
    ResponseEntity<ApiError> handleCatalogNotFound(
            CatalogNotFoundException exception,
            HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "CATALOG_ENTRY_NOT_FOUND", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(CatalogInUseException.class)
    ResponseEntity<ApiError> handleCatalogInUse(
            CatalogInUseException exception,
            HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "CATALOG_ENTRY_IN_USE", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(CatalogAlreadyExistsException.class)
    ResponseEntity<ApiError> handleCatalogAlreadyExists(
            CatalogAlreadyExistsException exception,
            HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "CATALOG_ENTRY_ALREADY_EXISTS", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(VerificationNotFoundException.class)
    ResponseEntity<ApiError> handleVerificationNotFound(
            VerificationNotFoundException exception,
            HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "VERIFICATION_REQUEST_NOT_FOUND", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(VerificationStateException.class)
    ResponseEntity<ApiError> handleVerificationState(
            VerificationStateException exception,
            HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "VERIFICATION_CONFLICT", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(VerificationValidationException.class)
    ResponseEntity<ApiError> handleVerificationValidation(
            VerificationValidationException exception,
            HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "VERIFICATION_VALIDATION_ERROR", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(AdminUserNotFoundException.class)
    ResponseEntity<ApiError> handleAdminUserNotFound(
            AdminUserNotFoundException exception,
            HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "ADMIN_USER_NOT_FOUND", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(AdminActionConflictException.class)
    ResponseEntity<ApiError> handleAdminActionConflict(
            AdminActionConflictException exception,
            HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "ADMIN_ACTION_CONFLICT", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiError> handleIllegalArgument(
            IllegalArgumentException exception,
            HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "REQUEST_INVALID", exception.getMessage(), List.of(), request);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> handleConstraintViolation(
            ConstraintViolationException exception,
            HttpServletRequest request) {
        List<FieldViolation> violations = exception.getConstraintViolations().stream()
                .map(violation -> new FieldViolation(
                        violation.getPropertyPath().toString(), violation.getMessage()))
                .toList();
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "One or more fields are invalid.", violations, request);
    }

    @ExceptionHandler(DiscoveryCursorInvalidException.class)
    ResponseEntity<ApiError> handleDiscoveryCursor(
            DiscoveryCursorInvalidException exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.BAD_REQUEST,
                "DISCOVERY_CURSOR_INVALID",
                exception.getMessage(),
                List.of(),
                request);
    }

    @ExceptionHandler(DiscoveryQueryInvalidException.class)
    ResponseEntity<ApiError> handleDiscoveryQuery(
            DiscoveryQueryInvalidException exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.BAD_REQUEST,
                "DISCOVERY_QUERY_INVALID",
                exception.getMessage(),
                List.of(),
                request);
    }

    @ExceptionHandler(SavedListingCursorInvalidException.class)
    ResponseEntity<ApiError> handleSavedListingCursor(
            SavedListingCursorInvalidException exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.BAD_REQUEST,
                "SAVED_LISTING_CURSOR_INVALID",
                exception.getMessage(),
                List.of(),
                request);
    }

    @ExceptionHandler(SavedListingQueryInvalidException.class)
    ResponseEntity<ApiError> handleSavedListingQuery(
            SavedListingQueryInvalidException exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.BAD_REQUEST,
                "SAVED_LISTING_QUERY_INVALID",
                exception.getMessage(),
                List.of(),
                request);
    }

    @ExceptionHandler({
            MissingRequestHeaderException.class,
            MissingServletRequestParameterException.class,
            HandlerMethodValidationException.class
    })
    ResponseEntity<ApiError> handleRequestConstraint(
            Exception exception,
            HttpServletRequest request) {
        if (isSavedListingRequest(request)) {
            return error(
                    HttpStatus.BAD_REQUEST,
                    "SAVED_LISTING_QUERY_INVALID",
                    "One or more saved-listing request values are invalid.",
                    List.of(),
                    request);
        }
        return error(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "One or more request values are invalid.",
                List.of(),
                request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception exception, HttpServletRequest request) {
        log.error("Unhandled API exception for {} {}", request.getMethod(), request.getRequestURI(), exception);
        return error(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "An unexpected error occurred.",
                List.of(),
                request);
    }

    private boolean isSavedListingRequest(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri.startsWith("/api/v1/me/saved-listings")
                || (uri.startsWith("/api/v1/listings/") && uri.endsWith("/saved"));
    }

    private ResponseEntity<ApiError> error(
            HttpStatus status,
            String code,
            String message,
            List<FieldViolation> details,
            HttpServletRequest request) {
        String traceId = MDC.get("traceId");
        if (traceId == null) {
            traceId = request.getHeader(TraceIdFilter.REQUEST_ID_HEADER);
        }
        ApiError body = new ApiError(code, message, details, traceId, Instant.now());
        return ResponseEntity.status(status).body(body);
    }
}
