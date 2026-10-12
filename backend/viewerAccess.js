const { getSessionWorkspaceCode, WORKSPACE_STORAGE } = require("./workspaceStorage");

// Viewer visibility is independent of the optional all-CAAL scopes on the
// Monuments and Archive pages. Caller identity comes from the server session.
// Anonymous/public access remains disabled until its disclosure rules exist.
function getViewerAccessPolicy(session) {
  const workspaceCode = getSessionWorkspaceCode(session);
  const level = Number(session?.user?.access_level ?? session?.profile?.access_level);
  const permissions = session?.permissions || {};
  const authenticated = Boolean(session?.user && [1, 2, 3, 9].includes(level));
  const configured = WORKSPACE_STORAGE[workspaceCode]?.enabled === true;
  const canRead = permissions.can_view_workspace === true ||
    permissions.can_view_national_ref === true || permissions.can_view_all_caal === true;
  const canView = authenticated && configured && canRead;
  const kind = !authenticated ? "anonymous" : workspaceCode === "caal" ? "caal" : "national";
  const scopes = !canView ? [] : kind === "caal" ? ["workspace", "all_caal"] : ["workspace", "national_ref"];
  return {
    version: 1,
    caller_kind: kind,
    visibility: canView ? kind === "caal" ? "all_caal" : "national" : "none",
    workspace_code: canView ? workspaceCode : null,
    can_view: canView,
    allowed_scopes: scopes,
    can_export_data: canView && permissions.can_export_data === true,
    can_view_record_details: canView,
    can_view_precise_geometry: canView,
    can_view_survey_metadata: canView && kind === "caal",
    can_edit_records: false,
    public_access_enabled: false
  };
}

module.exports = { getViewerAccessPolicy };
