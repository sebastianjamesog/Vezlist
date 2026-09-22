package cc.vezlist.admin.domain;

public enum SecurityEventType {
    LOGIN_SUCCESS,
    LOGIN_FAILURE,
    LOGIN_BLOCKED_SUSPENDED,
    LOGOUT,
    REGISTER,
    PASSWORD_CHANGED,
    PASSWORD_CHANGE_FAILED
}
