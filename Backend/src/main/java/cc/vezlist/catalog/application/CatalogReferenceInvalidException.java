package cc.vezlist.catalog.application;

public class CatalogReferenceInvalidException extends RuntimeException {
    public CatalogReferenceInvalidException(String message) {
        super(message);
    }
}
