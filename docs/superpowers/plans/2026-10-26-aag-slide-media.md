# AAG slide composition and media implementation plan

**Goal:** Integrate results into the 16:9 slide and allow useful image editing plus uploaded and linked videos.

**Design:** Use the existing HTML/CSS renderer with a proportional question/results grid, shared media element properties and streamed asset storage. A separate results popup would keep the reported composition problem; a new presentation framework would discard working editor/import behavior. Use the existing renderer and preserve video nodes during polling.

**Scope:** Images support position, dimensions, proportional resizing, fit/crop focal point, rotation, replacement and centering. Videos support MP4/WebM upload (100 MB), trusted YouTube/Rutube/VK links, playback controls, autoplay/mute/loop and start time. External frames only use canonical approved embed URLs. The projector plays video; participant phones show a deliberate video link rather than automatically downloading large files.

**Tech stack:** Existing Node HTTP/SQLite backend and plain browser JavaScript/CSS. No new runtime dependency or database migration.

- [x] Replace conflicting projector rules with proportional 16:9 composition; test long questions, 2–6 options and pie/column charts with no nested scrollbar.
- [x] Preserve media DOM between refreshes and test stable render keys.
- [x] Extend validated media properties, geometry helpers and editor controls; test containment and aspect ratio.
- [x] Add bounded video upload, canonical external URLs and byte-range streaming with authentication; test signatures, ownership, ranges and invalid URLs.
- [x] Add video rendering and controls, verify actual browser layout and persistent playback, then run API/web tests.
- [ ] Commit to codex/aag-interactive and main, deploy aag (and web only if proxy configuration changes), verify health and media resources.

Media is also supported on question slides in a dedicated region shared with results. Browser checks covered question + image + pie, six-option vertical columns, extreme text length without scrolling, image upload and saved crop/rotation, external link insertion, and actual generated WebM playback that remains paused across polling.
