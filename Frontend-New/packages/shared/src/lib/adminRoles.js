/**
 * Who is allowed to do what.
 *
 * The build plan skipped role tiers — "add tiers when a second admin persona
 * exists" — and there are now three, so here they are. One matrix, read by the
 * screens to decide what to render and by the reducer to decide what to
 * honour. Both, deliberately: a console that only hides the button still
 * performs the action when something dispatches anyway, and the reducer is the
 * one place every mutation passes through.
 *
 * Same honesty as the rest of the console: this is a real permission model
 * with no server behind it. It shapes what the UI offers and what the store
 * accepts; it is not a security boundary, because the client owns the store.
 * On a real backend this matrix moves to the server and stays here only to
 * grey out buttons.
 */

export const ROLES = {
  owner: {
    id: "owner",
    label: "Owner",
    blurb: "Everything, including other admins, taxonomy, money and settings.",
  },
  moderator: {
    id: "moderator",
    label: "Moderator",
    blurb: "The queues: ads, reports, users, live and status. Not money.",
  },
  support: {
    id: "support",
    label: "Support",
    blurb: "Tickets and the help centre. Read-only everywhere else.",
  },
};

export const ROLE_LIST = Object.values(ROLES);

const OWNER = ["owner"];
const MODS = ["owner", "moderator"];
const EVERYONE = ["owner", "moderator", "support"];

/**
 * Permission -> the roles that hold it.
 *
 * Deleting is separated from moderating throughout: approving an ad is
 * reversible and rejecting it is a conversation, but a delete is neither, so
 * it stays with the owner.
 */
export const PERMISSIONS = {
  "listing.moderate": MODS,
  "listing.edit": MODS,
  "listing.boost": MODS,
  "listing.delete": OWNER,
  "user.moderate": MODS,
  "user.verify": MODS,
  "report.decide": MODS,
  "appeal.raise": MODS,
  "appeal.decide": MODS,
  "stream.moderate": MODS,
  "status.moderate": MODS,
  "ticket.reply": EVERYONE,
  "ticket.assign": EVERYONE,
  "content.edit": ["owner", "moderator", "support"],
  "taxonomy.edit": OWNER,
  "broadcast.send": OWNER,
  "billing.manage": OWNER,
  "billing.refund": OWNER,
  "settings.edit": OWNER,
  "admins.manage": OWNER,
  "analytics.view": EVERYONE,
};

/** Can this role do this thing? */
export function can(role, permission) {
  const holders = PERMISSIONS[permission];
  // An unknown permission is denied rather than allowed — a typo in a screen
  // must not hand the whole console to Support.
  if (!holders) return false;
  return holders.includes(role);
}

/**
 * Reducer action -> the permission it needs.
 *
 * Anything absent from this map is not a privileged write: `rehydrate` is
 * storage talking to itself, and `resetToSeed` is listed because throwing away
 * the audit log is the most destructive thing the console can do.
 */
export const ACTION_PERMISSION = {
  approve: "listing.moderate",
  reject: "listing.moderate",
  expire: "listing.moderate",
  toggleVerified: "listing.moderate",
  editListing: "listing.edit",
  removePhoto: "listing.edit",
  setBoost: "listing.boost",
  deleteListing: "listing.delete",

  suspendUser: "user.moderate",
  unsuspendUser: "user.moderate",
  verifyUser: "user.verify",
  adjustCredits: "billing.manage",

  resolveReport: "report.decide",
  dismissReport: "report.decide",

  raiseAppeal: "appeal.raise",
  upholdAppeal: "appeal.decide",
  overturnAppeal: "appeal.decide",

  endStream: "stream.moderate",
  verifyHost: "stream.moderate",
  removeUpdate: "status.moderate",
  removeStory: "status.moderate",

  replyTicket: "ticket.reply",
  setTicketStatus: "ticket.reply",
  assignTicket: "ticket.assign",

  upsertFaq: "content.edit",
  deleteFaq: "content.edit",
  upsertTopic: "content.edit",
  deleteTopic: "content.edit",

  upsertCategory: "taxonomy.edit",
  deleteCategory: "taxonomy.edit",
  reorderCategories: "taxonomy.edit",
  setHomeCategories: "taxonomy.edit",
  addSubcategory: "taxonomy.edit",
  renameSubcategory: "taxonomy.edit",
  removeSubcategory: "taxonomy.edit",
  reorderSubcategory: "taxonomy.edit",
  addTerm: "taxonomy.edit",
  removeTerm: "taxonomy.edit",
  reorderTerm: "taxonomy.edit",
  addArea: "taxonomy.edit",
  removeArea: "taxonomy.edit",

  sendBroadcast: "broadcast.send",

  upsertCreditPack: "billing.manage",
  deleteCreditPack: "billing.manage",
  refundCharge: "billing.refund",

  setSetting: "settings.edit",
  resetToSeed: "settings.edit",

  upsertAdmin: "admins.manage",
  removeAdmin: "admins.manage",
};
