package cc.vezlist.identity.web;

import static org.assertj.core.api.Assertions.assertThat;

import cc.vezlist.users.web.PasswordChangeRequest;
import org.junit.jupiter.api.Test;

class SensitiveRequestLoggingTest {

    @Test
    void passwordBearingRequestsRedactTheirStringRepresentation() {
        String secret = "NeverLogThis123!";

        assertThat(new RegisterRequest("Name", "name@example.test", secret, true).toString())
                .doesNotContain(secret)
                .contains("[REDACTED]");
        assertThat(new LoginRequest("name@example.test", secret).toString())
                .doesNotContain(secret)
                .contains("[REDACTED]");
        assertThat(new PasswordChangeRequest(secret, secret + "New").toString())
                .doesNotContain(secret)
                .contains("[REDACTED]");
    }
}
