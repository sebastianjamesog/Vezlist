import test from "node:test";
import assert from "node:assert/strict";
import { locationNodes, resolveLocationIds, toggleLocation, provinceLabel, locationLabel, setLocationCatalog } from "./locationCatalog.js";
import { filtersToQueryString,paramsToFilters,activeFilterChips } from "./filters.js";
const catalog={provinces:[{id:"on",label:"Ontario",areas:[{id:"gta",label:"Greater Toronto",neighbourhoods:[{id:"scar",label:"Scarborough"},{id:"central-on",label:"Central"}]}]},{id:"custom-province",label:"New Province",areas:[{id:"city",label:"New City",neighbourhoods:[{id:"central-other",label:"Central"}]}]}]};

test("hierarchy flattens with exact ancestry and resolves IDs or old labels within a province",()=>{
 assert.deepEqual(locationNodes(catalog,"on").find(row=>row.id==="scar"),{id:"scar",label:"Scarborough",type:"NEIGHBOURHOOD",areaId:"gta",areaLabel:"Greater Toronto",provinceId:"on",provinceLabel:"Ontario"});
 assert.deepEqual(resolveLocationIds(catalog,{province:"on",cities:["Greater Toronto","Scarborough"]}),["gta","scar"]);
 assert.deepEqual(resolveLocationIds(catalog,{province:"custom-province",cities:["Central"]}),["central-other"]);
 assert.deepEqual(resolveLocationIds(catalog,{province:"on",cities:["scar"]}),["scar"]);
 assert.deepEqual(resolveLocationIds(null,{province:"on",cities:["old-area"]}),["old-area"]);
});

test("selecting a neighbourhood replaces whole-region selection without changing categories",()=>{
 const nodes=locationNodes(catalog,"on");
 const selected={province:"on",cities:["gta"],categories:["Vehicles"]};
 const child=toggleLocation(catalog,selected,nodes.find(row=>row.id==="scar"));
 assert.deepEqual(child,{...selected,cities:["scar"]});
 assert.deepEqual(toggleLocation(catalog,child,nodes.find(row=>row.id==="gta")),selected);
});

test("dynamic province and neighbourhood IDs survive bookmarks and chips show their labels",()=>{
 setLocationCatalog(catalog);
 try {
  const restored=paramsToFilters(filtersToQueryString({province:"custom-province",cities:["central-other"]})).filters;
  assert.equal(restored.province,"custom-province");
  assert.deepEqual(restored.cities,["central-other"]);
  assert.equal(provinceLabel(restored.province),"New Province");
  assert.equal(locationLabel("central-other"),"Central, New City");
  assert.ok(activeFilterChips(restored).some(chip=>chip.label==="Central, New City"));
 }finally{setLocationCatalog(null);}
});
