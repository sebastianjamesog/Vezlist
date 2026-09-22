package cc.vezlist.verification.application;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class VerificationPhotoProcessingListener {
    private final VerificationPhotoProcessor processor;

    public VerificationPhotoProcessingListener(VerificationPhotoProcessor processor) {
        this.processor = processor;
    }

    @Async("mediaTaskExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void process(VerificationPhotoProcessingRequested event) {
        processor.process(event.requestId());
    }
}
