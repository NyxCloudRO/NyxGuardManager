# Task 5: explicit action presentation (DEV candidate)

This frontend-only layer applies to the accepted Task 4 image. It adds an opt-in
`data-nyx-action` attribute at audited call sites and a small theme-token stylesheet.
No global `.btn` or `button` restyling is introduced. The native button component
forwards the opt-in attribute; unmarked callers retain their existing output.

`action-registry.json` records active React, capability-gated, HTML-string and
Professional Support factory sites. Primary, secondary and destructive variants
are explicit. Navigation tabs, page links, pagination, menu triggers, selectors,
status switches and native close icons keep their accepted presentation. Shared
rule-row actions retain their native 28px geometry and use a 6px corner radius.
Other marked actions use 8px corners and retain context-specific dimensions,
padding, typography and icon gaps. All existing CSS stays unchanged.

The confirmation dialog reads an optional presentation-only `destructive` flag;
Blocked Requests supplies it for Delete history. The callback, confirmation flow,
permissions, collection and persistence are unchanged. Loading indicators and
native disabled semantics are preserved. Focus rings and reduced motion are scoped
to opted-in actions. Theme colors come from existing app/action tokens.

The patch fails if any accepted asset or Task 4 source prerequisite differs.
All JavaScript is parsed and the complete asset graph is renamed coherently for
cache invalidation. No backend, database, Agent, licensing or Nginx files are copied
or patched. Build from the release-source/5.0.14 directory:

```
docker build -f task5/Dockerfile -t nyxguardmanager:5.0.14-task5-candidate .
```

Private baseline, source-equivalence verification, real-browser captures and
acceptance evidence are under `[private operator evidence excluded from distribution]`. Deployment
and final acceptance require completing that evidence; a successful image build
alone is not visual acceptance. No production deployment or publication.

Owner-requested follow-up: genuine empty inventories in Proxy Hosts, Access Policies,
TLS & Certificates and Accounts & Roles omit the redundant empty notice/panel and
centered Add affordance. Top-right Add actions, filters, populated tables and filtered
result behavior retain their existing implementation. No records are removed.

The subsequent owner request extends the native AppPage shell to fill the available
height globally, for both empty and populated pages. `page-fill.css` uses the
established application-shell bridge, bounded scroll frame and single primary surface with normal flex growth;
there are no viewport offsets, new wrappers, navigation edits or table-row sizing.

The owner also requested matching footer clearance on every page. The existing
24px AppPage clearance now belongs to the shared dashboard viewport; per-AppPage
bottom padding is normalized to zero, preserving the accepted 24px gap without
doubling it. The native application grid still owns header/footer dimensions.

Action colors use app text/surface/accent/error tokens with tested normal, hover
and pressed contrast. A scoped loading treatment preserves transparent labels,
restores a centered meaningful spinner where legacy sweep suppression interfered,
and exposes native pending state through aria-busy on opted-in buttons only.
Reduced motion retains a static busy indicator.

The owner subsequently selected Event Center as the global scroll reference.
The existing outer frame now stays fixed with its established inset padding;
ordinary pages scroll inside their existing primary card. The native shell
observer makes that content region keyboard focusable. Event Center keeps its
existing table scroll. No extra containers or observers are introduced.
Native action dropdown carets remain intact when decorative sweeps are suppressed.

GlobalGate is the sole React AppPage caller with two sibling dashboard cards.
It opts into one plain scroll viewport around that existing card sequence,
without new decoration, changed card markup or reordered content. This prevents
one card from becoming an independent page scroller while clipping its sibling.
All other AppPage callers, including Event Center, retain the original structure.
