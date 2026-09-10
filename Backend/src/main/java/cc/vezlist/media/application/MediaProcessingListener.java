package cc.vezlist.media.application;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class MediaProcessingListener {
    private final MediaProcessor processor;

    public MediaProcessingListener(MediaProcessor processor) {
        this.processor = processor;
    }

    @Async("mediaTaskExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void process(MediaProcessingRequested event) {
        processor.process(event.mediaId());
    }
}
