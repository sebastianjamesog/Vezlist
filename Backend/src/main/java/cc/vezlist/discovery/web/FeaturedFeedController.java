package cc.vezlist.discovery.web;

import cc.vezlist.discovery.application.FeaturedFeedService;
import cc.vezlist.discovery.application.FeaturedFeedService.Feed;
import cc.vezlist.discovery.application.FeaturedFeedService.Page;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/personals/featured")
public class FeaturedFeedController {
    private final FeaturedFeedService featured;

    public FeaturedFeedController(FeaturedFeedService featured) {
        this.featured = featured;
    }

    @GetMapping
    public Page list(@RequestParam Feed feed, @RequestParam(defaultValue = "false") boolean all) {
        return featured.get(feed, all);
    }
}
