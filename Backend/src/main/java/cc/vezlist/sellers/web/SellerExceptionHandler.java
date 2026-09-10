package cc.vezlist.sellers.web;

import java.time.Instant;
import java.util.List;
import cc.vezlist.sellers.application.SellerNotFoundException;
import cc.vezlist.shared.web.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = SellerController.class)
class SellerExceptionHandler {
    @ExceptionHandler(SellerNotFoundException.class)
    ResponseEntity<ApiError> sellerNotFound(SellerNotFoundException exception, HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "SELLER_NOT_FOUND", exception.getMessage(), request);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiError> invalidSellerRequest(IllegalArgumentException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "SELLER_QUERY_INVALID", exception.getMessage(), request);
    }

    private ResponseEntity<ApiError> error(HttpStatus status, String code, String message, HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ApiError(code, message, List.of(),
                request.getHeader("X-Request-Id"), Instant.now()));
    }
}
