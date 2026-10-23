package cc.vezlist.listings.web;

import static org.assertj.core.api.Assertions.assertThat;
import java.math.BigDecimal;
import java.util.Map;
import cc.vezlist.shared.domain.SiteScope;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;

class ListingWriteRequestValidationTest {
    @Test void pricesKeepCentsButCannotExceedFourDigits() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (String amount : new String[]{"0", "0.01", "1200.25", "9999.00"}) {
                assertThat(validator.validate(request(amount))).isEmpty();
            }
            for (String amount : new String[]{"-0.01", "10000", "9999.01", "3.456"}) {
                assertThat(validator.validate(request(amount))).anyMatch(v -> v.getPropertyPath().toString().equals("price"));
            }
        }
    }
    private ListingWriteRequest request(String price) {
        return new ListingWriteRequest(SiteScope.MARKETPLACE, "Valid title", "Advertiser", "Description with enough detail.",
                new BigDecimal(price), "services", "bc", "bc-1", "owner@example.test", "+12505550100", null, null, Map.of());
    }
}
