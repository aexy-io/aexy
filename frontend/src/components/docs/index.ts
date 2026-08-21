export { DocumentEditor } from "./DocumentEditor";
// The Word editor and viewer are exported, but `DocxEditorCanvas` deliberately is
// not: it statically imports the ~5 MB engine, and re-exporting it from a barrel
// would pull that into every module that imports anything from here.
export { DocxDocumentEditor } from "./DocxDocumentEditor";
export { DocxFileViewer } from "./DocxFileViewer";
export { DocxProposalsBanner } from "./DocxProposalsBanner";
export { EditorToolbar } from "./EditorToolbar";
export { DocumentSidebar } from "./DocumentSidebar";
export { TemplateSelector } from "./TemplateSelector";
export { CodeLinkPanel } from "./CodeLinkPanel";
export { CodeLinksDisplay } from "./CodeLinksDisplay";
export { CollaborativeEditor } from "./CollaborativeEditor";
export { CollaborationAwareness, CollaborationBadge } from "./CollaborationAwareness";
export { GitHubSyncPanel } from "./GitHubSyncPanel";
export { VersionHistoryPanel } from "./VersionHistoryPanel";
export { DocumentImprovements } from "./DocumentImprovements";
export { MergedChanges } from "./MergedChanges";
export { RepositoryScopePanel } from "./RepositoryScopePanel";

// `GenerationPanel` and `SyncStatusPanel` were removed rather than mounted.
//
// GenerationPanel's three modes each had a live equivalent by the time anyone
// looked: generate-from-code is the docs creation modal, which also records the
// code link; regenerate-from-link is "Update now" on the provenance strip. Its
// third mode, improve-existing, only ever `console.log`ged its result; that
// capability now has a UI of its own in `DocumentImprovements`, reached from the
// editor toolbar, where each suggestion is applied as a proposal rather than a
// silent rewrite.
//
// SyncStatusPanel said what the provenance strip now says, one element lower.
// Leaving both would be two statements of the same fact drifting apart.
