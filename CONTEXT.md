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

**Skær (type 143)**:
A named skerry in the NunaGIS placenames register — a recorded named coastal rock feature, not an inferred hazard or size class.
_Avoid_: Chart rock symbol, hazard mark, unnamed rock

**Ø (type 181)**:
A named island in the NunaGIS placenames register.
_Avoid_: Collapsing with skerry, island part, or island group

**Del af ø (type 182)**:
A named part of an island in the NunaGIS placenames register — not a separate island and not a skerry.
_Avoid_: Treating as whole island, skerry, or island group

**Øgruppe (type 183)**:
A named island group in the NunaGIS placenames register.
_Avoid_: Collapsing into a single island or skerry

**Official Kalaallisut name (`officialName`)**:
The sole primary map and dossier label for a place in every UI locale. NunaGIS owns this name; locale switching changes interface copy and feature-type descriptions only.
_Avoid_: Translating the primary label, appending island/fjord/ø suffixes, promoting Danish or English basemap names above it

**Alternate name**:
A Danish, historical, or other secondary spelling kept searchable and shown in the dossier as an explicitly labelled alternate below `officialName`. In search results it appears only when that alternate caused the match.
_Avoid_: Showing every alternate on every result, treating alternates as primary map labels

**Coastline mask**:
The complete OSM coastline land polygon surface unioned with Mapterhorn DEM land (> ~1 m, z12 coastal band) hides ocean depth fills, hillshade, contours, and contour labels under land. V1 interim shared shoreline: the mask matches the land hillshade by construction (no ocean paints where the DEM renders land, issue #19) and sits above every ocean layer. Bathymetry is clipped to this same shoreline before tile generation (issue #23): the self-tiled IBCAO/GEBCO depth bands and contours cannot drift from the mask. Asiaq geometry may replace both when authoritative distributable geometry arrives.
_Avoid_: Partial land fills as the mask, letting any ocean layer paint above the mask, separate coastlines for mask and bathymetry, treating OSM or the DEM as the permanent geometry authority

**Shareable URL state**:
Durable, shareable map state only: `q` (current search query) and `place` (canonical `plc_<uuid>` when crosswalk-resolved, else the NunaGIS `globalId`). The URL restores query and selection after load; unresolved `place` ids are cleared automatically once places load, never shown as a false selection. Personal and transient state stays out of the URL.
_Avoid_: Serializing sheet height, hover, download progress, offline status, animation, locale, or map viewport; deriving `place` from a name or slug
