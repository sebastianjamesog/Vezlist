/**
 * The icon-chip colours, in one place rather than re-declared by every screen
 * that shows a chip.
 *
 * They are utilities from index.css rather than Tailwind palette classes
 * because the dark theme has to restate all of them: a 100-level pastel is a
 * hole punched in a dark surface, not a tint of it. `slate` is the exception —
 * it is built from tokens already, so it follows whatever theme it lands in.
 */
export const tones = {
  blue: "tone-blue",
  green: "tone-green",
  purple: "tone-purple",
  orange: "tone-orange",
  rose: "tone-rose",
  amber: "tone-amber",
  indigo: "tone-indigo",
  slate: "bg-line text-muted",
};
