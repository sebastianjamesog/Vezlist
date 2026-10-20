import { beforeEach, expect, test, vi } from "vitest";
import { renderAdmin, screen } from "../../../../testing/render.jsx";
import { setRoute } from "../../../../testing/stubs/next-navigation.js";
import * as auth from "../lib/api/auth.js";
import * as analytics from "../lib/api/adminAnalytics.js";
import * as audit from "../lib/api/adminAudit.js";
import Dashboard from "./Dashboard.jsx";
vi.mock("../lib/api/auth.js", () => ({me:vi.fn(),login:vi.fn(),logout:vi.fn()}));
vi.mock("../lib/api/adminAnalytics.js", () => ({analyticsSummary:vi.fn(),queueCounts:vi.fn()}));
vi.mock("../lib/api/adminAudit.js", () => ({auditFeed:vi.fn()}));
beforeEach(() => {
 vi.resetAllMocks();
 auth.me.mockResolvedValue({id:"admin",name:"Admin",roles:["ADMIN"]});
 analytics.analyticsSummary.mockResolvedValue({totalUsers:8,suspendedUsers:1,totalListings:4,listingsByStatus:{PENDING_REVIEW:3,ACTIVE:1},newListingsLast7Days:2,newListingsLast30Days:4,activeReportsCount:0,openModerationCasesCount:0});
 analytics.queueCounts.mockResolvedValue({openAppeals:2});
 audit.auditFeed.mockResolvedValue({items:[]});
 setRoute({path:"/",query:"site=personals"});
});
test("dashboard shows actual pending review status and opens the scoped queue", async () => {
 renderAdmin(<Dashboard />);
 expect(await screen.findByText("3 ads waiting on a decision across personals.")).toBeTruthy();
 expect(screen.getByRole("link",{name:"Open the queue"}).getAttribute("href")).toBe("/listings?status=PENDING_REVIEW&site=personals");
 expect(screen.getByText("Shared across both sites")).toBeTruthy();
});
