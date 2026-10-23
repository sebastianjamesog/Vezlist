package cc.vezlist.shared.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.util.Map;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.slf4j.LoggerFactory;

import cc.vezlist.support.application.SupportTicketEvents;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class SupportStreamExceptionHandlingTest {
    private final StreamController controller = new StreamController();
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new ApiExceptionHandler()).build();

    @ParameterizedTest
    @ValueSource(strings = {"disconnect", "wrapped-disconnect", "timeout", "unexpected"})
    void asyncFailuresDoNotAppendJsonToAnEstablishedEventStream(String failure) throws Exception {
        var opened = mvc.perform(get("/test/tickets/events"))
                .andExpect(request().asyncStarted())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)).andReturn();
        String initial = opened.getResponse().getContentAsString();
        assertThat(initial).contains("tickets-changed");
        Throwable exception = switch (failure) {
            case "disconnect" -> new IOException("Broken pipe");
            case "wrapped-disconnect" -> new IllegalStateException("Async write failed", new IOException("Connection reset"));
            case "timeout" -> new AsyncRequestTimeoutException();
            default -> new IllegalStateException("Real stream defect");
        };
        var logs = new ListAppender<ILoggingEvent>();
        logs.start();
        Logger handlerLog = (Logger) LoggerFactory.getLogger(ApiExceptionHandler.class);
        Logger resolverLog = (Logger) LoggerFactory.getLogger("org.springframework.web.servlet.mvc.method.annotation.ExceptionHandlerExceptionResolver");
        handlerLog.addAppender(logs);
        resolverLog.addAppender(logs);
        try {
            controller.emitter.completeWithError(exception);
            var completed = mvc.perform(asyncDispatch(opened)).andReturn();
            assertThat(completed.getResolvedException()).isSameAs(exception);
            assertThat(completed.getResponse().getContentAsString()).isEqualTo(initial);
            assertThat(completed.getResponse().getContentAsString()).doesNotContain("INTERNAL_ERROR");
            if (failure.equals("unexpected")) {
                assertThat(logs.list).hasSize(1);
                assertThat(logs.list.getFirst().getFormattedMessage()).contains("Unhandled API exception");
            } else {
                assertThat(logs.list).isEmpty();
            }
        } finally {
            handlerLog.detachAppender(logs);
            resolverLog.detachAppender(logs);
            logs.stop();
        }
    }

    @Test void ordinaryApiIoErrorsStillReturnAnInternalError() throws Exception {
        mvc.perform(get("/test/regular"))
                .andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
    }

    @Test void aClientHeaderCannotSuppressOrdinaryApiErrors() throws Exception {
        mvc.perform(get("/test/regular").accept(MediaType.ALL)
                        .header("X-Support-Stream", "true"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
    }

    @RestController
    static class StreamController {
        SseEmitter emitter;
        @GetMapping(value = "/test/tickets/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
        SseEmitter stream(HttpServletRequest request, HttpServletResponse response) throws IOException {
            request.setAttribute(SupportTicketEvents.STREAM_REQUEST_ATTRIBUTE, Boolean.TRUE);
            emitter = new SseEmitter(60000L);
            emitter.send(SseEmitter.event().name("tickets-changed").data(Map.of("ticketId", "test")));
            return emitter;
        }
        @GetMapping("/test/regular")
        void regular() throws IOException { throw new IOException("Unexpected storage failure"); }
    }
}
