package cc.vezlist.shared.web;

import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
public class ApiV1Controller {

    @GetMapping
    Map<String, String> apiInfo() {
        return Map.of("name", "Vezlist API", "version", "v1");
    }
}
