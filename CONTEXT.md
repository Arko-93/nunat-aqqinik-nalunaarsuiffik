# Decision Geography

Greenland place identity and the Decision Geography product surfaces built on it.

## Language

**Terrain-first map**:
The main `web/` map where land relief and ocean depth are the primary visual signal, not a flat street basemap.
_Avoid_: Pretty basemap, Liberty-only map

**Meter bands**:
Ocean depth class fills plus contour metering in meters; land height classes only on high peaks (not a full land wash). Ocean layers must stay under land so islands are never painted as sea.
_Avoid_: Contours only, topography (ambiguous), bathymetry alone, land color wash on all elevations

**Offline corridor pack**:
One downloadable offline region covering Qaarsut through Kullorsuaq for family dogfood.
_Avoid_: Full Greenland offline, browser-cache-only

**Map-first UI**:
A shell where the map dominates: all gazetteer names discoverable by zoom/browse; search opens a result sheet then Overview + Sources; no lens/filter stack.
_Avoid_: List–map toggle as primary nav, Access tab, municipality/lens filters, search-only discovery
