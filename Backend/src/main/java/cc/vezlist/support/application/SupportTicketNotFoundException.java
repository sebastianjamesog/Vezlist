package cc.vezlist.support.application;

public class SupportTicketNotFoundException extends RuntimeException {
    public SupportTicketNotFoundException() {
        super("Support ticket was not found.");
    }
}
