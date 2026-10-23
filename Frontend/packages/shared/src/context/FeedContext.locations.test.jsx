import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,expect,test,vi} from "vitest";
import {FeedProvider,useFeed} from "./FeedContext.jsx";
import {getCategories,getLocations} from "../lib/api/catalog.js";
vi.mock("../lib/api/catalog.js",()=>({getCategories:vi.fn(),getLocations:vi.fn()}));
const tree={provinces:[{id:"on",label:"Ontario",areas:[]}],popularAreas:[]};
function Probe(){const value=useFeed();return <><output data-testid="state">{JSON.stringify({categories:value.categories,locations:value.locations,ready:value.taxonomyReady,error:!!value.taxonomyError})}</output><button onClick={value.reloadTaxonomy}>Retry catalog</button></>;}
const state=()=>JSON.parse(screen.getByTestId("state").textContent);
beforeEach(()=>vi.resetAllMocks());
test("category failure does not discard successful locations and retry updates categories",async()=>{
 getCategories.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue([{id:"fresh",label:"Fresh category"}]);
 getLocations.mockResolvedValue(tree);
 render(<FeedProvider><Probe/></FeedProvider>);
 await waitFor(()=>expect(state().ready).toBe(true));
 expect(state()).toMatchObject({categories:[],locations:tree,error:true});
 fireEvent.click(screen.getByRole("button",{name:"Retry catalog"}));
 await waitFor(()=>expect(state().categories).toEqual([{id:"fresh",label:"Fresh category"}]));
 expect(state().locations).toEqual(tree);
});
test("location failure preserves categories and focus reloads an updated location catalog",async()=>{
 getCategories.mockResolvedValue([{id:"cars",label:"Cars"}]);
 getLocations.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(tree);
 render(<FeedProvider><Probe/></FeedProvider>);
 await waitFor(()=>expect(state().ready).toBe(true));
 expect(state()).toMatchObject({categories:[{id:"cars",label:"Cars"}],locations:null,error:true});
 fireEvent.focus(window);
 await waitFor(()=>expect(state().locations).toEqual(tree));
 expect(state().categories).toEqual([{id:"cars",label:"Cars"}]);
});
