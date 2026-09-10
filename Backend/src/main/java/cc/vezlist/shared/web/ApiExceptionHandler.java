package cc.vezlist.shared.web;

import java.time.Instant;
import java.util.List;

import cc.vezlist.identity.application.EmailAlreadyRegisteredException;
import cc.vezlist.catalog.application.CatalogReferenceInvalidException;
import cc.vezlist.identity.web.InvalidCredentialsException;
import cc.vezlist.listings.application.IdempotencyConflictException;
import cc.vezlist.listings.application.ListingNotFoundException;
import cc.vezlist.listings.application.ListingStateException;
import cc.vezlist.media.application.MediaNotFoundException;
import cc.vezlist.media.application.MediaStateException;
import cc.vezlist.media.application.MediaValidationException;
import cc.vezlist.users.application.CurrentPasswordInvalidException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class ApiExceptionHandler {

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

    @ExceptionHandler({MissingRequestHeaderException.class, HandlerMethodValidationException.class})
    ResponseEntity<ApiError> handleRequestConstraint(
            Exception exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "One or more request values are invalid.",
                List.of(),
                request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception exception, HttpServletRequest request) {
        return error(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "An unexpected error occurred.",
                List.of(),
                request);
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
