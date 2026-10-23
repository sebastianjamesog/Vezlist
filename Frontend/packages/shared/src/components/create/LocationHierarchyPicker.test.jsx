import { useState } from "react";
import { act,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { beforeEach,expect,test,vi } from "vitest";
import LocationPicker from "./LocationPicker.jsx";
import {getLocations,searchLocations} from "../../lib/api/catalog.js";
import {draftFromListing,toListingWriteRequest,EMPTY_DRAFT} from "../../lib/adDraft.js";
vi.mock("../../lib/api/catalog.js",()=>({getLocations:vi.fn(),searchLocations:vi.fn()}));
const catalog={provinces:[{id:"on",label:"Ontario",areas:[{id:"gta",label:"Greater Toronto",neighbourhoods:[{id:"scar",label:"Scarborough"}]}]}],popularAreas:[]};
function Harness({initial={}}){const[draft,setDraft]=useState({...EMPTY_DRAFT,...initial});return <><LocationPicker draft={draft} onPatch={patch=>setDraft(d=>({...d,...patch}))}/><output data-testid="draft">{JSON.stringify(draft)}</output></>;}
const value=()=>JSON.parse(screen.getByTestId("draft").textContent);
beforeEach(()=>{vi.resetAllMocks();getLocations.mockResolvedValue(catalog);searchLocations.mockResolvedValue([]);});

test("posting selects province region and neighbourhood while region-only remains valid",async()=>{
 render(<Harness/>);
 fireEvent.click(screen.getByRole("button",{name:"Choose by province, region and neighbourhood"}));
 await waitFor(()=>expect(screen.getByRole("combobox",{name:"Province"}).disabled).toBe(false));
 fireEvent.change(screen.getByRole("combobox",{name:"Province"}),{target:{value:"on"}});
 fireEvent.change(screen.getByRole("combobox",{name:"Region / city"}),{target:{value:"gta"}});
 expect(value()).toMatchObject({locationId:"gta",provinceId:"on",areaId:"gta",locationType:"AREA"});
 fireEvent.change(screen.getByRole("combobox",{name:"Neighbourhood (optional)"}),{target:{value:"scar"}});
 expect(value()).toMatchObject({location:"Scarborough",locationId:"scar",provinceId:"on",areaId:"gta",areaLabel:"Greater Toronto",locationType:"NEIGHBOURHOOD"});
 expect(toListingWriteRequest(value(),{site:"PERSONALS"})).toMatchObject({provinceId:"on",locationId:"scar"});
 fireEvent.change(screen.getByRole("combobox",{name:"Neighbourhood (optional)"}),{target:{value:""}});
 expect(value().locationId).toBe("gta");
});

test("editing neighbourhood and historical region ads preserves existing exact IDs",async()=>{
 const initial=draftFromListing({locationId:"scar",locationLabel:"Scarborough",locationType:"NEIGHBOURHOOD",provinceId:"on",provinceLabel:"Ontario",areaId:"gta",areaLabel:"Greater Toronto"});
 render(<Harness initial={initial}/>);
 fireEvent.click(screen.getByRole("button",{name:"Choose by province, region and neighbourhood"}));
 await waitFor(()=>expect(screen.getByRole("combobox",{name:"Province"}).disabled).toBe(false));
 expect(screen.getByRole("combobox",{name:"Region / city"}).value).toBe("gta");
 expect(screen.getByRole("combobox",{name:"Neighbourhood (optional)"}).value).toBe("scar");
 expect(value().locationId).toBe("scar");
 const old=draftFromListing({locationId:"gta",locationLabel:"Greater Toronto",provinceId:"on"});
 expect(old).toMatchObject({locationId:"gta",areaId:"gta",locationType:"AREA"});
});

test("search results distinguish a neighbourhood with parent region and province",async()=>{
 searchLocations.mockResolvedValue([{id:"scar",label:"Scarborough",type:"NEIGHBOURHOOD",areaId:"gta",areaLabel:"Greater Toronto",provinceId:"on",provinceLabel:"Ontario"}]);
 render(<Harness/>);
 fireEvent.change(screen.getByRole("combobox",{name:"Location"}),{target:{value:"Scar"}});
 fireEvent.click(await screen.findByRole("option",{name:"Scarborough Greater Toronto · Ontario"}));
 expect(value()).toMatchObject({locationId:"scar",areaId:"gta",provinceId:"on"});
});
