import { beforeEach, expect, test, vi } from "vitest";
import { renderAdmin, screen, userEvent, waitFor, within } from "../../../../testing/render.jsx";
import * as auth from "../lib/api/auth.js";
import * as api from "../lib/api/adminStories.js";
import Status from "./Status.jsx";
vi.mock("../lib/api/auth.js", () => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock("../lib/api/adminStories.js", () => ({ listAdminStories: vi.fn(), removeAdminStory: vi.fn(), removeCreatorStories: vi.fn() }));
const item = { id: "story-1", ownerId: "creator-1", creatorName: "Test creator", mediaType: "VIDEO", mediaUrl: "https://media.test/video.mp4" };
beforeEach(() => {
  vi.resetAllMocks();
  auth.me.mockResolvedValue({id:"admin",name:"Admin",email:"admin@example.test",roles:["ADMIN"]});
  api.listAdminStories.mockResolvedValue({items:[item],hasMore:false});
});
test("real stories require confirmed successful removal and survive failed removal", async () => {
  api.removeAdminStory.mockRejectedValueOnce(new Error("Please retry")).mockResolvedValueOnce();
  renderAdmin(<Status />);
  await userEvent.click(await screen.findByRole("button", {name:"Remove update from Test creator"}));
  expect(api.removeAdminStory).not.toHaveBeenCalled();
  let dialog = screen.getByRole("dialog");
  await userEvent.click(within(dialog).getByRole("button",{name:"Remove",exact:true}));
  await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toBe("Please retry"));
  expect(screen.getByRole("button",{name:"Remove update from Test creator"})).toBeTruthy();
  await userEvent.click(within(dialog).getByRole("button",{name:"Remove",exact:true}));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("button",{name:"Remove update from Test creator"})).toBeNull();
  expect(api.removeAdminStory).toHaveBeenLastCalledWith("story-1");
});
test("pagination appends stories and video stays hidden until reveal", async () => {
  api.listAdminStories.mockResolvedValueOnce({items:[item],hasMore:true,nextCursor:"next"})
    .mockResolvedValueOnce({items:[{...item,id:"story-2",ownerId:"creator-2",creatorName:"Second creator"}],hasMore:false});
  const {container} = renderAdmin(<Status />);
  await screen.findByText("Test creator");
  expect(container.querySelector("video")).toBeNull();
  await userEvent.click(screen.getByRole("button",{name:"Reveal media"}));
  expect(container.querySelector("video").getAttribute("src")).toBe(item.mediaUrl);
  await userEvent.click(screen.getByRole("button",{name:"Load more"}));
  await screen.findByText("Second creator");
  expect(screen.getByText("Test creator")).toBeTruthy();
  expect(api.listAdminStories).toHaveBeenLastCalledWith({limit:50,cursor:"next"});
});
