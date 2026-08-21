/**
 * The four screens, in one place because both App (which switches on them) and
 * TopNav (which navigates between them) need the same list. Defining it in
 * App and importing it into TopNav would make a cycle, since App imports
 * TopNav; a three-line module is cheaper than a cycle.
 */
export type Screen = "garage" | "shop" | "setup" | "race";
