/** Validated application icon selection for OpenLens DevOps. */
export const applicationIconChannel = "openlens:appearance:set-application-icon";
export const applicationIconIds = ["azul", "grafito", "inverso", "negro", "blanco", "indigo", "turquesa", "verde", "violeta", "naranja", "rojo"] as const;
export type ApplicationIconId = typeof applicationIconIds[number];
export const isApplicationIconId = (value: unknown): value is ApplicationIconId =>
  typeof value === "string" && (applicationIconIds as readonly string[]).includes(value);
