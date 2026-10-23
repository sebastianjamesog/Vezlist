package cc.vezlist.identity.web;

public class ConsoleAccessException extends RuntimeException {
    public ConsoleAccessException() {
        super("This account does not have console access. An Admin or Moderator role is required.");
    }
}
